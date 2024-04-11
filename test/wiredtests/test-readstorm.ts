/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { KnxClient, Datapoint } from '../../src'
import test from 'tape'
import util from 'util'
import options from './wiredtest-options.js'

Error.stackTraceLimit = Infinity

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
test('KNX wired test - read multiple statuses from a consecutive GA range', function (t) {
	const readback = {}
	function setupDatapoint(groupadress: string, statusga: string) {
		const dp = new Datapoint(
			{
				ga: groupadress,
				status_ga: statusga,
				dpt: 'DPT1.001',
				autoread: true,
			},
			connection,
		)
		dp.on('change', (oldvalue, newvalue) => {
			console.log('**** %s current value: %j', groupadress, newvalue)
		})
		return dp
	}
	function setupDatapoints() {
		const ctrl_ga_arr = options.readstorm_control_ga_start.split('/')
		const stat_ga_arr = options.readstorm_status_ga_start.split('/')
		for (let i = 0; i < options.readstorm_range; i++) {
			const ctrl_ga = [
				ctrl_ga_arr[0],
				ctrl_ga_arr[1],
				i + parseInt(ctrl_ga_arr[2]),
			].join('/')
			const stat_ga = [
				stat_ga_arr[0],
				stat_ga_arr[1],
				i + parseInt(stat_ga_arr[2]),
			].join('/')
			setupDatapoint(ctrl_ga, stat_ga)
		}
	}
	const connection = new KnxClient({
		loglevel: 'warn',
		// forceTunneling: true,
		//      minimumDelay: 100,
		handlers: {
			connected() {
				setupDatapoints()
			},
			event(evt, src, dest, value) {
				if (evt === 'GroupValue_Response') {
					readback[dest] = [src, value]
					// have we got responses from all the read requests for all datapoints?
					if (
						Object.keys(readback).length === options.readstorm_range
					) {
						t.pass(
							util.format(
								'readstorm: all %d datapoints accounted for',
								options.readstorm_range,
							),
						)
						t.end()
						process.exit(0)
					}
				}
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
	console.log('Exiting with timeout...')
	process.exit(2)
}, 1500)
