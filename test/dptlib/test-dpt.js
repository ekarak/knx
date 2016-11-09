'use strict';

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

var tests = [
  ['DPT5',     [0x00], 0.00],
/*
  // 5.001 percentage (0=0..ff=100%)
  ['DPT5.001', [0x00], 0],
  ['DPT5.001', [0x80], 50],
  ['DPT5.001', [0xff], 100],
  // 5.003 angle (degrees 0=0, ff=360)
  ['DPT5.003', [0x00], 0],
  ['DPT5.003', [0x80], 181],
  ['DPT5.003', [0xff], 360],
*/
  ['DPT9', [0x00, 0x02], 0.02],
  ['DPT9', [0x87, 0xfe], -0.02],
  ['DPT9', [0x0c, 0x24], 21.2],
  ['DPT9', [0x5c, 0xc4], 24985.6],
  ['DPT9', [0xdb, 0x3c], -24985.6],
  ['DPT9', [0x7f, 0xfe], 670433.28],
  ['DPT9', [0xf8, 0x02], -670433.28],
];

test('DPT conversion', function(t) {
  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];

    // forward test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);

    t.ok( Math.abs(converted - val) < 0.0001, `${tests[i][0]} fromBuffer value ${val}`)

    // backward test (value to raw data)
    converted = DPTLib.formatAPDU(val, dpt);
    t.ok(Buffer.compare(buf, converted) == 0,  `${tests[i][0]} formatAPDU value ${val}`)
  }

  t.end()
})
