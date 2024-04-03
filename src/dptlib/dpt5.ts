/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import type { DatapointConfig } from '.'

//
// DPT5: 8-bit unsigned value
//
// DPT5 is the only (AFAIK) DPT with scalar datatypes (5.001 and 5.003)

const config: DatapointConfig = {
	id: 'DPT5',
	basetype: {
		bitlength: 8,
		signedness: 'unsigned',
		range: [0, 255],
		valuetype: 'basic',
		desc: '8-bit unsigned value',
	},

	subtypes: {
		// 5.001 percentage (0=0..ff=100%)
		'001': {
			name: 'DPT_Scaling',
			desc: 'percent',
			unit: '%',
			scalar_range: [0, 100],
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
