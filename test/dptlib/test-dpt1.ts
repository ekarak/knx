import { run } from './commontest'

/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */
run('DPT1', [
	{ apdu_data: [0x00], jsval: false },
	{ apdu_data: [0x01], jsval: true },
])
