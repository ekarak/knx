/* TODO: automate tests */
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

var dpt9 = DPTLib.resolve('DPT9');

var tests = [
  [[0x00, 0x02], 0.02],
  [[0x87, 0xfe], -0.02],
  [[0x0c, 0x24], 21.2],
  [[0x5c, 0xc4], 24985.6],
  [[0xdb, 0x3c], -24985.6],
  [[0x7f, 0xfe], 670433.28],
  [[0xf8, 0x02], -670433.28]
];

for (var i = 0; i < tests.length; i++) {
  var buf = new Buffer(tests[i][0]);
  var flt = tests[i][1];
  // forward test (raw data to float)
  var converted = dpt9.fromBuffer(buf);
  if (Math.abs(converted - flt) > 0.0001) {
    console.log('forward test failed: %j != %j', converted, flt);
  }
  // backward test (float to raw data)
  converted = dpt9.formatAPDU(flt);
  if (Buffer.compare(buf, converted) != 0) {
    console.log('backward test failed: %j != %j', converted, buf);
  }
}
