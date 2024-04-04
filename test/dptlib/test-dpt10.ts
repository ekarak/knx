/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import test from 'tape'
import { fromBuffer, populateAPDU, resolve } from '../../src/dptlib'
import { Datagram } from 'src/KnxClient'

function timecompare(date1, sign, date2) {
	const dow1 = date1.getDay()
	const hour1 = date1.getHours()
	const min1 = date1.getMinutes()
	const sec1 = date1.getSeconds()
	const dow2 = date2.getDay()
	const hour2 = date2.getHours()
	const min2 = date2.getMinutes()
	const sec2 = date2.getSeconds()
	if (sign === '===') {
		if (dow1 === dow2 && hour1 === hour2 && min1 === min2 && sec1 === sec2)
			return true
		return false
	}
	if (sign === '>') {
		if (dow1 > dow2) return true
		if (dow1 === dow2 && hour1 > hour2) return true
		if (dow1 === dow2 && hour1 === hour2 && min1 > min2) return true
		if (dow1 === dow2 && hour1 === hour2 && min1 === min2 && sec1 > sec2)
			return true
		return false
	}
}

test('DPT10 time conversion', function (t) {
	const tests = [
		['DPT10', [(1 << 5) + 23, 15, 30], new Date('July 1, 2019 23:15:30')], // Monday
		['DPT10', [(3 << 5) + 14, 55, 11], new Date('July 10, 2019 14:55:11')], // Wednesday
		['DPT10', [(7 << 5) + 23, 15, 30], new Date('July 7, 2019 23:15:30')], // Sunday
	]
	for (let i = 0; i < tests.length; i++) {
		const dpt = resolve(tests[i][0] as string)
		const buf = Buffer.from(tests[i][1] as number[])
		const val = tests[i][2]

		// unmarshalling test (raw data to value)
		const converted = fromBuffer(buf, dpt)
		t.ok(
			timecompare(converted, '===', val),
			`${tests[i][0]} fromBuffer value ${buf.toString('hex')} => expected ${val}, got ${converted}`,
		)

		// marshalling test (value to raw data)
		const apdu = {} as Datagram['cemi']['apdu']
		populateAPDU(val, apdu, 'dpt10')
		t.ok(
			Buffer.compare(buf, apdu.data) === 0,
			`${tests[i][0]} formatAPDU value ${val} => expected ${buf.toString('hex')}, got ${apdu.data.toString('hex')}`,
		)
	}
	t.end()
})
