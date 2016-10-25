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
  var apdu_data = new Buffer(3);
  if (typeof value == 'object' && value.constructor.name == 'Date') {
    apdu_data[0] = value.getDay() << 5 + value.getHours();
    apdu_data[1] = value.getMinutes();
    apdu_data[2] = value.getSeconds();
  } else throw 'Must supply a Date object for DPT10';
  return apdu_data;
}

// Javascript contains no notion of "time of day", hence this function
// returns a regular Date object for today, with the hour/minute/second part
// overwritten from the KNX telegram
exports.fromBuffer = function(buf) {
  if (buf.length != 3) throw "Buffer should be 3 bytes long";
  var d = new Date();
  // FIXME: no ability to setDay() without week context
  var hours = buf[0] & 0b00011111;
  var minutes = buf[1];
  var seconds = buf[2];
  if (hours >= 0 & hours <= 23 &
    minutes >= 0 & minutes <= 59 &
    seconds >= 0 & seconds <= 59) {
    d.setHours(hours);
    d.setMinutes(minutes);
    d.setSeconds(seconds);
  } else {
    throw util.format(
      "%j (%d:%d:%d) is not a valid time according to DPT10",
      buf, hours, minutes, seconds);
  }
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
