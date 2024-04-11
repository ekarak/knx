/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import util from 'util'
import ipaddr from 'ipaddr.js'
import { Parser } from 'binary-parser'
import BinaryProtocol from 'binary-protocol'
import * as KnxAddress from './Address'
import { APCICODES, keyText, KnxConstants } from './KnxConstants'
import KnxLog from './KnxLog'
import type { Datagram } from './KnxClient'

export class KnxProtocol extends BinaryProtocol {
	lengths: { [key: string]: (value: any) => number }

	twoLevelAddressing: boolean

	debug: boolean

	apduStruct: Parser

	parseDatagram(buffer: Buffer): Datagram {
		const reader = this.createReader(buffer)
		reader.KNXNetHeader('knxnet')
		return reader.next().knxnet
	}
}

const proto = new KnxProtocol()
// defaults
proto.twoLevelAddressing = false
proto.lengths = {} // TODO: Can this be a local variable, do we need to expose it?

// helper function: what is the byte length of an object?
const knxlen = (objectName: string, context: any) => {
	const lf = proto.lengths[objectName]
	return typeof lf === 'function' ? lf(context) : lf
}

proto.define('IPv4Endpoint', {
	read(propertyName: string) {
		this.pushStack({ addr: null, port: null })
			.raw('addr', 4)
			.UInt16BE('port')
			.tap((hdr) => {
				hdr.addr = ipaddr.fromByteArray(hdr.addr)
			})
			.popStack(
				propertyName,
				(data) => `${data.addr.toString()}:${data.port}`,
			)
	},
	write(value: string) {
		if (!value) throw Error('cannot write null value for IPv4Endpoint')

		if (typeof value !== 'string' || !value.match(/\d*\.\d*\.\d*\.\d*:\d*/))
			throw Error(
				"Invalid IPv4 endpoint, please set a string as  'ip.add.re.ss:port'",
			)

		const [addr, port] = value.split(':')
		this.raw(Buffer.from(ipaddr.parse(addr).toByteArray()))
		this.UInt16BE(port)
	},
})

proto.lengths['IPv4Endpoint'] = (value: string) => (value ? 6 : 0)

/* CRI: connection request/response */
// creq[22] = 0x04;  /* structure len (4 bytes) */
// creq[23] = 0x04;  /* connection type: DEVICE_MGMT_CONNECTION = 0x03; TUNNEL_CONNECTION = 0x04; */
// creq[24] = 0x02;  /* KNX Layer (Tunnel Link Layer) */
// creq[25] = 0x00;  /* Reserved */
// ==> 4 bytes
proto.define('CRI', {
	read(propertyName: string) {
		this.pushStack({
			header_length: 0,
			connection_type: null,
			knx_layer: null,
			unused: null,
		}) //
			.UInt8('header_length')
			.UInt8('connection_type')
			.UInt8('knx_layer')
			.UInt8('unused')
			.tap((hdr: Datagram['cri']) => {
				switch (hdr.connection_type) {
					case KnxConstants.CONNECTION_TYPE.DEVICE_MGMT_CONNECTION:
						break // TODO
					case KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION:
						break // TODO
					default:
						throw Error(
							`Unsupported connection type: ${hdr.connection_type}`,
						)
				}
			})
			.popStack(propertyName, (data: Datagram['cri']) => {
				if (proto.debug)
					KnxLog.get().debug(`read CRI: ${JSON.stringify(data)}`)
				// pop the interim value off the stack and insert the real value into `propertyName`
				return data
			})
	},
	write(value: Datagram['cri']) {
		if (!value)
			return KnxLog.get().warn('CRI: cannot write null value for CRI')
		this.UInt8(0x04) // length
			.UInt8(value.connection_type)
			.UInt8(value.knx_layer)
			.UInt8(value.unused)
	},
})
proto.lengths['CRI'] = (value: Datagram['cri']) => (value ? 4 : 0)

