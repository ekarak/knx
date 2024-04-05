/* eslint-disable no-fallthrough */
/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import Log from '../KnxLog'
import type { DatapointConfig } from '.'

//
// DPT10.*: time (3 bytes)
//
const dowTimeRegexp = /((\d)\/)?(\d{1,2}):(\d{1,2}):(\d{1,2})/

// DPTFrame to parse a DPT10 frame.
// Always 8-bit aligned.

const config: DatapointConfig = {
	id: 'DPT10',
	formatAPDU: (value) => {
		let dow: number
		let hour: number
		let minute: number
		let second: number
		// day of week. NOTE: JS Sunday = 0
		switch (typeof value) {
			case 'string':
				{
					// try to parse
					const match = dowTimeRegexp.exec(value)
					if (match) {
						const currentDoW = ((new Date().getDay() - 7) % 7) + 7
						dow =
							match[2] !== undefined
								? parseInt(match[2])
								: currentDoW
						hour = parseInt(match[3])
						minute = parseInt(match[4])
						second = parseInt(match[5])
					} else {
						Log.get().warn('DPT10: invalid time format (%s)', value)
					}
				}
				break
			case 'object':
				if (value.constructor.name !== 'Date') {
					Log.get().warn(
						'Must supply a Date or String for DPT10 time',
					)
					break
				}
			case 'number':
				value = new Date(value)

			default:
				dow = ((value.getDay() - 7) % 7) + 7
				hour = value.getHours()
				minute = value.getMinutes()
				second = value.getSeconds()
		}

		return Buffer.from([(dow << 5) + hour, minute, second])
	},

	// return a JS Date from a DPT10 payload, with DOW/hour/month/seconds set to the buffer values.
	// The week/month/year are inherited from the current timestamp.
	fromBuffer: (buf) => {
		if (buf.length !== 3) {
			Log.get().error(
				'DPT10: Buffer should be 3 bytes long, got',
				buf.length,
			)
			return null
		}

		const d = new Date()
		let dow = (buf[0] & 0b11100000) >> 5 // Day of week
		const hours = buf[0] & 0b00011111
		const minutes = buf[1]
		const seconds = buf[2]
		if (
			hours >= 0 &&
			hours <= 23 &&
			minutes >= 0 &&
			minutes <= 59 &&
			seconds >= 0 &&
			seconds <= 59
		) {
			// 18/10/2021 if dow = 0, then the KNX device has not sent this optional value.
			if (d.getDay() !== dow && dow > 0) {
				if (dow === 7) dow = 0 // 18/10/2021 fix for the Sunday
				// adjust day of month to get the day of week right
				d.setDate(d.getDate() + dow - d.getDay())
			}
			d.setHours(hours)
			d.setMinutes(minutes)
			d.setSeconds(seconds)
		} else {
			Log.get().warn(
				'DPT10: buffer %j (decoded as %d:%d:%d) is not a valid time',
				buf,
				hours,
				minutes,
				seconds,
			)
		}
		return d
	},

	// DPT10 base type info
	basetype: {
		bitlength: 24,
		valuetype: 'composite',
		desc: 'day of week + time of day',
	},

	// DPT10 subtypes info
	subtypes: {
		// 10.001 time of day
		'001': {
			name: 'DPT_TimeOfDay',
			desc: 'time of day',
		},
	},
}

export default config
