import os from 'os'
import util from 'util'
import * as ipaddr from 'ipaddr.js'
import machina from 'machina'
import { keyText, KnxConstants } from './KnxConstants'
import IpRoutingConnection from './IpRoutingConnection'
import IpTunnelingConnection from './IpTunnelingConnection'
import KnxLog, { KnxLogOptions } from './KnxLog'
import KnxNetProtocol from './KnxProtocol'
import { Writer } from 'binary-protocol'
import { Socket } from 'dgram'
import { populateAPDU } from './dptlib'
import { LogLevel } from 'log-driver'
import { hasProp } from './utils'

type KnxDeviceAddress = string

type KnxGroupAddress = string

/** The type of the KnxValue depends on the DPT that it is associated with */
type KnxValue = number | string | boolean | Date

type HandlersSpec = {
	connected?: () => void
	disconnected?: () => void
	event?: (
		evt: string,
		src: KnxDeviceAddress,
		dest: KnxGroupAddress,
		value: Buffer,
	) => void
	error?: (connstatus: any) => void
}

export type KnxOptions = {
	/** ip address of the KNX router or interface */
	ipAddr?: string
	/** port of the KNX router or interface */
	ipPort?: number
	/**  in case you need to specify the multicast interface (say if you have more than one) */
	interface?: string
	/**  the KNX physical address we'd like to use */
	physAddr?: string
	/**  set the log level for messsages printed on the console. This can be 'error', 'warn', 'info' (default), 'debug', or 'trace'. */
	loglevel?: LogLevel
	/**  do not automatically connect, but use connection.Connect() to establish connection */
	manualConnect?: boolean
	/** use tunneling with multicast (router) - this is NOT supported by all routers! See README-resilience.md */
	forceTunneling?: boolean
	/**  wait at least 10 millisec between each datagram */
	minimumDelay?: number
	/**  enable this option to suppress the acknowledge flag with outgoing L_Data.req requests. LoxOne needs this */
	suppress_ack_ldatareq?: boolean
	/** 14/03/2020 In tunneling mode, echoes the sent message by emitting a new emitEvent, so other object with same group address, can receive the sent message. Default is false. */
	localEchoInTunneling?: boolean
	/**  event handlers. You can also bind them later with connection.on(event, fn) */
	handlers?: HandlersSpec
} & KnxLogOptions

export interface Datagram {
	header_length: number
	protocol_version: number
	service_type: number
	total_length: number
	cemi?: {
		dest_addr: string
		src_addr: string
		addinfo_length?: number
		apdu: {
			apci: string
			data: any
			tpci: number
			bitlength?: number
			apdu_length?: number
			apdu_raw?: any
		}
		msgcode: number
		ctrl?: {
			frameType: number
			reserved: number
			repeat: number
			broadcast: number
			priority: number
			acknowledge: number
			confirm: number
			destAddrType: number
			hopCount: number
			extendedFrame: number
		}
	}
	tunnstate?: {
		seqnum?: number
		channel_id: number
		tunnel_endpoint: string
		rsvd?: number
	}
	tunn?: {
		protocol_type: number
		tunnel_endpoint: string
	}
	hpai?: {
		header_length?: number
		protocol_type: number
		tunnel_endpoint: string
	}
	connstate?: {
		state: number
		channel_id: number
		status?: number
	}
	cri?: {
		connection_type: number
		knx_layer: number
		unused: number
	}
}

