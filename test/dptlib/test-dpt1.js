/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/
require('./commontest').do('DPT1', [
  { apdu_data: [0x00], jsval: false},
  { apdu_data: [0x01], jsval: true}
]);
