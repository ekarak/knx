/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

test('DPT9 floating point conversion', function(t) {
  var tests = [
    ['DPT9', [0x00, 0x02], 0.02],
    ['DPT9', [0x87, 0xfe], -0.02],
    ['DPT9', [0x0c, 0x24], 21.2],
    ['DPT9', [0x0c, 0x7e], 23],
    ['DPT9', [0x5c, 0xc4], 24985.6],
    ['DPT9', [0xdb, 0x3c], -24985.6],
    ['DPT9', [0x7f, 0xfe], 670433.28],
    ['DPT9', [0xf8, 0x02], -670433.28],
  ];
  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];

    // unmarshalling test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    t.ok(Math.abs(converted - val) < 0.0001,
        `${tests[i][0]} fromBuffer value ${val}`)

    // marshalling test (value to raw data)
    var apdu = {};
    DPTLib.populateAPDU(val, apdu, 'dpt9');
    t.ok(Buffer.compare(buf, apdu.data) == 0,
      `${tests[i][0]} formatAPDU value ${val}`)
  }
  t.end()
})
