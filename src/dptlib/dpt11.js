/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

//
// DPT11.*: date
//

exports.formatAPDU = function(value) {
  if (!value) throw "cannot write null value for DPT11"
  var apdu_data = new Buffer(3);
  if (typeof value == 'object' && value.constructor.name == 'Date') {
    apdu_data[0] = value.getDate();
    apdu_data[1] = value.getMonth() + 1;
    apdu_data[2] = value.getFullYear() - 2000;
  } else throw 'Must supply a Date object for DPT11';
  return apdu_data;
}

exports.fromBuffer = function(buf) {
  if (buf.length != 3) throw "Buffer should be 3 bytes long";
  var d = new Date();
  // FIXME: no ability to setDay() without week context
  d.setDate    (buf[0]         & 0b00011111);
  d.setMonth   (1    + (buf[1] & 0b00001111));
  d.setFullYear(2000 + (buf[2] & 0b01111111));
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
