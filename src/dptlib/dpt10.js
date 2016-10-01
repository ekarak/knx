/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

//
// DPT10.*: time (3 bytes)
//

// DPTFrame to parse a DPT10 frame.
// Always 8-bit aligned.

exports.formatAPDU = function(value) {
  if (!value) throw "cannot write null value for DPT10"
  var apdu_data = new Buffer(3);
  if (typeof value == 'object' && value.constructor.name == 'Date') {
    apdu_data[0] = value.getDay() << 5 + value.getHours();
    apdu_data[1] = value.getMinutes();
    apdu_data[2] = value.getSeconds();
  } else throw 'Must supply a Date object for DPT10';
  return apdu_data;
}

exports.fromBuffer = function(buf) {
  if (buf.length != 3) throw "Buffer should be 3 bytes long";
  var d = new Date();
  // FIXME: no ability to setDay() without week context
  d.setHours(buf[0] & 0b00011111);
  d.setMinutes(buf[1]);
  d.setSeconds(buf[2]);
  return d;
}

// DPT10 base type info
exports.basetype = {
  "bitlength" : 24,
  "valuetype" : "composite",
  "desc" : "day of week + time of day"
}

// DPT10 subtypes info
exports.subtypes = {
  // 10.001 time of day
  "001" : {
      "name" : "DPT_TimeOfDay", "desc" : "time of day"
  }
}
