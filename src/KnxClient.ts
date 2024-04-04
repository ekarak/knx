import os from 'os'
import util from 'util'
import * as ipaddr from 'ipaddr.js'
import { keyText, KnxConstants } from './KnxConstants'
import IpRoutingConnection from './IpRoutingConnection'
import IpTunnelingConnection from './IpTunnelingConnection'
import KnxLog, { KnxLogOptions } from './KnxLog'
import KnxNetProtocol from './KnxProtocol'
import { Writer } from 'binary-protocol'
import { Socket } from 'dgram'
import { populateAPDU } from './dptlib'
import { Logger, LogLevel } from 'log-driver'
import { hasProp } from './utils'
import KnxFSM from './FSM'

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

export class KnxClient extends KnxFSM {
	protected options: KnxOptions

	protected log: Logger

	protected ThreeLevelGroupAddressing: boolean

	protected reconnection_cycles: number

	protected sentTunnRequests: { [key: string]: Datagram }

	protected useTunneling: boolean

	protected remoteEndpoint: {
		addrstring: string
		addr: any
		port: number
	}

	protected localEchoInTunneling: boolean | undefined

	protected channel_id?: any

	protected conntime?: number

	protected lastSentTime?: number

	protected connecttimer?: NodeJS.Timeout

	protected disconnecttimer?: NodeJS.Timeout

	protected connstatetimer?: NodeJS.Timeout

	protected idletimer?: NodeJS.Timeout

	protected tunnelingAckTimer?: NodeJS.Timeout

	protected seqnum: number

	protected seqnumRecv: number

	protected writer: Writer

	protected socket: Socket

	protected usingMulticastTunneling: boolean

	protected minimumDelay: number

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

	/** ACK a datagram */
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

	/** prepare a datagram for the given service type */
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
				AddCRI(datagram) // no break!
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

	/**
	 * Send the datagram over the wire
	 */
	send(datagram: Datagram, callback?: (err?: Error) => void): void {
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

	/**
	 * Send a READ request to the bus
	 * you can pass a callback function which gets bound to the RESPONSE datagram event
	 * */
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

	/**
	 * Disconnect from the KNX bus
	 */
	Disconnect(cb?: () => void): void {
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

const AddCRI = (datagram: Datagram): void => {
	// add the CRI
	datagram.cri = {
		connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
		knx_layer: KnxConstants.KNX_LAYER.LINK_LAYER,
		unused: 0,
	}
}

export default KnxClient
