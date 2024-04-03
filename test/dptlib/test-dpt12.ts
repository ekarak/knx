/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { run } from './commontest'

run('DPT12', [
	{ apdu_data: [0x00, 0x00, 0x00, 0x11], jsval: 17 },
	{ apdu_data: [0x00, 0x00, 0x01, 0x00], jsval: 256 },
	{ apdu_data: [0x00, 0x00, 0x10, 0x01], jsval: 4097 },
	{ apdu_data: [0x00, 0x00, 0xff, 0xff], jsval: 65535 },
	{ apdu_data: [0x00, 0x01, 0x00, 0x00], jsval: 65536 },
	{ apdu_data: [0x07, 0x5b, 0xcd, 0x15], jsval: 123456789 },
	{ apdu_data: [0x49, 0x96, 0x02, 0xd2], jsval: 1234567890 },
])
