/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { hasProp } from 'src/utils'
import type { DatapointConfig } from '.'

import KnxLog from '../KnxLog'

const log = KnxLog.get()

interface Dpt3Value {
	decr_incr: number
	data: number
}

const config: DatapointConfig = {
	id: 'DPT3',
	formatAPDU: (value: Dpt3Value) => {
		if (value == null) return log.warn('DPT3: cannot write null value')

		if (
			typeof value === 'object' &&
			hasProp(value, 'decr_incr') &&
			hasProp(value, 'data')
		)
			return Buffer.from([
				(value.decr_incr << 3) + (value.data & 0b00000111),
			])

		log.error('Must supply a value object of {decr_incr, data}')
		// FIXME: should this return zero buffer when error? Or nothing?
		return Buffer.from([0])
	},
	fromBuffer: (buf: Buffer) => {
		if (buf.length !== 1)
			return log.error('DPT3: Buffer should be 1 byte long')

		return {
			decr_incr: (buf[0] & 0b00001000) >> 3,
			data: buf[0] & 0b00000111,
		}
	},
	basetype: {
		bitlength: 4,
		valuetype: 'composite',
		desc: '4-bit relative dimming control',
	},
	subtypes: {
		// 3.007 dimming control
		'007': {
			name: 'DPT_Control_Dimming',
			desc: 'dimming control',
		},

		// 3.008 blind control
		'008': {
			name: 'DPT_Control_Blinds',
			desc: 'blinds control',
		},
	},
}

export default config

/*
        2.6.3.5 Behavior
Status
off     dimming actuator switched off
on      dimming actuator switched on, constant brightness, at least
        minimal brightness dimming
dimming actuator switched on, moving from actual value in direction of
        set value
Events
    position = 0        off command
    position = 1        on command
    control = up dX     command, dX more bright dimming
    control = down dX   command, dX less bright dimming
    control = stop      stop command
    value = 0           dimming value = off
    value = x%          dimming value = x% (not zero)
    value_reached       actual value reached set value

The step size dX for up and down dimming may be 1/1, 1/2, 1/4, 1/8, 1/16, 1/32 and 1/64 of
the full dimming range (0 - FFh).

3.007 dimming control
3.008 blind control
*/
