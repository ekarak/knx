/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import Log from '../KnxLog'
import type { DatapointConfig } from '.'
import { frexp, hasProp, ldexp } from '../utils'

//
// DPT213: Data Type 4x 16-Signed Value
//

function getHex(_value: number) {
	try {
		const arr = frexp(_value)
		const mantissa = arr[0]
		const exponent = arr[1]
		// find the minimum exponent that will upsize the normalized mantissa (0,5 to 1 range)
		// in order to fit in 11 bits ([-2048, 2047])
		let max_mantissa = 0
		let e: number
		for (e = exponent; e >= -15; e--) {
			max_mantissa = ldexp(100 * mantissa, e)
			if (max_mantissa > -2048 && max_mantissa < 2047) break
		}
		const sign = mantissa < 0 ? 1 : 0
		const mant = mantissa < 0 ? ~(max_mantissa ^ 2047) : max_mantissa
		const exp = exponent - e
		return [(sign << 7) + (exp << 3) + (mant >> 8), mant % 256]
	} catch (error) {
		// noop
	}
}

function getFloat(_value0: number, _value1: number) {
	const sign = _value0 >> 7
	const exponent = (_value0 & 0b01111000) >> 3
	let mantissa = 256 * (_value0 & 0b00000111) + _value1
	mantissa = sign === 1 ? ~(mantissa ^ 2047) : mantissa
	return parseFloat(ldexp(0.01 * mantissa, exponent).toPrecision(15))
}

// 07/01/2021 Supergiovane
// Send to BUS
const config: DatapointConfig = {
	id: 'DPT213',
	formatAPDU(value) {
		const apdu_data = Buffer.alloc(8) // 4 x 2 bytes

		if (
			typeof value === 'object' &&
			hasProp(value, 'Comfort') &&
			value.Comfort >= -272 &&
			value.Comfort <= 655.34 &&
			hasProp(value, 'Standby') &&
			value.Standby >= -272 &&
			value.Standby <= 655.34 &&
			hasProp(value, 'Economy') &&
			value.Economy >= -272 &&
			value.Economy <= 655.34 &&
			hasProp(value, 'BuildingProtection') &&
			value.BuildingProtection >= -272 &&
			value.BuildingProtection <= 655.34
		) {
			// Comfort
			const ArrComfort = getHex(value.Comfort)
			apdu_data[0] = ArrComfort[0]
			apdu_data[1] = ArrComfort[1]

			// Standby
			const ArrStandby = getHex(value.Standby)
			apdu_data[2] = ArrStandby[0]
			apdu_data[3] = ArrStandby[1]

			// Economy
			const ArrEconomy = getHex(value.Economy)
			apdu_data[4] = ArrEconomy[0]
			apdu_data[5] = ArrEconomy[1]

			// BuildingProtection
			const ArrBuildingProtection = getHex(value.BuildingProtection)
			apdu_data[6] = ArrBuildingProtection[0]
			apdu_data[7] = ArrBuildingProtection[1]
			// console.log(apdu_data);
			return apdu_data
		}
		Log.get().error(
			'DPT213: Must supply a payload like, for example: {Comfort:21, Standby:20, Economy:14, BuildingProtection:8}',
		)
	},

	// RX from BUS
	fromBuffer(buf) {
		if (buf.length !== 8) {
			Log.get().warn(
				'DPT213.fromBuffer: buf should be 4x2 bytes long (got %d bytes)',
				buf.length,
			)
			return null
		}
		// Preparo per l'avvento di Gozer il gozeriano.
		const nComfort = getFloat(buf[0], buf[1])
		const nStandby = getFloat(buf[2], buf[3])
		const nEconomy = getFloat(buf[4], buf[5])
		const nbProt = getFloat(buf[6], buf[7])
		return {
			Comfort: nComfort,
			Standby: nStandby,
			Economy: nEconomy,
			BuildingProtection: nbProt,
		}
	},

	// DPT213 basetype info
	basetype: {
		bitlength: 4 * 16,
		valuetype: 'basic',
		desc: '4x 16-Bit Signed Value',
	},

	// DPT213 subtypes
	subtypes: {
		100: {
			desc: 'DPT_TempRoomSetpSet[4]',
			name: 'Room temperature setpoint (Comfort, Standby, Economy, Building protection)',
			unit: '°C',
			range: [-272, 655.34],
		},
		101: {
			desc: 'DPT_TempDHWSetpSet[4]',
			name: 'Room temperature setpoint DHW (LegioProtect, Normal, Reduced, Off/FrostProtect)',
			unit: '°C',
			range: [-272, 655.34],
		},
		102: {
			desc: 'DPT_TempRoomSetpSetShift[4]',
			name: 'Room temperature setpoint shift (Comfort, Standby, Economy, Building protection)',
			unit: '°C',
			range: [-272, 655.34],
		},
	},
}

export default config