// connection state response/request
proto.define('ConnState', {
	read(propertyName: string) {
		this.pushStack({ channel_id: null, status: null })
			.UInt8('channel_id')
			.UInt8('status')
			.popStack(propertyName, (data: any) => {
				if (proto.debug) KnxLog.get().trace('read ConnState: %j', data)
				return data
			})
	},
	write(value: Datagram['connstate']) {
		if (!value)
			return KnxLog.get().error('cannot write null value for ConnState')
		this.UInt8(value.channel_id).UInt8(value.status)
	},
})
proto.lengths['ConnState'] = (value: Datagram['connstate']) => (value ? 2 : 0)

// connection state response/request
proto.define('TunnState', {
	read(propertyName: string) {
		this.pushStack({
			header_length: null,
			channel_id: null,
			seqnum: null,
			rsvd: null,
		})
			.UInt8('header_length')
			.UInt8('channel_id')
			.UInt8('seqnum')
			.UInt8('rsvd')
			.tap((hdr: any) => {
				if (proto.debug)
					KnxLog.get().trace('reading TunnState: %j', hdr)
				switch (hdr.status) {
					case 0x00:
						break
					// default: throw "Connection State status: " + hdr.status;
				}
			})
			.popStack(propertyName, (data) => data)
	},
	write(value: Datagram['tunnstate']) {
		if (!value)
			return KnxLog.get().error(
				'TunnState: cannot write null value for TunnState',
			)
		if (proto.debug) KnxLog.get().trace('writing TunnState: %j', value)
		this.UInt8(0x04)
			.UInt8(value.channel_id)
			.UInt8(value.seqnum)
			.UInt8(value.rsvd)
	},
})
proto.lengths['TunnState'] = (value: Datagram['tunnstate']) => (value ? 4 : 0)

/* Connection HPAI */
//   creq[6]     =  /* Host Protocol Address Information (HPAI) Lenght */
//   creq[7]     =  /* IPv4 protocol UDP = 0x01, TCP = 0x02; */
//   creq[8-11]  =  /* IPv4 address  */
//   creq[12-13] =  /* IPv4 local port number for CONNECTION, CONNECTIONSTAT and DISCONNECT requests */
// ==> 8 bytes

/* Tunneling HPAI */
//   creq[14]    =  /* Host Protocol Address Information (HPAI) Lenght */
//   creq[15]    =  /* IPv4 protocol UDP = 0x01, TCP = 0x02; */
//   creq[16-19] =  /* IPv4 address  */
//   creq[20-21] =  /* IPv4 local port number for TUNNELING requests */
// ==> 8 bytes
proto.define('HPAI', {
	read(propertyName: string) {
		this.pushStack({
			header_length: 8,
			protocol_type: null,
			tunnel_endpoint: null,
		})
			.UInt8('header_length')
			.UInt8('protocol_type')
			.IPv4Endpoint('tunnel_endpoint')
			.tap(function (hdr: Datagram['hpai']) {
				if (this.buffer.length < hdr.header_length) {
					if (proto.debug)
						KnxLog.get().trace(
							'%d %d %d',
							this.buffer.length,
							this.offset,
							hdr.header_length,
						)
					throw Error('Incomplete KNXNet HPAI header')
				}
				if (proto.debug) {
					KnxLog.get().trace(
						'read HPAI: %j, proto = %s',
						hdr,
						keyText('PROTOCOL_TYPE', hdr.protocol_type),
					)
				}
				switch (hdr.protocol_type) {
					case KnxConstants.PROTOCOL_TYPE.IPV4_TCP:
						throw Error('TCP is not supported')
					default:
				}
			})
			.popStack(propertyName, (data) => data)
	},
	write(value: Datagram['hpai']) {
		if (!value)
			return KnxLog.get().error('HPAI: cannot write null value for HPAI')

		this.UInt8(0x08) // length: 8 bytes
			.UInt8(value.protocol_type)
			.IPv4Endpoint(value.tunnel_endpoint)
	},
})
proto.lengths['HPAI'] = (value: Datagram['hpai']) => {
	return value ? 8 : 0
}

