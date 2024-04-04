/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */
import { KnxClient, Datapoint } from '../../src'
import test from 'tape'
import util from 'util'
import options from './wiredtest-options'

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
test('KNX wired test - control a DPT9 timer', function (t) {
	const connection = new KnxClient({
		// debug: true,
		handlers: {
			connected: () => {
				const timer_control = new Datapoint(
					{
						ga: options.dpt9_timer_control_ga,
						dpt: 'DPT9.001',
						autoread: true,
					},
					connection,
				)
				const timer_status = new Datapoint(
					{
						ga: options.dpt9_timer_status_ga,
						dpt: 'DPT9.001',
						autoread: true,
					},
					connection,
				)
				timer_control.on('change', function (oldvalue, newvalue) {
					t.pass(
						util.format(
							'**** Timer control changed from: %j to: %j',
							oldvalue,
							newvalue,
						),
					)
				})
				timer_status.read(function (src, response) {
					t.pass(
						util.format('**** Timer status response: %j', response),
					)
					t.end()
					process.exit(0)
				})
				timer_control.write(12)
			},
		},
	})
})

setTimeout(function () {
	process.exit(1)
}, 1000)
