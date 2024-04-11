/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { KnxClient } from '../../src'
import test from 'tape'

import options from './wiredtest-options'

Error.stackTraceLimit = Infinity

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
//
test('KNX connect tunneling', function (t) {
	const connection = new KnxClient({
		// set up your KNX IP router's IP address (not multicast!)
		// for getting into tunnelling mode
		ipAddr: options.ipAddr,
		physAddr: options.physAddr,
		debug: true,
		handlers: {
			connected() {
				console.log('----------')
				console.log('Connected!')
				console.log('----------')
				t.pass('connected in TUNNELING mode')
				this.Disconnect()
			},
			disconnected() {
				t.pass('disconnected in TUNNELING mode')
				t.end()
				process.exit(0)
			},
			error(connstatus) {
				t.fail(`error connecting: ${connstatus}`)
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
