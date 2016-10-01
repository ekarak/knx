/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

//
// DPT4: 8-bit character
//
exports.formatAPDU = function(value) {
  if (!value) throw "cannot write null value for DPT4"
  else {
    var apdu_data;
    if (typeof value == 'string' &&
      value.length == 1)
        apdu_data = value.charCodeAt(0);
    else throw "Must supply a character";
  }
  return apdu_data;
}

exports.fromBuffer = function(buf) {
  if (buf.length != 1) throw "Buffer should be 1 byte long"
  return String.fromCharCode(buf[0]);
}

exports.basetype =  {
    "bitlength" : 8,
    "valuetype" : "basic",
    "desc" : "8-bit character"
}

exports.subtypes = {
    // 4.001 character (ASCII)
    "001" : {
        "name" : "DPT_Char_ASCII",
        "desc" : "ASCII character (0-127)",
        "range" : [0, 127],
        "use" : "G",
    },
    // 4.002 character (ISO-8859-1)
    "002" : {
        "name" : "DPT_Char_8859_1",
        "desc" : "ISO-8859-1 character (0..255)",
        "use" : "G",
    }
}
