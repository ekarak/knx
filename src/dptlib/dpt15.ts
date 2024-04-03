/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import type { DatapointConfig } from '.'

//
//  DPT15.*: Access data
//

// TODO: implement fromBuffer, formatAPDU

//  DPT15 base type info

const config: DatapointConfig = {
	id: 'DPT15',
	basetype: {
		bitlength: 32,
		valuetype: 'basic',
		desc: '4-byte access control data',
	},

	//  DPT15 subtypes info
	subtypes: {
		'000': {
			name: 'DPT_Access_Data',
			desc: 'Access Data',
		},
	},
}

export default config
