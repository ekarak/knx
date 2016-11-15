'use strict';

const test = require('tape');
const DPTLib = require('../../src/dptlib');
const assert = require('assert');


test('DPT5 scalar conversion', function(t) {
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
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];

    // forward test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    //console.log('%s: %j --> %j',dpt.id, val, converted);
    t.ok( Math.abs(converted - val) < 0.0001, `${tests[i][0]} fromBuffer value ${val}`)

    // backward test (value to raw data)
    converted = DPTLib.formatAPDU(val, dpt);
    //console.log('%j --> %j', val, converted)
    t.ok(Buffer.compare(buf, converted) == 0,  `${tests[i][0]} formatAPDU value ${val}`)
  }

  t.end()
})

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
    // forward test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    t.ok( Math.abs(converted - val) < 0.0001, `${tests[i][0]} fromBuffer value ${val}`)
    // backward test (value to raw data)
    converted = DPTLib.formatAPDU(val, dpt);
    t.ok(Buffer.compare(buf, converted) == 0,  `${tests[i][0]} formatAPDU value ${val}`)
  }
  t.end()
})

function timecompare(date1, sign, date2) {
  var hour1 = date1.getHours();
  var min1 = date1.getMinutes();
  var sec1 = date1.getSeconds();
  var hour2 = date2.getHours();
  var min2 = date2.getMinutes();
  var sec2 = date2.getSeconds();
  if (sign === '===') {
    if (hour1 === hour2 && min1 === min2 && sec1 === sec2) return true;
    else return false;
  }
  else if (sign === '>') {
    if (hour1 > hour2) return true;
    else if (hour1 === hour2 && min1 > min2) return true;
    else if (hour1 === hour2 && min1 === min2 && sec1 > sec2) return true;
    else return false;
  }
}

test('DPT10 time conversion', function(t) {
  var tests = [
    ['DPT10', [12,23,34], '12:23:34'],
    ['DPT10', [15,45,56], '15:45:56']
  ]
  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];
    // forward test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    t.ok( converted == val, `${tests[i][0]} fromBuffer value ${val} => ${converted}`);
    // backward test (value to raw data)
    converted = DPTLib.formatAPDU(val, dpt);
    t.ok( Buffer.compare(buf, converted) == 0, `${tests[i][0]} formatAPDU value ${val} => ${converted}`);
  }
  t.end()
})

function datecompare(date1, sign, date2) {
  var day1 = date1.getDate();
  var mon1 = date1.getMonth();
  var year1 = date1.getFullYear();
  var day2 = date2.getDate();
  var mon2 = date2.getMonth();
  var year2 = date2.getFullYear();
  if (sign === '===') {
    if (day1 === day2 && mon1 === mon2 && year1 === year2) return true;
    else return false;
  }
  else if (sign === '>') {
    if (year1 > year2) return true;
    else if (year1 === year2 && mon1 > mon2) return true;
    else if (year1 === year2 && mon1 === mon2 && day1 > day2) return true;
    else return false;
  }
}
test('DPT11 date conversion', function(t) {
  var tests = [
    ['DPT11', [25,12,95], new Date('25 Dec 1995')],
    ['DPT11', [25,12,15], new Date('25 Dec 2015')]
  ]
  for (var i = 0; i < tests.length; i++) {
    let dpt = DPTLib.resolve(tests[i][0]);
    let buf = new Buffer(tests[i][1]);
    let val = tests[i][2];
    // forward test (raw data to value)
    let converted = DPTLib.fromBuffer(buf, dpt);
    t.ok( datecompare(converted, '===', val), `${tests[i][0]} fromBuffer value ${val} => ${converted}`);
    // backward test (value to raw data)
    converted = DPTLib.formatAPDU(val, dpt);
    t.ok( Buffer.compare(buf, converted) == 0, `${tests[i][0]} formatAPDU value ${val} => ${converted}`);
  }
  t.end()
})