/* ==================== APCI ====================== */
//
//  Message Code    = 0x11 - a L_Data.req primitive
//      COMMON EMI MESSAGE CODES FOR DATA LINK LAYER PRIMITIVES
//          FROM NETWORK LAYER TO DATA LINK LAYER
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          | Data Link Layer Primitive | Message Code | Data Link Layer Service | Service Description | Common EMI Frame |
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          |        L_Raw.req          |    0x10      |                         |                     |                  |
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          |                           |              |                         | Primitive used for  | Sample Common    |
//          |        L_Data.req         |    0x11      |      Data Service       | transmitting a data | EMI frame        |
//          |                           |              |                         | frame               |                  |
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          |        L_Poll_Data.req    |    0x13      |    Poll Data Service    |                     |                  |
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          |        L_Raw.req          |    0x10      |                         |                     |                  |
//          +---------------------------+--------------+-------------------------+---------------------+------------------+
//          FROM DATA LINK LAYER TO NETWORK LAYER
//          +---------------------------+--------------+-------------------------+---------------------+
//          | Data Link Layer Primitive | Message Code | Data Link Layer Service | Service Description |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |        L_Poll_Data.con    |    0x25      |    Poll Data Service    |                     |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |                           |              |                         | Primitive used for  |
//          |        L_Data.ind         |    0x29      |      Data Service       | receiving a data    |
//          |                           |              |                         | frame               |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |        L_Busmon.ind       |    0x2B      |   Bus Monitor Service   |                     |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |        L_Raw.ind          |    0x2D      |                         |                     |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |                           |              |                         | Primitive used for  |
//          |                           |              |                         | local confirmation  |
//          |        L_Data.con         |    0x2E      |      Data Service       | that a frame was    |
//          |                           |              |                         | sent (does not mean |
//          |                           |              |                         | successful receive) |
//          +---------------------------+--------------+-------------------------+---------------------+
//          |        L_Raw.con          |    0x2F      |                         |                     |
//          +---------------------------+--------------+-------------------------+---------------------+

//  Add.Info Length = 0x00 - no additional info
//  Control Field 1 = see the bit structure above
//  Control Field 2 = see the bit structure above
//  Source Address  = 0x0000 - filled in by router/gateway with its source address which is
//                    part of the KNX subnet
//  Dest. Address   = KNX group or individual address (2 byte)
//  Data Length     = Number of bytes of data in the APDU excluding the TPCI/APCI bits
//  APDU            = Application Protocol Data Unit - the actual payload including transport
//                    protocol control information (TPCI), application protocol control
//                    information (APCI) and data passed as an argument from higher layers of
//                    the KNX communication stack

/* ==================== CEMI ====================== */

// CEMI (start at position 6)
// +--------+--------+--------+--------+----------------+----------------+--------+----------------+
// |  Msg   |Add.Info| Ctrl 1 | Ctrl 2 | Source Address | Dest. Address  |  Data  |      APDU      |
// | Code   | Length |        |        |                |                | Length |                |
// +--------+--------+--------+--------+----------------+----------------+--------+----------------+
//   1 byte   1 byte   1 byte   1 byte      2 bytes          2 bytes       1 byte      2 bytes
/*
Control Field 1
          Bit  |
         ------+---------------------------------------------------------------
           7   | Frame Type  - 0x0 for extended frame
               |               0x1 for standard frame
         ------+---------------------------------------------------------------
           6   | Reserved
         ------+---------------------------------------------------------------
           5   | Repeat Flag - 0x0 repeat frame on medium in case of an error
               |               0x1 do not repeat
         ------+---------------------------------------------------------------
           4   | System Broadcast - 0x0 system broadcast
               |                    0x1 broadcast
         ------+---------------------------------------------------------------
           3   | Priority    - 0x0 system
               |               0x1 normal
         ------+               0x2 urgent
           2   |       service_type: -1,        0x3 low
         ------+---------------------------------------------------------------
           1   | Acknowledge Request - 0x0 no ACK requested
               | (L_Data.req)          0x1 ACK requested
         ------+---------------------------------------------------------------
           0   | Confirm      - 0x0 no error
               | (L_Data.con) - 0x1 error
         ------+---------------------------------------------------------------
Control Field 2
          Bit  |
         ------+---------------------------------------------------------------
           7   | Destination Address Type - 0x0 physical address, 0x1 group address
         ------+---------------------------------------------------------------
          6-4  | Hop Count (0-7)
         ------+---------------------------------------------------------------
          3-0  | Extended Frame Format - 0x0 standard frame
         ------+---------------------------------------------------------------
*/
// In the Common EMI frame, the APDU payload is defined as follows:

