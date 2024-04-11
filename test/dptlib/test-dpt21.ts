/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */
import { run } from './commontest'

run('DPT21', [
	{
		apdu_data: [0x00],
		jsval: {
			outofservice: 0,
			fault: 0,
			overridden: 0,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x01],
		jsval: {
			outofservice: 1,
			fault: 0,
			overridden: 0,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x03],
		jsval: {
			outofservice: 1,
			fault: 1,
			overridden: 0,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x05],
		jsval: {
			outofservice: 1,
			fault: 0,
			overridden: 1,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x08],
		jsval: {
			outofservice: 0,
			fault: 0,
			overridden: 0,
			inalarm: 1,
			alarmunack: 0,
		},
	},
])

run('DPT21.001', [
	{
		apdu_data: [0x01],
		jsval: {
			outofservice: 1,
			fault: 0,
			overridden: 0,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x05],
		jsval: {
			outofservice: 1,
			fault: 0,
			overridden: 1,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x06],
		jsval: {
			outofservice: 0,
			fault: 1,
			overridden: 1,
			inalarm: 0,
			alarmunack: 0,
		},
	},
	{
		apdu_data: [0x08],
		jsval: {
			outofservice: 0,
			fault: 0,
			overridden: 0,
			inalarm: 1,
			alarmunack: 0,
		},
	},
])
