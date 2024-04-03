import * as util from 'util'
import * as dgram from 'dgram'
import KnxLog from './KnxLog'
import type { KnxFSMConnection } from './FSM'

function IpRoutingConnection(instance: KnxFSMConnection): KnxFSMConnection {
	const log = KnxLog.get()

	instance.BindSocket = (cb: (socket: dgram.Socket) => void) => {
		const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
		udpSocket.on('listening', () => {
			log.debug(
				util.format(
					'IpRoutingConnection %s:%d, adding membership for %s',
					instance.localAddress,
					udpSocket.address().port,
					this.remoteEndpoint.addr,
				),
			)
			try {
				this.socket.addMembership(
					this.remoteEndpoint.addr,
					instance.localAddress,
				)
			} catch (err) {
				log.warn(
					'IPRouting connection: cannot add membership (%s)',
					err,
				)
			}
		})
		// ROUTING multicast connections need to bind to the default port, 3671
		udpSocket.bind(3671, () => cb && cb(udpSocket))
		return udpSocket
	}

	// <summary>
	///     Start the connection
	/// </summary>
	instance.Connect = () => {
		this.localAddress = this.getLocalAddress()
		this.socket = this.BindSocket((socket: dgram.Socket) => {
			socket.on('error', (errmsg: string) =>
				log.debug(util.format('Socket error: %j', errmsg)),
			)
			socket.on(
				'message',
				(
					msg: Buffer,
					rinfo: dgram.RemoteInfo,
					callback: () => void,
				) => {
					log.debug(
						`Inbound multicast message from ${
							rinfo.address
						}: ${msg.toString('hex')}`,
					)
					this.onUdpSocketMessage(msg, rinfo, callback)
				},
			)
			// start connection sequence
			this.transition('connecting')
		})
		return this
	}

	return instance
}

export default IpRoutingConnection