// +--------+--------+--------+--------+--------+
// | TPCI + | APCI + |  Data  |  Data  |  Data  |
// |  APCI  |  Data  |        |        |        |
// +--------+--------+--------+--------+--------+
//   byte 1   byte 2  byte 3     ...     byte 16

// For data that is 6 bits or less in length, only the first two bytes are used in a Common EMI
// frame. Common EMI frame also carries the information of the expected length of the Protocol
// Data Unit (PDU). Data payload can be at most 14 bytes long.  <p>

// The first byte is a combination of transport layer control information (TPCI) and application
// layer control information (APCI). First 6 bits are dedicated for TPCI while the two least
// significant bits of first byte hold the two most significant bits of APCI field, as follows:

//   Bit 1    Bit 2    Bit 3    Bit 4    Bit 5    Bit 6    Bit 7    Bit 8      Bit 1   Bit 2
// +--------+--------+--------+--------+--------+--------+--------+--------++--------+----....
// |        |        |        |        |        |        |        |        ||        |
// |  TPCI  |  TPCI  |  TPCI  |  TPCI  |  TPCI  |  TPCI  | APCI   |  APCI  ||  APCI  |
// |        |        |        |        |        |        |(bit 1) |(bit 2) ||(bit 3) |
// +--------+--------+--------+--------+--------+--------+--------+--------++--------+----....
// +                            B  Y  T  E    1                            ||       B Y T E  2
// +-----------------------------------------------------------------------++-------------....

// Total number of APCI control bits can be either 4 or 10. The second byte bit structure is as follows:

//   Bit 1    Bit 2    Bit 3    Bit 4    Bit 5    Bit 6    Bit 7    Bit 8      Bit 1   Bit 2
// +--------+--------+--------+--------+--------+--------+--------+--------++--------+----....
// |        |        |        |        |        |        |        |        ||        |
// |  APCI  |  APCI  | APCI/  |  APCI/ |  APCI/ |  APCI/ | APCI/  |  APCI/ ||  Data  |  Data
// |(bit 3) |(bit 4) | Data   |  Data  |  Data  |  Data  | Data   |  Data  ||        |
// +--------+--------+--------+--------+--------+--------+--------+--------++--------+----....
// +                            B  Y  T  E    2                            ||       B Y T E  3
// +-----------------------------------------------------------------------++-------------....

// control field
const ctrlStruct = new Parser()
	// byte 1
	.bit1('frameType')
	.bit1('reserved')
	.bit1('repeat')
	.bit1('broadcast')
	.bit2('priority')
	.bit1('acknowledge')
	.bit1('confirm')
	// byte 2
	.bit1('destAddrType')
	.bit3('hopCount')
	.bit4('extendedFrame')

// APDU: 2 bytes, tcpi = 6 bits, apci = 4 bits, remaining 6 bits = data (when length=1)
proto.apduStruct = new Parser().bit6('tpci').bit4('apci').bit6('data')

