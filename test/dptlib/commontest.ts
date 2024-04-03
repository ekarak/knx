/* eslint-disable no-prototype-builtins */
/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import test, { Test } from 'tape'
import DPTLib, { fromBuffer, populateAPDU, resolve } from '../../src/dptlib'
import { Datagram } from '../../src/FSM'

/* common DPT unit test. Tries to
- 1. marshal a JS value into an apdu.data (Buffer) and compare it output to the expected value
- 2. unmarshal the produced APDU from step 1 and compare it to the initial JS value
- 3. unmarshal the expected APDU from the test definition and compare it to the initial JS value
*/

// marshalling test (JS value to APDU)
function marshalTest(t: Test, dptid: string | number, jsval: any, apdu: any) {
	const marshalled = {} as Datagram['cemi']['apdu']
	populateAPDU(jsval, marshalled, dptid)
	// console.log('%j --> %j', apdu.constructor.name, marshalled.data)
	t.deepEqual(
		marshalled.data,
		apdu,
		`${dptid}.populateAPDU(${jsval}:${typeof jsval}) should be marshalled as "0x${apdu.toString(
			'hex',
		)}", got: "0x${marshalled.data.toString('hex')}"`,
	)
	return marshalled.data
}

function unmarshalTest(t, dptid, jsval, data) {
	const dpt = resolve(dptid)
	const unmarshalled = fromBuffer(data, dpt)
	// console.log('%s: %j --> %j', dpt.id, rhs, converted);
	const msg = `${dptid}.fromBuffer(${JSON.stringify(
		data,
	)}) should unmarshall to ${JSON.stringify(jsval)}, got: ${JSON.stringify(
		unmarshalled,
	)}`
	switch (typeof jsval) {
		case 'object':
			t.deepEqual(unmarshalled, jsval, msg)
			break
		case 'number':
			t.equal(unmarshalled, jsval, msg)
			break
		default:
			t.ok(unmarshalled === jsval, msg)
	}
}

// eslint-disable-next-line import/prefer-default-export
export function run(
	dptid: number | string,
	tests: { apdu_data: number[]; jsval: any }[],
) {
	const dpt = resolve(dptid)
	const desc =
		(dpt.hasOwnProperty('subtype') && dpt.subtype.desc) || dpt.basetype.desc
	test(`${dptid}: ${desc}`, function (t) {
		Object.keys(tests).forEach(function (key) {
			const apdu = Buffer.from(tests[key].apdu_data)
			const jsval = tests[key].jsval
			// console.log(dptid + ': apdu=%j jsval=%j', apdu, jsval);
			// 1. marshalling test (JS value to APDU)
			const marshalled_data = marshalTest(t, dptid, jsval, apdu)
			// 2. unmarshal from APDU produced by step 1
			unmarshalTest(t, dptid, jsval, marshalled_data)
			// 3. unmarshal from test APDU
			unmarshalTest(t, dptid, jsval, apdu)
		})
		t.end()
	})
}
