/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

/*
Datatypes
=========
KNX/EIB Function                   Information length      EIS        DPT     Value
Switch                             1 Bit                   EIS 1      DPT 1	0,1
Dimming (Position, Control, Value) 1 Bit, 4 Bit, 8 Bit     EIS 2	    DPT 3	[0,0]...[1,7]
Time                               3 Byte                  EIS 3	    DPT 10
Date                               3 Byte                  EIS 4      DPT 11
Floating point                     2 Byte                  EIS 5	    DPT 9	-671088,64 - 670760,96
8-bit unsigned value               1 Byte                  EIS 6	    DPT 5	0...255
8-bit unsigned value               1 Byte                  DPT 5.001	DPT 5.001	0...100
Blinds / Roller shutter            1 Bit                   EIS 7	    DPT 1	0,1
Priority                           2 Bit                   EIS 8	    DPT 2	[0,0]...[1,1]
IEEE Floating point                4 Byte                  EIS 9	    DPT 14	4-Octet Float Value IEEE 754
16-bit unsigned value              2 Byte                  EIS 10	    DPT 7	0...65535
16-bit signed value                2 Byte                  DPT 8	    DPT 8	-32768...32767
32-bit unsigned value              4 Byte                  EIS 11	    DPT 12	0...4294967295
32-bit signed value                4 Byte                  DPT 13	    DPT 13	-2147483648...2147483647
Access control                     1 Byte                  EIS 12	    DPT 15
ASCII character                    1 Byte                  EIS 13	    DPT 4
8859_1 character                   1 Byte                  DPT 4.002	DPT 4.002
8-bit signed value                 1 Byte                  EIS 14	    DPT 6	-128...127
14 character ASCII                 14 Byte                 EIS 15	    DPT 16
14 character 8859_1                14 Byte                 DPT 16.001	DPT 16.001
Scene                              1 Byte                  DPT 17	    DPT 17	0...63
HVAC                               1 Byte                  DPT 20	    DPT 20	0..255
Unlimited string 8859_1            .                       DPT 24	    DPT 24
List 3-byte value                  3 Byte                  DPT 232	  DPT 232	RGB[0,0,0]...[255,255,255]
*/
import * as util from 'util'
import KnxLog from '../KnxLog'

import DPT1 from './dpt1'
import DPT2 from './dpt2'
import DPT3 from './dpt3'
import DPT4 from './dpt4'
import DPT5 from './dpt5'
import DPT6 from './dpt6'
import DPT7 from './dpt7'
import DPT8 from './dpt8'
import DPT9 from './dpt9'
import DPT10 from './dpt10'
import DPT11 from './dpt11'
import DPT12 from './dpt12'
import DPT13 from './dpt13'
import DPT14 from './dpt14'
import DPT15 from './dpt15'
import DPT16 from './dpt16'
import DPT17 from './dpt17'
import DPT18 from './dpt18'
import DPT19 from './dpt19'
import DPT20 from './dpt20'
import DPT21 from './dpt21'
import DPT232 from './dpt232'
import DPT237 from './dpt237'
import DPT238 from './dpt238'
import type { Datagram } from '../KnxClient'
import { hasProp } from '../utils'

const log = KnxLog.get()

interface DatapointSubtype {
	scalar_range?: [number, number]
	name: string
	use?: string
	desc: string
	force_encoding?: string
	unit?: string
	enc?: Record<number, string>
	range?: [number, number] | [undefined, undefined]
}

export interface DatapointConfig {
	id: string
	subtypeid?: string
	basetype: {
		bitlength: number
		signedness?: string
		range?: [number, number]
		valuetype: string
		desc?: string
	}
	subtype?: DatapointSubtype
	subtypes?: Record<string, DatapointSubtype>
	formatAPDU?: (value: any) => Buffer | void
	fromBuffer?: (buf: Buffer) => any
}

const dpts: Record<string, DatapointConfig> = {
	[DPT1.id]: DPT1,
	[DPT2.id]: DPT2,
	[DPT3.id]: DPT3,
	[DPT4.id]: DPT4,
	[DPT5.id]: DPT5,
	[DPT6.id]: DPT6,
	[DPT7.id]: DPT7,
	[DPT8.id]: DPT8,
	[DPT9.id]: DPT9,
	[DPT10.id]: DPT10,
	[DPT11.id]: DPT11,
	[DPT12.id]: DPT12,
	[DPT13.id]: DPT13,
	[DPT14.id]: DPT14,
	[DPT15.id]: DPT15,
	[DPT16.id]: DPT16,
	[DPT17.id]: DPT17,
	[DPT18.id]: DPT18,
	[DPT19.id]: DPT19,
	[DPT20.id]: DPT20,
	[DPT21.id]: DPT21,
	[DPT232.id]: DPT232,
	[DPT237.id]: DPT237,
	[DPT238.id]: DPT238,
}

