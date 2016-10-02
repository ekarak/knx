/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

/*
Datatypes
=========
KNX/EIB Function                   Information length      EIS        DPT     Value
Switch                             1 Bit                   EIS 1      DPT 1	0,1
Dimming (Position, Control, Value) 1 Bit, 4 Bit, 8 Bit     EIS 2	    DPT 3	[0,0]...[1,7]
Time                               3 Byte                  EIS 3	    DPT 10
Date                               3 Byte                  EIS 4      DPT 11
Floating point                     2 Byte                  EIS 5	    DPT 9	-671088,64 - 670760,96
8-bit unsigned value               1 Byte                  EIS 6	    DPT 5	0...255
8-bit unsigned value               1 Byte                  DPT 5.001	DPT 5.001	0...100
Blinds / Roller shutter            1 Bit                   EIS 7	    DPT 1	0,1
Priority                           2 Bit                   EIS 8	    DPT 2	[0,0]...[1,1]
IEEE Floating point                4 Byte                  EIS 9	    DPT 14	4-Octet Float Value IEEE 754
16-bit unsigned value              2 Byte                  EIS 10	    DPT 7	0...65535
16-bit signed value                2 Byte                  DPT 8	    DPT 8	-32768...32767
32-bit unsigned value              4 Byte                  EIS 11	    DPT 12	0...4294967295
32-bit signed value                4 Byte                  DPT 13	    DPT 13	-2147483648...2147483647
Access control                     1 Byte                  EIS 12	    DPT 15
ASCII character                    1 Byte                  EIS 13	    DPT 4
8859_1 character                   1 Byte                  DPT 4.002	DPT 4.002
8-bit signed value                 1 Byte                  EIS 14	    DPT 6	-128...127
14 character ASCII                 14 Byte                 EIS 15	    DPT 16
14 character 8859_1                14 Byte                 DPT 16.001	DPT 16.001
Scene                              1 Byte                  DPT 17	    DPT 17	0...63
HVAC                               1 Byte                  DPT 20	    DPT 20	0..255
Unlimited string 8859_1            .                       DPT 24	    DPT 24
List 3-byte value                  3 Byte                  DPT 232	  DPT 232	RGB[0,0,0]...[255,255,255]
*/


const fs = require('fs');
const path = require('path');

var matches;
var dirEntries = fs.readdirSync(__dirname);
var dpts = {};
for (var i = 0; i < dirEntries.length; i++) {
  if (matches = dirEntries[i].match(/(dpt.*)\.js/) ) {
    var dptid = matches[1].toUpperCase();
    dpts[dptid] = require(__dirname + path.sep + dirEntries[i]);
    console.log('DPT library: loading %s (%s)', dptid, dpts[dptid].basetype.desc);
  }
}

module.exports = dpts;
