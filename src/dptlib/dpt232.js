/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2019 Elias Karakoulakis
*/

const log = require('log-driver').logger;

//
// DPT232: 3-byte RGB color array
// MSB: Red, Green, LSB: Blue
//
exports.formatAPDU = function(value) {
    if (!value) {
        log.error("DPT232: cannot write null value");
    } else {
        var apdu_data;
        if (typeof value == 'object' &&
            value.hasOwnProperty('red')   && value.red   >= 0 && value.red   <= 255 &&
            value.hasOwnProperty('green') && value.green >= 0 && value.green <= 255 &&
            value.hasOwnProperty('blue')  && value.blue  >= 0 && value.blue  <= 255) {
        } else {
            log.error("DPT232: Must supply an value {red:0..255, green:0.255, blue:0.255}");
        }
        return new Buffer([
            Math.floor(value.red), 
            Math.floor(value.green), 
            Math.floor(value.blue)]);
    }
}

exports.fromBuffer = function(buf) {
	ret = {red: buf[0], green: buf[1], blue: buf[2]}
    return ret;
}


exports.basetype = {
    "bitlength" : 3*8,
    "valuetype" : "basic",
    "desc" : "RGB array"
}

exports.subtypes = {
    "600" : {
        "name" : "RGB", "desc" : "RGB color triplet",
        "unit" : "", "scalar_range" : [ , ],
        "range" : [ , ]
    }
}
