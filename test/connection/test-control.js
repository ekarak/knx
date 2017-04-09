/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var knx = require('../..');

// this is a WIRED test and requires a real KNX IP router on the LAN
// just define a datapoint that should respond to a a GroupValue_Read request
var connection = new knx.Connection({
  debug: true,
  physAddr: "14.14.14",
  handlers: {
    connected: function() {
      console.log('----------');
      console.log('Connected!');
      console.log('----------');
      var light = new knx.Datapoint({
        ga: '5/0/0',
        dpt: 'DPT1.001'
      }, connection);
      light.write(0);
      setTimeout(function() {
        light.write(1);
      }, 1000);
    },
    event: function(evt, src, dest, value) {
      console.log("%s ===> %s <===, src: %j, dest: %j, value: %j",
        new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
        evt, src, dest, value
      );
    },
    error: function(connstatus) {
      console.log("%s **** ERROR: %j",
        new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
        connstatus);
      process.exit(1);
    }
  }
});

setTimeout(function() {
  console.log('Exiting ...');
  process.exit(0);
}, 1500);
