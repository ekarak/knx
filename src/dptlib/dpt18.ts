/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import Log from '../KnxLog'
import type { DatapointConfig } from '.'
import { hasProp } from '../utils'

//
// DPT18: 8-bit Scene Control
//

/*
    class DPT18_Frame < DPTFrame
        bit1  :exec_learn, {
            :display_name : "Execute=0, Learn = 1"
        }
        bit1  :pad, {
            :display_name : "Reserved bit"
        }
        bit6  :data, {
            :display_name : "Scene number"
        }
    end
*/

const config: DatapointConfig = {
	id: 'DPT18',
	formatAPDU(value) {
		if (!value) Log.get().warn('DPT18: cannot write null value')
		else {
			const apdu_data = Buffer.alloc(1)
			if (
				typeof value === 'object' &&
				hasProp(value, 'save_recall') &&
				hasProp(value, 'scenenumber')
			) {
				const sSceneNumberbinary = (
					(value.scenenumber - 1) >>>
					0
				).toString(2)
				const sVal = `${
					value.save_recall
				}0${sSceneNumberbinary.padStart(6, '0')}`
				apdu_data[0] = parseInt(sVal, 2) // 0b10111111;
			} else {
				Log.get().error(
					'DPT18: Must supply a value object of {save_recall, scenenumber}',
				)
			}
			return apdu_data
		}
	},

	fromBuffer(buf) {
		if (buf.length !== 1) {
			Log.get().error('DP18: Buffer should be 1 byte long')
		} else {
			const sBit = parseInt(buf.toString('hex').toUpperCase(), 16)
				.toString(2)
				.padStart(8, '0') // Get bit from hex
			return {
				save_recall: sBit.substring(0, 1),
				scenenumber: parseInt(sBit.substring(2), 2) + 1,
			}
		}
	},
	// DPT18 basetype info
	basetype: {
		bitlength: 8,
		valuetype: 'composite',
		desc: '8-bit Scene Activate/Learn + number',
	},

	// DPT9 subtypes
	subtypes: {
		// 9.001 temperature (oC)
		'001': {
			name: 'DPT_SceneControl',
			desc: 'scene control',
		},
	},
}

export default config
