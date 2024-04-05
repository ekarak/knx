/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { logger } from 'log-driver'
import type { DatapointConfig } from '.'

const log = logger

//
// DPT20: 1-byte HVAC
//
// FIXME: help needed

const config: DatapointConfig = {
	id: 'DPT20',
	formatAPDU: (value) => {
		const apdu_data = Buffer.alloc(1)
		apdu_data[0] = value
		log.debug(
			`./knx/src/dpt20.js : input value = ${value}   apdu_data = ${apdu_data}`,
		)
		return apdu_data
	},

	fromBuffer: (buf) => {
		if (buf.length !== 1) {
			log.warn('DPT20: Buffer should be 1 byte long, got', buf.length)
			return null
		}
		const ret = buf.readUInt8(0)
		return ret
	},

	basetype: {
		bitlength: 8,
		range: [undefined, undefined],
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