proto.define('APDU', {
	read(propertyName: string) {
		this.pushStack({
			apdu_length: null,
			apdu_raw: null,
			tpci: null,
			apci: null,
			data: null,
		})
			.UInt8('apdu_length')
			.tap(function (hdr: Datagram['cemi']['apdu']) {
				// if (KnxProtocol.debug) KnxLog.get().trace('--- parsing extra %d apdu bytes', hdr.apdu_length+1);
				this.raw('apdu_raw', hdr.apdu_length + 1)
			})
			.tap((hdr: Datagram['cemi']['apdu']) => {
				// Parse the APDU. tcpi/apci bits split across byte boundary.
				// Typical example of protocol designed by committee.
				const apdu = proto.apduStruct.parse(hdr.apdu_raw)
				hdr.tpci = apdu.tpci
				hdr.apci = APCICODES[apdu.apci]
				// APDU data should ALWAYS be a buffer, even for 1-bit payloads
				hdr.data =
					hdr.apdu_length > 1
						? hdr.apdu_raw.slice(2)
						: Buffer.from([apdu.data])
				if (proto.debug)
					KnxLog.get().trace(' unmarshalled APDU: %j', hdr)
			})
			.popStack(propertyName, (data) => data)
	},
	write(value: Datagram['cemi']['apdu']) {
		if (!value) throw Error('cannot write null APDU value')
		const total_length = knxlen('APDU', value)
		// if (KnxProtocol.debug) KnxLog.get().trace('APDU.write: \t%j (total %d bytes)', value, total_length);
		if (APCICODES.indexOf(value.apci) === -1)
			return KnxLog.get().error('invalid APCI code: %j', value)
		if (total_length < 3)
			throw Error(
				util.format('APDU is too small (%d bytes)', total_length),
			)
		if (total_length > 17)
			throw Error(util.format('APDU is too big (%d bytes)', total_length))
		// camel designed by committee: total length MIGHT or MIGHT NOT include the payload
		//     APDU length (1 byte) + TPCI/APCI: 6+4 bits + DATA: 6 bits (2 bytes)
		// OR: APDU length (1 byte) + TPCI/APCI: 6+4(+6 unused) bits (2bytes) + DATA: (1 to 14 bytes))
		this.UInt8(total_length - 2)
		let word = value.tpci * 0x400 + APCICODES.indexOf(value.apci) * 0x40
		//
		if (total_length === 3) {
			// payload embedded in the last 6 bits
			word += parseInt(
				isFinite(value.data) && typeof value.data !== 'object'
					? value.data
					: value.data[0],
			)
			this.UInt16BE(word)
		} else {
			this.UInt16BE(word)
			// payload follows TPCI+APCI word
			// KnxLog.get().trace('~~~%s, %j, %d', typeof value.data, value.data, total_length);
			this.raw(Buffer.from(value.data, total_length - 3))
		}
	},
})

/* APDU length is truly chaotic: header and data can be interleaved (but
not always!), so that apdu_length=1 means _2_ bytes following the apdu_length */
proto.lengths['APDU'] = (value) => {
	if (!value) return 0
	// if we have the APDU bitlength, usually by the DPT, then simply use it
	if (value.bitlength || (value.data && value.data.bitlength)) {
		const bitlen = value.bitlength || value.data.bitlength
		// KNX spec states that up to 6 bits of payload must fit into the TPCI
		// if payload larger than 6 bits, than append it AFTER the TPCI
		return 3 + (bitlen > 6 ? Math.ceil(bitlen / 8) : 0)
	}
	// not all requests carry a value; eg read requests
	if (!value.data) value.data = 0
	if (value.data.length) {
		if (value.data.length < 1) throw Error('APDU value is empty')
		if (value.data.length > 14)
			throw Error('APDU value too big, must be <= 14 bytes')
		if (value.data.length === 1) {
			const v = value.data[0]
			if (!isNaN(parseFloat(v)) && isFinite(v) && v >= 0 && v <= 63) {
				// apdu_length + tpci/apci/6-bit integer == 1+2 bytes
				return 3
			}
		}
		return 3 + value.data.length
	}
	if (
		!isNaN(parseFloat(value.data)) &&
		isFinite(value.data) &&
		value.data >= 0 &&
		value.data <= 63
	) {
		return 3
	}
	KnxLog.get().warn(
		'Fix your code - APDU data payload must be a 6-bit int or an Array/Buffer (1 to 14 bytes), got: %j (%s)',
		value.data,
		typeof value.data,
	)
	throw Error(
		'APDU payload must be a 6-bit int or an Array/Buffer (1 to 14 bytes)',
	)
}

