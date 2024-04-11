/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */
import Log from '../KnxLog'
import type { DatapointConfig } from '.'

//
// DPT21: 1-byte status
//
// 001
// - OutofService b0
// - Overridden b1
// - Inalarm b2
// - AlarmUnAck b3
// - reseverd b4-7

const config: DatapointConfig = {
	id: 'DPT21',
	formatAPDU(value) {
		if (value == null)
			return Log.get().error('DPT21: cannot write null value')
		Log.get().debug(`./knx/src/dpt21.js : input value = ${value}`)

		// var apdu_data = Buffer.alloc(1);
		// apdu_data[0] = value;
		if (typeof value === 'object')
			return Buffer.from([
				value.outofservice +
					(value.fault << 1) +
					(value.overridden << 2) +
					(value.inalarm << 3) +
					(value.alarmeunack << 4),
			])

		Log.get().error('DPT21: Must supply a value which is an object')
		// return apdu_data;
		return Buffer.from([0])
	},

	fromBuffer(buf) {
		if (buf.length !== 1)
			return Log.get().error('Buffer should be 1 bytes long')
		// if (buf.length != 1) throw "Buffer should be 1 bytes long";
		Log.get().debug(`               dpt21.js   fromBuffer : ${buf}`)

		// var ret = buf.readUInt8(0);

		return {
			outofservice: buf[0] & 0b00000001,
			fault: (buf[0] & 0b00000010) >> 1,
			overridden: (buf[0] & 0b00000100) >> 2,
			inalarm: (buf[0] & 0b00001000) >> 3,
			alarmunack: (buf[0] & 0b00010000) >> 4,
		}
		// return ret;
	},
	basetype: {
		bitlength: 8,
		range: [undefined, undefined],
		valuetype: 'composite',
		desc: '1-byte',
	},
	subtypes: {
		// 21.001 status - 5 bits
		'001': {
			name: 'DPT_StatusGen',
			desc: 'General Status',
			unit: '',
			scalar_range: [undefined, undefined],
			range: [undefined, undefined],
		},
		// 21.002 control - 3 bits
		'002': {
			name: 'DPT_Device_Control',
			desc: 'Device Control',
			unit: '',
			scalar_range: [undefined, undefined],
			range: [undefined, undefined],
		},
	},
}

export default config
