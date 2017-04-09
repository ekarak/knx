/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

test('DPT3 4-bit dimming and blinds control', function(t) {
  var tests = [
    ['DPT3',     [0x00], {decr_incr: 0, data: 0}],
    ['DPT3.007', [0x01], {decr_incr: 0, data: 1}],
    ['DPT3.007', [0x05], {decr_incr: 0, data: 5}],
    ['DPT3.007', [0x08], {decr_incr: 1, data: 0}],
    ['DPT3.007', [0x0f], {decr_incr: 1, data: 7}]
  ];

  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];

    // unmarshalling test (binary data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    //console.log('%s: %j --> %j',dpt.id, val, converted);
    t.deepEqual(converted, val,
      `${tests[i][0]} fromBuffer value ${JSON.stringify(val)}`)

    // marshalling test (value to binary data)
    var apdu = {};
    DPTLib.populateAPDU(val, apdu, 'dpt3');
    //console.log('%j --> %j', val, converted);
    t.ok(Buffer.compare(buf, apdu.data) == 0,
      `populateAPDU(${JSON.stringify(val)})`)
  }

  t.end()
})