proto.define('CEMI', {
	read(propertyName: string) {
		this.pushStack({
			msgcode: 0,
			addinfo_length: -1,
			ctrl: null,
			src_addr: null,
			dest_addr: null,
			apdu: null,
		})
			.UInt8('msgcode')
			.UInt8('addinfo_length')
			.tap(function (hdr: Datagram['cemi']) {
				if (hdr.addinfo_length !== 0) {
					this.raw('addinfo', hdr.addinfo_length)
				}
			})
			.raw('ctrl', 2)
			.raw('src_addr', 2)
			.raw('dest_addr', 2)
			.tap(function (hdr: Datagram['cemi']) {
				// parse 16bit control field
				hdr.ctrl = ctrlStruct.parse(hdr.ctrl as unknown as Buffer)
				// KNX source addresses are always physical
				hdr.src_addr = KnxAddress.toString(
					hdr.src_addr,
					KnxAddress.TYPE.PHYSICAL,
				)
				hdr.dest_addr = KnxAddress.toString(
					hdr.dest_addr,
					hdr.ctrl.destAddrType,
				)
				switch (hdr.msgcode) {
					case KnxConstants.MESSAGECODES['L_Data.req']:
					case KnxConstants.MESSAGECODES['L_Data.ind']:
					case KnxConstants.MESSAGECODES['L_Data.con']: {
						this.APDU('apdu')
						if (proto.debug)
							KnxLog.get().trace(
								'--- unmarshalled APDU ==> %j',
								hdr.apdu,
							)
					}
				}
			})
			.popStack(propertyName, (data) => data)
	},
	write(value: Datagram['cemi']) {
		if (!value) throw Error('cannot write null CEMI value')
		if (proto.debug) KnxLog.get().trace('CEMI.write: \n\t%j', value)
		if (value.ctrl === null) throw Error('no Control Field supplied')
		const ctrlField1 =
			value.ctrl.frameType * 0x80 +
			value.ctrl.reserved * 0x40 +
			value.ctrl.repeat * 0x20 +
			value.ctrl.broadcast * 0x10 +
			value.ctrl.priority * 0x04 +
			value.ctrl.acknowledge * 0x02 +
			value.ctrl.confirm
		const ctrlField2 =
			value.ctrl.destAddrType * 0x80 +
			value.ctrl.hopCount * 0x10 +
			value.ctrl.extendedFrame
		this.UInt8(value.msgcode)
			.UInt8(value.addinfo_length)
			.UInt8(ctrlField1)
			.UInt8(ctrlField2)
			.raw(KnxAddress.parse(value.src_addr, KnxAddress.TYPE.PHYSICAL))
			.raw(KnxAddress.parse(value.dest_addr, value.ctrl.destAddrType))
		// only need to marshal an APDU if this is a
		// L_Data.* (requet/indication/confirmation)
		switch (value.msgcode) {
			case KnxConstants.MESSAGECODES['L_Data.req']:
			case KnxConstants.MESSAGECODES['L_Data.ind']:
			case KnxConstants.MESSAGECODES['L_Data.con']: {
				if (value.apdu === null) throw Error('no APDU supplied')
				this.APDU(value.apdu)
			}
		}
	},
})

proto.lengths['CEMI'] = (value: Datagram['cemi']) => {
	if (!value) return 0
	const apdu_length = knxlen('APDU', value.apdu)
	if (proto.debug)
		KnxLog.get().trace('knxlen of cemi: %j == %d', value, 8 + apdu_length)
	return 8 + apdu_length
}

