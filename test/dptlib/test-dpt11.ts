/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import test from 'tape'
import { fromBuffer, populateAPDU, resolve } from '../../src/dptlib'
import { Datagram } from 'src/KnxClient'

function dateequals(d1: Date, d2: Date) {
	const d = d1.getDate()
	const m = d1.getMonth()
	const y = d1.getFullYear()
	return d === d2.getDate() && m === d2.getMonth() && y === d2.getFullYear()
}

test('DPT11 date conversion', function (t) {
	const tests = [
		['DPT11', [25, 12, 95], new Date('1995-12-25')],
		['DPT11', [0x19, 0x0c, 0x0f], new Date('2015-12-25')],
		['DPT11', [0x16, 0x0b, 0x10], new Date('2016-11-22')],
		['DPT11', [0x1b, 0x01, 0x13], new Date('2019-01-27')],
		['DPT11', [0x03, 0x02, 0x13], new Date('2019-02-03')],
	]
	for (let i = 0; i < tests.length; i++) {
		const dpt = resolve(tests[i][0] as string)
		const buf = Buffer.from(tests[i][1] as number[])
		const val = tests[i][2] as Date

		// unmarshalling test (raw data to value)
		const converted = fromBuffer(buf, dpt)
		t.ok(
			dateequals(val, converted),
			`${tests[i][0]} fromBuffer value ${val} => ${JSON.stringify(converted)}`,
		)

		// marshalling test (value to raw data)
		const apdu = {} as Datagram['cemi']['apdu']
		populateAPDU(val, apdu, 'dpt11')
		t.ok(
			Buffer.compare(buf, apdu.data) === 0,
			`${tests[i][0]} formatAPDU value ${val} => ${JSON.stringify(converted)}`,
		)
	}
	t.end()
})
