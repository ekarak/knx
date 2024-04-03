/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import logger from '../KnxLog'
import type { DatapointConfig } from '.'

const log = logger.get()

//
// DPT20: 1-byte HVAC
//
// FIXME: help needed

const config: DatapointConfig = {
	id: 'DPT20',
	formatAPDU: (value) => {
		log.debug(`./knx/src/dpt20.js : input value = ${value}`)
		return Buffer.from([value])
	},

	fromBuffer: (buf) => {
		if (buf.length !== 1) throw Error('Buffer should be 1 bytes long')
		const ret = buf.readUInt8(0)
		log.debug(`               dpt20.js   fromBuffer : ${ret}`)
		return ret
	},

	basetype: {
		bitlength: 8,
		range: [undefined, undefined], // TODO: verify
		valuetype: 'basic',
		desc: '1-byte',
	},

	subtypes: {
		// 20.102 HVAC mode
		102: {
			name: 'HVAC_Mode',
			desc: '',
			unit: '',
			scalar_range: [undefined, undefined], // TODO: verify
			range: [undefined, undefined], // TODO: verify
		},
	},
}

export default config
