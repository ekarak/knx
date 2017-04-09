/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

test('DPT5 scalar conversion', function(t) {
  var tests = [
    // plain DPT5 without subtype assumes no scalar conversion
    ['DPT5', [0x00], 0],
    ['DPT5', [0x40], 64],
    ['DPT5', [0x41], 65],
    ['DPT5', [0x80], 128],
    ['DPT5', [0xff], 255],
    // 5.001 percentage (0=0..ff=100%)
    ['DPT5.001', [0x00], 0],
    ['DPT5.001', [0x80], 50],
    ['DPT5.001', [0xff], 100],
    // 5.003 angle (degrees 0=0, ff=360)
    ['DPT5.003', [0x00], 0],
    ['DPT5.003', [0x80], 181],
    ['DPT5.003', [0xff], 360],
  ];

  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];

    // unmarshalling test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    //console.log('%s: %j --> %j',dpt.id, val, converted);
    t.ok(Math.abs(converted - val) < 0.0001,
      `${tests[i][0]} unmarshalling fromBuffer ${val}`)

    // marshalling test (value to raw data)
    var apdu = {};
    DPTLib.populateAPDU(val, apdu, tests[i][0]);
    console.log('%j --> %j', val, apdu)
    t.ok(Buffer.compare(buf, apdu.data) == 0,
      `${tests[i][0]} marshalling formatAPDU ${val}`)
  }

  t.end()
})