export function resolve(dptid: string | number): DatapointConfig {
	const m = dptid
		.toString()
		.toUpperCase()
		.match(/^(?:DPT)?(\d+)(\.(\d+))?$/)
	if (m === null) throw Error(`Invalid DPT format: ${dptid}`)

	const dptkey = util.format('DPT%s', m[1])
	const dpt = dpts[dptkey]
	if (!dpt) throw Error(`Unsupported DPT: ${dptid}`)

	const cloned_dpt = cloneDpt(dpt)
	if (m[3]) {
		cloned_dpt.subtypeid = m[3]
		cloned_dpt.subtype = cloned_dpt.subtypes[m[3]]
	}

	return cloned_dpt
}

export function populateAPDU(
	value: any,
	apdu: Datagram['cemi']['apdu'],
	dptid?: number | string,
) {
	const dpt = resolve(dptid || 'DPT1')
	const nbytes = Math.ceil(dpt.basetype.bitlength / 8)
	apdu.data = Buffer.alloc(nbytes)
	apdu.bitlength = (dpt.basetype && dpt.basetype.bitlength) || 1
	let tgtvalue = value

	if (typeof dpt.formatAPDU === 'function') {
		apdu.data = dpt.formatAPDU(value)
		return apdu
	}

	if (!isFinite(value))
		throw Error(
			util.format('Invalid value, expected a %s', dpt.basetype.desc),
		)

	const [r_min, r_max] = hasProp(dpt.basetype, 'range')
		? dpt.basetype.range
		: [0, 2 ** dpt.basetype.bitlength - 1]

	if (hasProp(dpt, 'subtype') && hasProp(dpt.subtype, 'scalar_range')) {
		const [s_min, s_max] = dpt.subtype.scalar_range
		if (value < s_min || value > s_max) {
			log.trace(
				'Value %j(%s) out of scalar range(%j) for %s',
				value,
				typeof value,
				dpt.subtype.scalar_range,
				dpt.id,
			)
		} else {
			const a = (s_max - s_min) / (r_max - r_min)
			const b = s_min - r_min
			tgtvalue = Math.round((value - b) / a)
		}
	} else if (value < r_min || value > r_max) {
		log.trace(
			'Value %j(%s) out of bounds(%j) for %s.%s',
			value,
			typeof value,
			dpt.subtype.scalar_range,
			dpt.id,
			dpt.subtypeid,
		)
	}

	if (
		hasProp(dpt.basetype, 'signedness') &&
		dpt.basetype.signedness === 'signed'
	) {
		apdu.data.writeIntBE(tgtvalue, 0, nbytes)
	} else {
		apdu.data.writeUIntBE(tgtvalue, 0, nbytes)
	}
}

export function fromBuffer(buf: Buffer, dpt: DatapointConfig) {
	if (!dpt) throw Error(util.format('DPT %s not found', dpt))

	if (typeof dpt.fromBuffer === 'function') {
		return dpt.fromBuffer(buf)
	}

	if (buf.length > 6) {
		throw Error(
			'cannot handle unsigned integers more then 6 bytes in length',
		)
	}

	let value = 0
	if (
		hasProp(dpt.basetype, 'signedness') &&
		dpt.basetype.signedness === 'signed'
	)
		value = buf.readIntBE(0, buf.length)
	else value = buf.readUIntBE(0, buf.length)

	if (hasProp(dpt, 'subtype') && hasProp(dpt.subtype, 'scalar_range')) {
		const [r_min, r_max] = hasProp(dpt.subtype, 'range')
			? dpt.basetype.range
			: [0, 2 ** dpt.basetype.bitlength - 1]
		const [s_min, s_max] = dpt.subtype.scalar_range
		const a = (s_max - s_min) / (r_max - r_min)
		const b = s_min - r_min
		value = Math.round(a * value + b)
	}

	return value
}

const cloneDpt = (d: DatapointConfig) => {
	const { fromBuffer: fb, formatAPDU: fa } = d
	return { ...JSON.parse(JSON.stringify(d)), fromBuffer: fb, formatAPDU: fa }
}

export default dpts
