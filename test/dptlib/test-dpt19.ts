/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import test from 'tape'
import { fromBuffer, populateAPDU, resolve } from '../../src/dptlib'
import { Datagram } from '../../src/KnxClient'

test('DPT19 datetime conversion', function (t) {
	const tests = ['1995-12-17T03:24:00', '1996-07-17T03:24:00']

	Object.keys(tests).forEach(function (key) {
		const date = new Date(tests[key])
		date.setMilliseconds(0)

		const day = date.getDay() === 0 ? 7 : date.getDay()
		const buffer = Buffer.from([
			date.getFullYear() - 1900, // year with offset 1900
			date.getMonth() + 1, // month from 1 - 12
			date.getDate(), // day of month from 1 - 31
			(day << 5) + date.getHours(), // 3 bits: day of week (1-7), 5 bits: hour
			date.getMinutes(),
			date.getSeconds(),
			0,
			0,
		])

		const name = 'DPT19'
		const dpt = resolve(name)

		// unmarshalling test (raw data to value)
		const converted = fromBuffer(buffer, dpt)
		t.equal(
			date.getTime(),
			converted.getTime(),
			`${name} fromBuffer value ${JSON.stringify(buffer)} => ${converted}`,
		)

		// marshalling test (value to raw data)
		const apdu = {} as Datagram['cemi']['apdu']
		populateAPDU(date, apdu, name)
		t.ok(
			Buffer.compare(buffer, apdu.data) === 0,
			`${name} formatAPDU value ${date} => ${JSON.stringify(apdu)}`,
		)
	})

	t.end()
})
