/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import * as address from '../../src/Address'
import test from 'tape'

//
test('KNX physical address test', function (t) {
	const tests = {
		'0.0.0': Buffer.from([0, 0]),
		'0.0.10': Buffer.from([0, 10]),
		'0.0.255': Buffer.from([0, 255]),
		'0.1.0': Buffer.from([1, 0]),
		'1.0.0': Buffer.from([16, 0]),
		'15.14.0': Buffer.from([254, 0]),
		'15.15.0': Buffer.from([255, 0]),
	}
	Object.keys(tests).forEach((key, idx) => {
		const buf = tests[key]
		const encoded = address.parse(key, address.TYPE.PHYSICAL)
		t.ok(
			Buffer.compare(encoded, buf) === 0,
			`Marshaled KNX physical address ${key}: encoded=${encoded.toString()} buf=${buf.toString()}`,
		)
		const decoded = address.toString(encoded, address.TYPE.PHYSICAL)
		t.ok(decoded === key, `${key}: unmarshaled KNX physical address`)
	})
	// test invalid physical addresses
	const invalid = ['0.0.', '0.0.256', '123122312312312', '16.0.0', '15.17.13']
	for (const i in invalid) {
		const key = invalid[i]
		t.throws(
			() => {
				address.parse(key)
			},
			null,
			`invalid KNX physical address ${key}`,
		)
	}
	t.end()
})

//
test('KNX group address test', function (t) {
	const tests = {
		'0/0/0': Buffer.from([0, 0]),
		'0/0/10': Buffer.from([0, 10]),
		'0/0/255': Buffer.from([0, 255]),
		'0/1/0': Buffer.from([1, 0]),
		'1/0/0': Buffer.from([8, 0]),
		'1/7/0': Buffer.from([15, 0]),
		'31/6/0': Buffer.from([254, 0]),
		'31/7/0': Buffer.from([255, 0]),
	}
	Object.keys(tests).forEach((key, idx) => {
		const buf = tests[key]
		const encoded = address.parse(key, address.TYPE.GROUP)
		t.ok(
			Buffer.compare(encoded, buf) === 0,
			`Marshaled KNX group address ${key}: encoded=${encoded.toString('hex')} buf=${buf.toString('hex')}`,
		)
		const decoded = address.toString(encoded, address.TYPE.GROUP)
		t.ok(decoded === key, `${key}: unmarshaled KNX group address`)
	})

	const invalid = ['0/0/', '0/0/256', '123122312312312', '16/0/0', '15/17/13']
	for (const i in invalid) {
		const key = invalid[i]
		t.throws(
			() => {
				address.parse(key)
			},
			null,
			`invalid KNX group address ${key}`,
		)
	}
	t.end()
})