proto.define('KNXNetHeader', {
	read(propertyName: string) {
		this.pushStack({
			header_length: 0,
			protocol_version: -1,
			service_type: -1,
			total_length: 0,
		})
			.UInt8('header_length')
			.UInt8('protocol_version')
			.UInt16BE('service_type')
			.UInt16BE('total_length')
			.tap(function (hdr: Datagram) {
				if (proto.debug)
					KnxLog.get().trace('read KNXNetHeader :%j', hdr)
				if (this.buffer.length + hdr.header_length < this.total_length)
					throw Error(
						util.format(
							'Incomplete KNXNet packet: got %d bytes (expected %d)',
							this.buffer.length + hdr.header_length,
							this.total_length,
						),
					)
				switch (hdr.service_type) {
					//        case SERVICE_TYPE.SEARCH_REQUEST:
					case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST: {
						this.HPAI('hpai').HPAI('tunn').CRI('cri')
						break
					}
					case KnxConstants.SERVICE_TYPE.CONNECT_RESPONSE:
					case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
					case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_RESPONSE:
					case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
					case KnxConstants.SERVICE_TYPE.DISCONNECT_RESPONSE: {
						this.ConnState('connstate')
						if (hdr.total_length > 8) this.HPAI('hpai')
						if (hdr.total_length > 16) this.CRI('cri')
						break
					}
					case KnxConstants.SERVICE_TYPE.DESCRIPTION_RESPONSE: {
						this.raw('value', hdr.total_length)
						break
					}
					// most common case:
					case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
						this.TunnState('tunnstate')
						this.CEMI('cemi')
						break
					case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
						this.TunnState('tunnstate')
						break
					case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
						this.CEMI('cemi')
						break
					default: {
						KnxLog.get().warn(
							'read KNXNetHeader: unhandled serviceType = %s',
							keyText('SERVICE_TYPE', hdr.service_type),
						)
					}
				}
			})
			.popStack(propertyName, (data) => {
				if (proto.debug)
					KnxLog.get().trace(JSON.stringify(data, null, 4))
				return data
			})
	},
	write(value: Datagram) {
		if (!value) throw Error('cannot write null KNXNetHeader value')
		value.total_length = knxlen('KNXNetHeader', value)
		if (proto.debug) KnxLog.get().trace('writing KnxHeader:', value)
		this.UInt8(KnxConstants.HEADER_SIZE_10) // header length (6 bytes constant)
			.UInt8(KnxConstants.KNXNETIP_VERSION_10) // protocol version 1.0
			.UInt16BE(value.service_type)
			.UInt16BE(value.total_length)
		switch (value.service_type) {
			case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST: {
				if (value.hpai) this.HPAI(value.hpai)
				if (value.tunn) this.HPAI(value.tunn)
				if (value.cri) this.CRI(value.cri)
				break
			}
			case KnxConstants.SERVICE_TYPE.CONNECT_RESPONSE:
			case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
			case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_RESPONSE:
			case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST: {
				if (value.connstate) this.ConnState(value.connstate)
				if (value.hpai) this.HPAI(value.hpai)
				if (value.cri) this.CRI(value.cri)
				break
			}
			// most common case:
			case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
			case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
			case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST: {
				if (value.tunnstate) this.TunnState(value.tunnstate)
				if (value.cemi) this.CEMI(value.cemi)
				break
			}
			// case KnxConstants.SERVICE_TYPE.DESCRIPTION_RESPONSE: {
			default: {
				throw Error(
					util.format(
						'write KNXNetHeader: unhandled serviceType = %s (%j)',
						keyText('SERVICE_TYPE', value.service_type),
						value,
					),
				)
			}
		}
	},
})
proto.lengths['KNXNetHeader'] = (value: Datagram) => {
	if (!value) throw Error('Must supply a valid KNXNetHeader value')
	switch (value.service_type) {
		// case SERVICE_TYPE.SEARCH_REQUEST:
		case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST:
			return (
				KnxConstants.HEADER_SIZE_10 +
				knxlen('HPAI', value.hpai) +
				knxlen('HPAI', value.tunn) +
				knxlen('CRI', value.cri)
			)
		case KnxConstants.SERVICE_TYPE.CONNECT_RESPONSE:
		case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
		case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_RESPONSE:
		case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
			return (
				KnxConstants.HEADER_SIZE_10 +
				knxlen('ConnState', value.connstate) +
				knxlen('HPAI', value.hpai) +
				knxlen('CRI', value.cri)
			)
		case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
		case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
			return (
				KnxConstants.HEADER_SIZE_10 +
				knxlen('TunnState', value.tunnstate) +
				knxlen('CEMI', value.cemi)
			)
		case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
			return KnxConstants.HEADER_SIZE_10 + knxlen('CEMI', value.cemi)
	}
}

export default proto
