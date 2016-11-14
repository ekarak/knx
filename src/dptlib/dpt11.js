/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/
const util = require('util');
//
// DPT11.*: date
//
exports.formatAPDU = function(value) {
  if (!value) throw "cannot write null value for DPT11"
  var apdu_data = new Buffer(3);
  switch(typeof value) {
    case 'string':
      // try to parse
      value = new Date(value);
      break;
    case 'object':
      if (value.constructor.name != 'Date') {
        throw 'Must supply a Date or String object for DPT11 Date';
        break;
      }
    case 'number':
      value = new Date(value);
    default:
      apdu_data[0] = value.getDate();
      apdu_data[1] = value.getMonth() + 1;
      var year = value.getFullYear();
      apdu_data[2] = year - (year >= 2000 ? 2000 : 1900);
  }
  return apdu_data;
}

exports.fromBuffer = function(buf) {
  if (buf.length != 3) throw "Buffer should be 3 bytes long";
  var d = new Date();
  var day   = buf[0] & 0b00011111;
  var month = (buf[1] & 0b00001111);
  var year  = (buf[2] & 0b01111111);
  year = year + (year > 89 ? 1900 : 2000)
  if (day >= 0 & day <= 31 &
    month >= 1 & month <= 12 &
    year >= 1990 & year <= 2089) {
    // FIXME: no ability to setDay() without week context
    d.setDate    (day);
    d.setMonth   (month-1);
    d.setFullYear(year);
    d.setHours(0,0,0,0);
  } else {
    throw util.format(
      "%j => %d/%d/%d is not valid date according to DPT11",
      buf, day, month, year);
  }
  return d;
}

// DPT11 base type info
exports.basetype = {
  bitlength : 24,
  valuetype : 'composite',
  desc : "3-byte date value"
}


// DPT11 subtypes info
exports.subtypes = {
  // 11.001 date
  "001" : {
      name : "DPT_Date", desc : "Date"
  }
}
