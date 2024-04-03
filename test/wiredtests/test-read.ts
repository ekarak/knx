/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { Connection, Datapoint } from '../../src'
import test from 'tape'
import util from 'util'
import options from './wiredtest-options'

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
test('KNX wired test - read a temperature', function (t) {
	const connection = new Connection({
		debug: true,
		physAddr: options.physAddr,
		handlers: {
			connected() {
				//  just define a temperature GA that should respond to a a GroupValue_Read request
				const temperature_in = new Datapoint(
					{
						ga: options.dpt9_temperature_status_ga,
						dpt: 'DPT9.001',
					},
					connection,
				)
				temperature_in.read(function (src, response) {
					console.log('KNX response from %s: %j', src, response)
					t.pass(util.format('read temperature:  %s', response))
					t.end()
					process.exit(0)
				})
			},
			error(connstatus) {
				console.log(
					'%s **** ERROR: %j',
					new Date()
						.toISOString()
						.replace(/T/, ' ')
						.replace(/Z$/, ''),
					connstatus,
				)
				process.exit(1)
			},
		},
	})
})

setTimeout(function () {
	console.log('Exiting ...')
	process.exit(2)
}, 1500)
