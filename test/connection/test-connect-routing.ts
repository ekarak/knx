/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { KnxClient } from '../../src'
import test from 'tape'

Error.stackTraceLimit = Infinity

//
test('KNX connect routing', function (t) {
	const connection = new KnxClient({
		loglevel: 'trace',
		handlers: {
			connected() {
				console.log('----------')
				console.log('Connected!')
				console.log('----------')
				t.pass('connected in routing mode')
				t.end()
				process.exit(0)
			},
			error() {
				t.fail('error connecting')
				t.end()
				process.exit(1)
			},
		},
	})
})

setTimeout(function () {
	console.log('Exiting with timeout...')
	process.exit(2)
}, 1000)
