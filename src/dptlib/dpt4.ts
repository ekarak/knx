/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import type { DatapointConfig } from '.'

import KnxLog from '../KnxLog'

const log = KnxLog.get()
//
// DPT4: 8-bit character
//

const config: DatapointConfig = {
	id: 'DPT4',
	formatAPDU: (value: string): Buffer | void => {
		if (!value) return log.warn('DPT4: cannot write null value')

		if (typeof value !== 'string')
			return log.warn('DPT4: Must supply a character or string')

		const apdu_data: number = value.charCodeAt(0)
		if (apdu_data > 255)
			return log.warn('DPT4: must supply an ASCII character')

		return Buffer.from([apdu_data])
	},
	fromBuffer: (buf: Buffer): string | void => {
		if (buf.length !== 1)
			return log.warn('DPT4: Buffer should be 1 byte long')

		return String.fromCharCode(buf[0])
	},
	basetype: {
		bitlength: 8,
		valuetype: 'basic',
		desc: '8-bit character',
	},
	subtypes: {
		// 4.001 character (ASCII)
		'001': {
			name: 'DPT_Char_ASCII',
			desc: 'ASCII character (0-127)',
			range: [0, 127],
			use: 'G',
		},
		// 4.002 character (ISO-8859-1)
		'002': {
			name: 'DPT_Char_8859_1',
			desc: 'ISO-8859-1 character (0..255)',
			use: 'G',
		},
	},
}

export default config
