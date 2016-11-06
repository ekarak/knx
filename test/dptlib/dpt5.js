/* TODO: automate tests */
const DPTLib = require('../../src/dptlib');
const assert = require('assert');

var tests = [
  ['DPT5',     [0x00], 0.00],
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

  var dpt = DPTLib.resolve(tests[i][0]);
  var buf = new Buffer (tests[i][1]);
  var val = tests[i][2];

  // forward test (raw buffer data to JS value)
  var converted = DPTLib.fromBuffer(buf, dpt);
  if (Math.abs(converted - val) > 0.0001) {
    console.log('*** failed %s: fromBuffer %j : %j != %j', tests[i][0], buf, converted, val);
  }

  // backward test (float to raw data)
  var converted = DPTLib.formatAPDU(val, dpt);
  if (Buffer.compare(buf, converted) != 0) {
    console.log('*** failed %s: formatAPDU %j : %j != %j', tests[i][0], val, converted, buf);
  }

}
