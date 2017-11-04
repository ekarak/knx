/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

//
// DPT20: 1-byte HVAC
//
// FIXME: help needed
exports.formatAPDU = function(value) {
    var apdu_data = new Buffer(1);
    apdu_data[0] = value;
    console.info('./knx/src/dpt20.js : input value = ' + value + '   apdu_data = ' + apdu_data);
    return apdu_data;
}

exports.fromBuffer = function(buf) {
    if (buf.length != 1) throw "Buffer should be 1 bytes long";
    var ret = buf.readUInt8(0);
    console.info('               dpt20.js   fromBuffer : ' + ret);
    return ret;
}


exports.basetype = {
    "bitlength" : 8,
    "range" : [ , ],
    "valuetype" : "basic",
    "desc" : "1-byte"
}

exports.subtypes = {
    // 20.102 HVAC mode
    "102" : {
        "name" : "HVAC_Mode",
		"desc" : "",
        "unit" : "",
		"scalar_range" : [ , ],
        "range" : [ , ]
    }
}
