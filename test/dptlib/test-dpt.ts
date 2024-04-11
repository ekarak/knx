/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import test from 'tape'
import { resolve } from '../../src/dptlib'

test('resolve', function (t) {
	t.throws(
		() => {
			resolve('invalid input')
		},
		/Invalid DPT format: .*/,
		'Invalid format of a DPT',
	)

	t.throws(
		() => {
			resolve({ dpt: 9 } as any)
		},
		/Invalid DPT format: .*/,
		'Invalid format of a DPT',
	)

	t.throws(
		() => {
			resolve([9, 9] as any)
		},
		/Invalid DPT format: .*/,
		'Invalid format of a DPT',
	)

	t.throws(
		() => {
			resolve('1111111.010')
		},
		/Unsupported DPT: .*/,
		'Unsupported/unknown DPT',
	)

	t.throws(
		() => {
			resolve(1111111)
		},
		/Unsupported DPT: .*/,
		'Unsupported/unknown Int DPT',
	)

	t.throws(
		() => {
			resolve([1111111] as any)
		},
		/Unsupported DPT: .*/,
		'Unsupported/unknown Int DPT',
	)

	const d0 = resolve(1)
	t.equal(d0.id, 'DPT1')
	t.equal(d0.subtypeid, undefined)

	const d1 = resolve('DPT9')
	t.equal(d1.id, 'DPT9')
	t.equal(d1.subtypeid, undefined)

	const d2 = resolve('DPT1.002')
	t.equal(d2.id, 'DPT1')
	t.equal(d2.subtypeid, '002')

	const d3 = resolve('DPT1.001')
	t.equal(d3.id, 'DPT1')
	t.equal(d3.subtypeid, '001')

	// Check that dpts are not destroyed by subsequent calls to resolve
	t.equal(d2.id, 'DPT1')
	t.equal(d2.subtypeid, '002')

	const d4 = resolve('1.002')
	t.equal(d4.id, 'DPT1')
	t.equal(d4.subtypeid, '002')

	t.end()
})
