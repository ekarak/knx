/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');
const dpt1 = DPTLib.resolve('1');

test('DPT1 basic tests', function(t) {
  var tests = {
    [0x00]: [false, 0, "false"],
    [0x01]: [true, 1, "true"],
  };
  for (var apdu in Object.keys(tests)) {
    for (var i in tests[apdu]) {
      var jsval = tests[apdu][i];
      // marshalling test (JS value to APDU)
      var converted = {};
      DPTLib.populateAPDU(jsval, converted, 'dpt1');
      //console.log('%s: %j --> %j', dpt.id, rhs, converted)
      t.ok(apdu == converted.data,
        `DPT1.formatAPDU(${jsval}:${typeof jsval}) => ${apdu}, got: ${converted.data}`
      )
    }
    // unmarshalling test (binary data to JS value)
    var converted = DPTLib.fromBuffer(apdu, dpt1);
    //console.log('%s: %j --> %j', dpt.id, rhs, converted);
    t.ok(converted == tests[apdu][0],
      `DPT1.fromBuffer(${apdu}) => ${tests[apdu][0]}(${typeof tests[apdu][0]})`
    )
  }

  t.end()
})
