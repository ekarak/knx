import dgram from 'dgram'
import KnxLog from './KnxLog'
import type { KnxClient } from './KnxClient'

function IpTunnelingConnection(instance: KnxClient) {
	const log = KnxLog.get()

	instance.BindSocket = function BindSocket(
		cb: (socket: dgram.Socket) => void,
	) {
		const udpSocket = dgram.createSocket('udp4')
		udpSocket.bind(() => {
			log.debug(
				'IpTunnelingConnection.BindSocket %s:%d',
				instance.localAddress,
				udpSocket.address().port,
			)
			if (cb) cb(udpSocket)
		})
		return udpSocket
	}

	instance.Connect = function Connect() {
		this.localAddress = this.getLocalAddress()
		// create the socket
		this.socket = this.BindSocket((socket: dgram.Socket) => {
			socket.on('error', (errmsg: string) =>
				log.debug('Socket error: %j', errmsg),
			)
			socket.on(
				'message',
				(
					msg: Buffer,
					rinfo: dgram.RemoteInfo,
					callback: () => void,
				) => {
					log.debug('Inbound message: %s', msg.toString('hex'))
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

export default IpTunnelingConnection