const KnxFSM = machina.Fsm.extend({
	namespace: 'knxnet',
	initialState: 'uninitialized',
	states: {
		uninitialized: {
			'*': function () {
				this.transition('connecting')
			},
		},

		jumptoconnecting: {
			_onEnter() {
				this.transition('connecting')
			},
		},

		connecting: {
			_onEnter() {
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
			_onExit() {
				clearInterval(this.connecttimer)
			},
			inbound_CONNECT_RESPONSE(datagram: any) {
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
			inbound_CONNECTIONSTATE_RESPONSE(datagram: any) {
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
			'*': function (data: any) {
				this.log.debug(
					util.format('*** deferring Until Transition %j', data),
				)
				this.deferUntilTransition('idle')
			},
		},

		connected: {
			_onEnter() {
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
			_onEnter() {
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
			_onExit() {
				clearTimeout(this.disconnecttimer)
			},
			inbound_DISCONNECT_RESPONSE(datagram: any) {
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
			_onEnter() {
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
			_onExit() {},
			outbound_ROUTING_INDICATION(datagram: Datagram) {
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
			outbound_TUNNELING_REQUEST(datagram: Datagram) {
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
				datagram: Datagram,
			) {
				if (this.useTunneling) {
					this.transition('recvTunnReqIndication', datagram)
				}
			},
			'inbound_TUNNELING_REQUEST_L_Data.con': function (
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
				datagram: Datagram,
			) {
				this.emitEvent(datagram)
			},
			inbound_DISCONNECT_REQUEST(datagram: any) {
				if (this.useTunneling) {
					this.transition('connecting')
				}
			},
		},

		requestingConnState: {
			_onEnter() {
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
			_onExit() {
				clearTimeout(this.connstatetimer)
			},
			inbound_CONNECTIONSTATE_RESPONSE(datagram: any) {
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
			'*': function (data: any) {
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
			_onEnter(datagram: Datagram) {
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
			'*': function (data: any) {
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
			_onEnter(datagram: Datagram) {
				this.tunnelingAckTimer = setTimeout(() => {
					this.log.debug('timed out waiting for TUNNELING_ACK')
					this.transition('idle')
					this.emit('tunnelreqfailed', datagram)
				}, 2000)
			},
			_onExit() {
				clearTimeout(this.tunnelingAckTimer)
			},
			inbound_TUNNELING_ACK(datagram: Datagram) {
				this.log.debug(
					util.format(
						'===== datagram %d acknowledged by IP router',
						datagram.tunnstate.seqnum,
					),
				)
				this.transition('idle')
			},
			'*': function (data: any) {
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
			_onEnter(datagram: Datagram) {
				this.seqnumRecv = datagram.tunnstate.seqnum
				this.acknowledge(datagram)
				this.transition('idle')
				this.emitEvent(datagram)
			},
			'*': function (data: any) {
				this.log.debug(
					util.format('*** deferring Until Transition %j', data),
				)
				this.deferUntilTransition('idle')
			},
		},
	},
})

export class KnxFSMConnection extends KnxFSM {
	private options: KnxOptions

	private log: any

	private ThreeLevelGroupAddressing: boolean

	private reconnection_cycles: number

	private sentTunnRequests: { [key: string]: Datagram }

	private useTunneling: boolean

	private remoteEndpoint: {
		addrstring: string
		addr: any
		port: number
	}

	private localEchoInTunneling: boolean | undefined

	private channel_id?: any

	private conntime?: number

	private lastSentTime?: number

	private connecttimer?: NodeJS.Timeout

	private disconnecttimer?: NodeJS.Timeout

	private connstatetimer?: NodeJS.Timeout

	private idletimer?: NodeJS.Timeout

	private tunnelingAckTimer?: NodeJS.Timeout

	private seqnum: number

	private seqnumRecv: number

	private writer: Writer

	private socket: Socket

	public localAddress: string | null

	constructor(options: KnxOptions) {
		super()

		this.options = options || {}
		this.log = KnxLog.get(options)
		this.localAddress = null
		this.ThreeLevelGroupAddressing = true
		this.reconnection_cycles = 0
		this.sentTunnRequests = {}
		this.useTunneling = options.forceTunneling || false
		this.remoteEndpoint = {
			addrstring: options.ipAddr || '224.0.23.12',
			addr: ipaddr.parse(options.ipAddr || '224.0.23.12'),
			port: options.ipPort || 3671,
		}
		const range = this.remoteEndpoint.addr.range()
		this.localEchoInTunneling =
			typeof options.localEchoInTunneling !== 'undefined'
				? options.localEchoInTunneling
				: false
		this.log.debug(
			'initializing %s connection to %s',
			range,
			this.remoteEndpoint.addrstring,
		)
		switch (range) {
			case 'multicast':
				if (this.localEchoInTunneling) {
					this.localEchoInTunneling = false
					this.log.debug(
						'localEchoInTunneling: true but DISABLED because i am on multicast',
					)
				}
				IpRoutingConnection(this)
				break
			case 'unicast':
			case 'private':
			case 'loopback':
				this.useTunneling = true
				IpTunnelingConnection(this)
				break
			default:
				throw Error(
					util.format(
						'IP address % (%s) cannot be used for KNX',
						options.ipAddr,
						range,
					),
				)
		}

		if (typeof options.handlers === 'object') {
			for (const [key, value] of Object.entries(options.handlers)) {
				if (typeof value === 'function') {
					this.on(key, value)
				}
			}
		}
		// boot up the KNX connection unless told otherwise
		if (!options.manualConnect) this.Connect()
	}

	/**
	 * --------------------------------
	 * KNX FSM Utils methods
	 * --------------------------------
	 */

	acknowledge(datagram: Datagram) {
		const ack = this.prepareDatagram(
			KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
		)
		ack.tunnstate.seqnum = datagram.tunnstate.seqnum
		this.send(ack, (err: any) => {})
	}

	emitEvent(datagram: Datagram) {
		const evtName = datagram.cemi.apdu.apci
		this.emit(
			util.format('event_%s', datagram.cemi.dest_addr),
			evtName,
			datagram.cemi.src_addr,
			datagram.cemi.apdu.data,
		)
		this.emit(
			util.format('%s_%s', evtName, datagram.cemi.dest_addr),
			datagram.cemi.src_addr,
			datagram.cemi.apdu.data,
		)
		this.emit(
			evtName,
			datagram.cemi.src_addr,
			datagram.cemi.dest_addr,
			datagram.cemi.apdu.data,
		)
		this.emit(
			'event',
			evtName,
			datagram.cemi.src_addr,
			datagram.cemi.dest_addr,
			datagram.cemi.apdu.data,
		)
	}

	getLocalAddress() {
		const candidateInterfaces = this.getIPv4Interfaces()
		if (this.options && this.options.interface) {
			const iface = candidateInterfaces[this.options.interface]
			if (!iface)
				throw new Error(
					`Interface ${this.options.interface} not found or has no useful IPv4 address!`,
				)

			return candidateInterfaces[this.options.interface].address
		}
		const first = Object.values(candidateInterfaces)[0]
		if (first) return first.address

		throw Error('No valid IPv4 interfaces detected')
	}

	getIPv4Interfaces() {
		const candidateInterfaces: { [key: string]: any } = {}
		const interfaces = os.networkInterfaces()
		for (const [iface, addrs] of Object.entries(interfaces)) {
			for (const addr of addrs) {
				if ([4, 'IPv4'].indexOf(addr.family) > -1 && !addr.internal) {
					this.log.trace(
						util.format(
							'candidate interface: %s (%j)',
							iface,
							addr,
						),
					)
					candidateInterfaces[iface] = addr
				}
			}
		}
		return candidateInterfaces
	}

	BindSocket(cb: (socket: any) => void) {
		// THIS IS A STUB and should be overridden by the connection type
	}

	Connect() {
		// THIS IS A STUB and should be overridden by the connection type
	}

	/**
	 * --------------------------------
	 * Connection management methods
	 * --------------------------------
	 */

	/** Bind incoming UDP packet handler */
	onUdpSocketMessage(msg: Buffer, rinfo: any, callback: () => void): void {
		// get the incoming packet's service type ...
		try {
			const reader = KnxNetProtocol.createReader(msg)
			// TODO: improve types for binary protocol
			reader.KNXNetHeader('tmp')
			const dg = reader.next()['tmp']
			const descr = datagramDesc(dg)
			KnxLog.get().trace(
				'(%s): Received %s message: %j',
				this.compositeState(),
				descr,
				dg,
			)
			if (
				!isNaN(this.channel_id) &&
				((hasProp(dg, 'connstate') &&
					dg.connstate.channel_id !== this.channel_id) ||
					(hasProp(dg, 'tunnstate') &&
						dg.tunnstate.channel_id !== this.channel_id))
			) {
				KnxLog.get().trace(
					'(%s): *** Ignoring %s datagram for other channel (own: %d)',
					this.compositeState(),
					descr,
					this.channel_id,
				)
			} else {
				// ... to drive the state machine (eg "inbound_TUNNELING_REQUEST_L_Data.ind")
				const signal = util.format('inbound_%s', descr)
				if (descr === 'DISCONNECT_REQUEST') {
					KnxLog.get().info(
						'empty internal fsm queue due to %s: ',
						signal,
					)
					this.clearQueue()
				}
				this.handle(signal, dg)
			}
		} catch (err) {
			KnxLog.get().debug(
				'(%s): Incomplete/unparseable UDP packet: %s: %s',
				this.compositeState(),
				err,
				msg.toString('hex'),
			)
		}
	}

	AddConnState(datagram: Datagram): void {
		datagram.connstate = {
			channel_id: this.channel_id,
			state: 0,
		}
	}

	AddTunnState(datagram: Datagram): void {
		// add the remote IP router's endpoint
		datagram.tunnstate = {
			channel_id: this.channel_id,
			tunnel_endpoint: `${this.remoteEndpoint.addr}:${this.remoteEndpoint.port}`,
		}
	}

	AddCRI = (datagram: Datagram): void => {
		// add the CRI
		datagram.cri = {
			connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
			knx_layer: KnxConstants.KNX_LAYER.LINK_LAYER,
			unused: 0,
		}
	}

	AddCEMI(datagram: Datagram, msgcode?: number): void {
		const sendAck =
			(msgcode || 0x11) === 0x11 && !this.options.suppress_ack_ldatareq // only for L_Data.req
		datagram.cemi = {
			msgcode: msgcode || 0x11, // default: L_Data.req for tunneling
			ctrl: {
				frameType: 1, // 0=extended 1=standard
				reserved: 0, // always 0
				repeat: 1, // the OPPOSITE: 1=do NOT repeat
				broadcast: 1, // 0-system broadcast 1-broadcast
				priority: 3, // 0-system 1-normal 2-urgent 3-low
				acknowledge: sendAck ? 1 : 0,
				confirm: 0, // FIXME: only for L_Data.con 0-ok 1-error
				// 2nd byte
				destAddrType: 1, // FIXME: 0-physical 1-groupaddr
				hopCount: 6,
				extendedFrame: 0,
			},
			src_addr: this.options.physAddr || '15.15.15',
			dest_addr: '0/0/0', //
			apdu: {
				// default operation is GroupValue_Write
				apci: 'GroupValue_Write',
				tpci: 0,
				data: 0,
			},
		}
	}

	/*
	 * submit an outbound request to the state machine
	 *
	 * type: service type
	 * datagram_template:
	 *    if a datagram is passed, use this as
	 *    if a function is passed, use this to DECORATE
	 *    if NULL, then just make a new empty datagram. Look at AddXXX methods
	 */
	Request(
		type: number,
		datagram_template: (datagram: Datagram) => void,
		callback?: () => void,
	): void {
		// populate skeleton datagram
		const datagram = this.prepareDatagram(type)
		// decorate the datagram, if a function is passed
		if (typeof datagram_template === 'function') {
			datagram_template(datagram)
		}
		// make sure that we override the datagram service type!
		datagram.service_type = type
		const st = keyText('SERVICE_TYPE', type)
		// hand off the outbound request to the state machine
		this.handle(`outbound_${st}`, datagram)
		if (typeof callback === 'function') callback()
	}

	// prepare a datagram for the given service type
	prepareDatagram(svcType: number): Datagram {
		const datagram: Datagram = {
			header_length: 6,
			protocol_version: 16, // 0x10 == version 1.0
			service_type: svcType,
			total_length: null, // filled in automatically
		}
		//
		AddHPAI(datagram)
		//
		switch (svcType) {
			case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST:
				AddTunn(datagram)
				this.AddCRI(datagram) // no break!
			// eslint-disable-next-line no-fallthrough
			case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
			case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
				this.AddConnState(datagram)
				break
			case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
				this.AddCEMI(datagram, KnxConstants.MESSAGECODES['L_Data.ind'])
				break
			case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
				AddTunn(datagram)
				this.AddTunnState(datagram)
				this.AddCEMI(datagram)
				break
			case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
				this.AddTunnState(datagram)
				break
			default:
				KnxLog.get().debug(
					'Do not know how to deal with svc type %d',
					svcType,
				)
		}
		return datagram
	}

	/*
  send the datagram over the wire
  */
	send(datagram: Datagram, callback: (err?: Error) => void): void {
		let cemitype: string // TODO: set, but unused
		try {
			this.writer = KnxNetProtocol.createWriter()
			switch (datagram.service_type) {
				case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
				case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
					// append the CEMI service type if this is a tunneling request...
					cemitype = keyText('MESSAGECODES', datagram.cemi.msgcode)
					break
			}
			const packet = this.writer.KNXNetHeader(datagram)
			const buf = packet.buffer
			const svctype = keyText('SERVICE_TYPE', datagram.service_type) // TODO: unused
			const descr = datagramDesc(datagram)
			KnxLog.get().trace(
				'(%s): Sending %s ==> %j',
				this.compositeState(),
				descr,
				datagram,
			)
			this.socket.send(
				buf,
				0,
				buf.length,
				this.remoteEndpoint.port,
				this.remoteEndpoint.addr.toString(),
				(err) => {
					KnxLog.get().trace(
						'(%s): UDP sent %s: %s %s',
						this.compositeState(),
						err ? err.toString() : 'OK',
						descr,
						buf.toString('hex'),
					)
					if (typeof callback === 'function') callback(err)
				},
			)
		} catch (e) {
			KnxLog.get().warn(e)
			if (typeof callback === 'function') callback(e)
		}
	}

	write(
		grpaddr: string,
		value: any,
		dptid?: number,
		callback?: () => void,
	): void {
		if (grpaddr == null || value == null) {
			KnxLog.get().warn('You must supply both grpaddr and value!')
			return
		}
		try {
			// outbound request onto the state machine
			const serviceType = this.useTunneling
				? KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST
				: KnxConstants.SERVICE_TYPE.ROUTING_INDICATION
			this.Request(
				serviceType,
				(datagram: Datagram) => {
					populateAPDU(value, datagram.cemi.apdu, dptid)
					datagram.cemi.dest_addr = grpaddr
				},
				callback,
			)
		} catch (e) {
			KnxLog.get().warn(e)
		}
	}

	respond(grpaddr: string, value: any, dptid: number): void {
		if (grpaddr == null || value == null) {
			KnxLog.get().warn('You must supply both grpaddr and value!')
			return
		}
		const serviceType = this.useTunneling
			? KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST
			: KnxConstants.SERVICE_TYPE.ROUTING_INDICATION
		this.Request(serviceType, function (datagram: Datagram) {
			populateAPDU(value, datagram.cemi.apdu, dptid)
			// this is a READ request
			datagram.cemi.apdu.apci = 'GroupValue_Response'
			datagram.cemi.dest_addr = grpaddr
			return datagram
		})
	}

	writeRaw(
		grpaddr: string,
		value: Buffer,
		bitlength?: number,
		callback?: () => void,
	): void {
		if (grpaddr == null || value == null) {
			KnxLog.get().warn('You must supply both grpaddr and value!')
			return
		}
		if (!Buffer.isBuffer(value)) {
			KnxLog.get().warn('Value must be a buffer!')
			return
		}
		// outbound request onto the state machine
		const serviceType = this.useTunneling
			? KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST
			: KnxConstants.SERVICE_TYPE.ROUTING_INDICATION
		this.Request(
			serviceType,
			function (datagram: Datagram) {
				datagram.cemi.apdu.data = value
				datagram.cemi.apdu.bitlength = bitlength || value.byteLength * 8
				datagram.cemi.dest_addr = grpaddr
			},
			callback,
		)
	}

	// send a READ request to the bus
	// you can pass a callback function which gets bound to the RESPONSE datagram event
	read(grpaddr: string, callback: (src: any, data: any) => void): void {
		if (typeof callback === 'function') {
			// when the response arrives:
			const responseEvent = `GroupValue_Response_${grpaddr}`
			KnxLog.get().trace(`Binding connection to ${responseEvent}`)
			const binding = (src: any, data: any) => {
				// unbind the event handler
				this.off(responseEvent, binding)
				// fire the callback
				callback(src, data)
			}
			// prepare for the response
			this.on(responseEvent, binding)
			// clean up after 3 seconds just in case no one answers the read request
			setTimeout(() => this.off(responseEvent, binding), 3000)
		}
		const serviceType = this.useTunneling
			? KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST
			: KnxConstants.SERVICE_TYPE.ROUTING_INDICATION
		this.Request(serviceType, function (datagram: Datagram) {
			// this is a READ request
			datagram.cemi.apdu.apci = 'GroupValue_Read'
			datagram.cemi.dest_addr = grpaddr
			return datagram
		})
	}

	Disconnect(cb: () => void): void {
		if (this.state === 'connecting') {
			KnxLog.get().debug('Disconnecting directly')
			this.transition('uninitialized')
			if (cb) {
				cb()
			}
			return
		}

		KnxLog.get().debug('waiting for Idle-State')
		this.onIdle(() => {
			KnxLog.get().trace('In Idle-State')

			this.on('disconnected', () => {
				KnxLog.get().debug('Disconnected from KNX')
				if (cb) {
					cb()
				}
			})

			KnxLog.get().debug('Disconnecting from KNX')
			this.transition('disconnecting')
		})

		// machina.js removeAllListeners equivalent:
		// this.off();
	}

	onIdle(cb: () => void): void {
		if (this.state === 'idle') {
			KnxLog.get().trace('Connection is already Idle')
			cb()
		} else {
			this.on('transition', function (data: any) {
				if (data.toState === 'idle') {
					KnxLog.get().trace('Connection just transitioned to Idle')
					cb()
				}
			})
		}
	}
}

// return a descriptor for this datagram (TUNNELING_REQUEST_L_Data.ind)
const datagramDesc = (dg: Datagram): string => {
	let blurb = keyText('SERVICE_TYPE', dg.service_type)
	if (
		dg.service_type === KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST ||
		dg.service_type === KnxConstants.SERVICE_TYPE.ROUTING_INDICATION
	) {
		blurb += `_${keyText('MESSAGECODES', dg.cemi.msgcode)}`
	}
	return blurb
}

// add the control udp local endpoint. UPDATE: not needed apparnently?
const AddHPAI = (datagram: Datagram): void => {
	datagram.hpai = {
		protocol_type: 1, // UDP
		// tunnel_endpoint: this.localAddress + ":" + this.control.address().port
		tunnel_endpoint: '0.0.0.0:0',
	}
}

// add the tunneling udp local endpoint UPDATE: not needed apparently?
const AddTunn = (datagram: Datagram): void => {
	datagram.tunn = {
		protocol_type: 1, // UDP
		tunnel_endpoint: '0.0.0.0:0',
		// tunnel_endpoint: this.localAddress + ":" + this.tunnel.address().port
	}
}

export default KnxFSMConnection
