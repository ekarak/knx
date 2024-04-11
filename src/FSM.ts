import type { KnxClient, Datagram } from './KnxClient'
import { KnxConstants, keyText } from './KnxConstants'
import KnxLog from './KnxLog'
import { hasProp } from './utils'
import machina from 'machina'
import util from 'util'

const KnxFSM = machina.Fsm.extend({
	namespace: 'knxnet',
	initialState: 'uninitialized',
	states: {
		uninitialized: {
			'*': function (this: KnxClient) {
				this.transition('connecting')
			},
		},

		jumptoconnecting: {
			_onEnter(this: KnxClient) {
				this.transition('connecting')
			},
		},

		connecting: {
			_onEnter(this: KnxClient) {
				this.emit('disconnected')
				this.log.debug(
					util.format('useTunneling=%j', this.useTunneling),
				)
				if (this.useTunneling) {
					let connection_attempts = 0
					if (!this.localAddress)
						throw Error(
							'Not bound to an IPv4 non-loopback interface',
						)
					this.log.debug(
						util.format('Connecting via %s...', this.localAddress),
					)
					this.connecttimer = setInterval(() => {
						connection_attempts += 1
						if (connection_attempts >= 3) {
							clearInterval(this.connecttimer)
							if (
								this.remoteEndpoint.addr.range() === 'multicast'
							) {
								this.log.warn(
									'connection timed out, falling back to pure routing mode...',
								)
								this.usingMulticastTunneling = true
								this.transition('connected')
							} else {
								this.reconnection_cycles += 1
								const delay = Math.min(
									this.reconnection_cycles * 3,
									300,
								)
								this.log.debug(
									`reattempting connection in ${delay} seconds`,
								)
								setTimeout(
									() => this.transition('jumptoconnecting'),
									delay * 1000,
								)
							}
						} else {
							this.log.warn('connection timed out, retrying...')
							this.send(
								this.prepareDatagram(
									KnxConstants.SERVICE_TYPE.CONNECT_REQUEST,
								),
							)
						}
					}, 3000)
					delete this.channel_id
					delete this.conntime
					delete this.lastSentTime
					this.send(
						this.prepareDatagram(
							KnxConstants.SERVICE_TYPE.CONNECT_REQUEST,
						),
					)
				} else {
					this.transition('connected')
				}
			},
			_onExit(this: KnxClient) {
				clearInterval(this.connecttimer)
			},
			inbound_CONNECT_RESPONSE(this: KnxClient, datagram: any) {
				this.log.debug(util.format('got connect response'))
				if (
					hasProp(datagram, 'connstate') &&
					datagram.connstate.status ===
						KnxConstants.RESPONSECODE.E_NO_MORE_CONNECTIONS
				) {
					try {
						this.socket.close()
					} catch (error) {
						// noop
					}
					this.transition('uninitialized')
					this.emit('disconnected')
					this.log.debug(
						'The KNXnet/IP server rejected the data connection (Maximum connections reached). Waiting 1 minute before retrying...',
					)
					setTimeout(() => {
						this.Connect()
					}, 60000)
				} else {
					this.channel_id = datagram.connstate.channel_id
					this.send(
						this.prepareDatagram(
							KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST,
						),
					)
				}
			},
			inbound_CONNECTIONSTATE_RESPONSE(this: KnxClient, datagram: any) {
				if (this.useTunneling) {
					const str = keyText(
						'RESPONSECODE',
						datagram.connstate.status,
					)
					this.log.debug(
						util.format(
							'Got connection state response, connstate: %s, channel ID: %d',
							str,
							datagram.connstate.channel_id,
						),
					)
					this.transition('connected')
				}
			},
			'*': function (this: KnxClient, data: any) {
				this.log.debug(
					util.format('*** deferring Until Transition %j', data),
				)
				this.deferUntilTransition('idle')
			},
		},

		connected: {
			_onEnter(this: KnxClient) {
				this.reconnection_cycles = 0
				this.seqnum = -1
				this.lastSentTime = Date.now()
				this.conntime = this.lastSentTime
				this.log.debug(
					util.format(
						'--- Connected in %s mode ---',
						this.useTunneling ? 'TUNNELING' : 'ROUTING',
					),
				)
				this.transition('idle')
				this.emit('connected')
			},
		},

		disconnecting: {
			_onEnter(this: KnxClient) {
				if (this.useTunneling) {
					const aliveFor = this.conntime
						? Date.now() - this.conntime
						: 0
					KnxLog.get().debug(
						'(%s):\tconnection alive for %d seconds',
						this.compositeState(),
						aliveFor / 1000,
					)
					this.disconnecttimer = setTimeout(() => {
						KnxLog.get().debug(
							'(%s):\tconnection timed out',
							this.compositeState(),
						)
						try {
							this.socket.close()
						} catch (error) {
							// noop
						}
						this.transition('uninitialized')
						this.emit('disconnected')
					}, 3000)
					this.send(
						this.prepareDatagram(
							KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST,
						),
						(err: any) => {
							KnxLog.get().debug(
								'(%s):\tsent DISCONNECT_REQUEST',
								this.compositeState(),
							)
						},
					)
				}
			},
			_onExit(this: KnxClient) {
				clearTimeout(this.disconnecttimer)
			},
			inbound_DISCONNECT_RESPONSE(this: KnxClient, datagram: any) {
				if (this.useTunneling) {
					KnxLog.get().debug(
						'(%s):\tgot disconnect response',
						this.compositeState(),
					)
					try {
						this.socket.close()
					} catch (error) {
						// noop
					}
					this.transition('uninitialized')
					this.emit('disconnected')
				}
			},
		},

		idle: {
			_onEnter(this: KnxClient) {
				if (this.useTunneling) {
					if (this.idletimer == null) {
						this.idletimer = setTimeout(() => {
							this.transition('requestingConnState')
							clearTimeout(this.idletimer)
							this.idletimer = null
						}, 60000)
					}
				}
				KnxLog.get().debug(
					'(%s):\t%s',
					this.compositeState(),
					' zzzz...',
				)
				this.processQueue()
			},
			_onExit(this: KnxClient) {},
			outbound_ROUTING_INDICATION(this: KnxClient, datagram: Datagram) {
				const elapsed = Date.now() - this.lastSentTime
				if (
					!this.options.minimumDelay ||
					elapsed >= this.options.minimumDelay
				) {
					this.transition('sendDatagram', datagram)
				} else {
					setTimeout(
						() =>
							this.handle(
								'outbound_ROUTING_INDICATION',
								datagram,
							),
						this.minimumDelay - elapsed,
					)
				}
			},
			outbound_TUNNELING_REQUEST(this: KnxClient, datagram: Datagram) {
				if (this.useTunneling) {
					const elapsed = Date.now() - this.lastSentTime
					if (
						!this.options.minimumDelay ||
						elapsed >= this.options.minimumDelay
					) {
						this.transition('sendDatagram', datagram)
					} else {
						setTimeout(
							() =>
								this.handle(
									'outbound_TUNNELING_REQUEST',
									datagram,
								),
							this.minimumDelay - elapsed,
						)
					}
				} else {
					KnxLog.get().debug(
						"(%s):\tdropping outbound TUNNELING_REQUEST, we're in routing mode",
						this.compositeState(),
					)
				}
			},
			'inbound_TUNNELING_REQUEST_L_Data.ind': function (
				this: KnxClient,
				datagram: Datagram,
			) {
				if (this.useTunneling) {
					this.transition('recvTunnReqIndication', datagram)
				}
			},
			'inbound_TUNNELING_REQUEST_L_Data.con': function (
				this: KnxClient,
				datagram: Datagram,
			) {
				if (this.useTunneling) {
					const confirmed =
						this.sentTunnRequests[datagram.cemi.dest_addr]
					if (confirmed) {
						delete this.sentTunnRequests[datagram.cemi.dest_addr]
						this.emit('confirmed', confirmed)
					}
					KnxLog.get().trace(
						'(%s): %s %s',
						this.compositeState(),
						datagram.cemi.dest_addr,
						confirmed
							? 'delivery confirmation (L_Data.con) received'
							: 'unknown dest addr',
					)
					this.acknowledge(datagram)
				}
			},
			'inbound_ROUTING_INDICATION_L_Data.ind': function (
				this: KnxClient,
				datagram: Datagram,
			) {
				this.emitEvent(datagram)
			},
			inbound_DISCONNECT_REQUEST(this: KnxClient, datagram: any) {
				if (this.useTunneling) {
					this.transition('connecting')
				}
			},
		},

		requestingConnState: {
			_onEnter(this: KnxClient) {
				KnxLog.get().debug('Requesting Connection State')
				KnxLog.get().trace(
					'(%s): Requesting Connection State',
					this.compositeState(),
				)
				this.send(
					this.prepareDatagram(
						KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST,
					),
				)
				this.connstatetimer = setTimeout(() => {
					const msg = 'timed out waiting for CONNECTIONSTATE_RESPONSE'
					KnxLog.get().trace('(%s): %s', this.compositeState(), msg)
					this.transition('connecting')
					this.emit('error', msg)
				}, 1000)
			},
			_onExit(this: KnxClient) {
				clearTimeout(this.connstatetimer)
			},
			inbound_CONNECTIONSTATE_RESPONSE(this: KnxClient, datagram: any) {
				const state = keyText('RESPONSECODE', datagram.connstate.status)
				switch (datagram.connstate.status) {
					case 0:
						this.transition('idle')
						break
					default:
						this.log.debug(
							util.format(
								'*** error: %s *** (connstate.code: %d)',
								state,
								datagram.connstate.status,
							),
						)
						this.transition('connecting')
						this.emit('error', state)
				}
			},
			'*': function (this: KnxClient, data: any) {
				this.log.debug(
					util.format(
						'*** deferring %s until transition from requestingConnState => idle',
						data.inputType,
					),
				)
				this.deferUntilTransition('idle')
			},
		},

		sendDatagram: {
			_onEnter(this: KnxClient, datagram: Datagram) {
				this.seqnum += 1
				if (this.useTunneling)
					datagram.tunnstate.seqnum = this.seqnum & 0xff
				this.send(datagram, (err: any) => {
					if (err) {
						this.seqnum -= 1
						this.transition('idle')
					} else {
						if (this.useTunneling)
							this.sentTunnRequests[datagram.cemi.dest_addr] =
								datagram
						this.lastSentTime = Date.now()
						this.log.debug(
							'(%s):\t>>>>>>> successfully sent seqnum: %d',
							this.compositeState(),
							this.seqnum,
						)
						if (this.useTunneling) {
							this.transition('sendTunnReq_waitACK', datagram)
						} else {
							this.transition('idle')
						}
					}
				})
			},
			'*': function (this: KnxClient, data: any) {
				this.log.debug(
					util.format(
						'*** deferring %s until transition sendDatagram => idle',
						data.inputType,
					),
				)
				this.deferUntilTransition('idle')
			},
		},
		sendTunnReq_waitACK: {
			_onEnter(this: KnxClient, datagram: Datagram) {
				this.tunnelingAckTimer = setTimeout(() => {
					this.log.debug('timed out waiting for TUNNELING_ACK')
					this.transition('idle')
					this.emit('tunnelreqfailed', datagram)
				}, 2000)
			},
			_onExit(this: KnxClient) {
				clearTimeout(this.tunnelingAckTimer)
			},
			inbound_TUNNELING_ACK(this: KnxClient, datagram: Datagram) {
				this.log.debug(
					util.format(
						'===== datagram %d acknowledged by IP router',
						datagram.tunnstate.seqnum,
					),
				)
				this.transition('idle')
			},
			'*': function (this: KnxClient, data: any) {
				this.log.debug(
					util.format(
						'*** deferring %s until transition sendTunnReq_waitACK => idle',
						data.inputType,
					),
				)
				this.deferUntilTransition('idle')
			},
		},
		recvTunnReqIndication: {
			_onEnter(this: KnxClient, datagram: Datagram) {
				this.seqnumRecv = datagram.tunnstate.seqnum
				this.acknowledge(datagram)
				this.transition('idle')
				this.emitEvent(datagram)
			},
			'*': function (this: KnxClient, data: any) {
				this.log.debug(
					util.format('*** deferring Until Transition %j', data),
				)
				this.deferUntilTransition('idle')
			},
		},
	},
})

export default KnxFSM
