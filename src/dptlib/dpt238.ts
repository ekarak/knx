/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { logger } from 'log-driver'
import type { DatapointConfig } from '.'

const log = logger

//
// DPT238: 1-byte unsigned value
//
// DPT5 is the only (AFAIK) DPT with scalar datatypes (5.001 and 5.003)
const config: DatapointConfig = {
	id: 'DPT238',
	formatAPDU: (value) => {
		const apdu_data = Buffer.from([value])
		log.trace(
			`dpt238.js : input value = ${value}   apdu_data = ${apdu_data}`,
		)
		return apdu_data
	},

	fromBuffer: (buf) => buf[0],

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
			scalar_range: [undefined, undefined],
			range: [undefined, undefined],
		},

		// 5.003 angle (degrees 0=0, ff=360)
		'003': {
			name: 'DPT_Angle',
			desc: 'angle degrees',
			unit: '°',
			scalar_range: [0, 360],
		},

		// 5.004 percentage (0..255%)
		'004': {
			name: 'DPT_Percent_U8',
			desc: 'percent',
			unit: '%',
		},

		// 5.005 ratio (0..255)
		'005': {
			name: 'DPT_DecimalFactor',
			desc: 'ratio',
			unit: 'ratio',
		},

		// 5.006 tariff (0..255)
		'006': {
			name: 'DPT_Tariff',
			desc: 'tariff',
			unit: 'tariff',
		},

		// 5.010 counter pulses (0..255)
		'010': {
			name: 'DPT_Value_1_Ucount',
			desc: 'counter pulses',
			unit: 'pulses',
		},
	},
}

export default config
