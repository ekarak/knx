/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const knx = require('../..');
const test = require('tape');
const util = require('util');
const options = require('./wiredtest-options.js');

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================

 $ WIREDTEST=1 node test/wiredtests/<test>.js
*/
if (process.env.hasOwnProperty('WIREDTEST')) {

  var connection = knx.Connection({
    debug: true,
    minimumDelay: 10,
    handlers: {
      connected: function() {
        console.log('----------');
        console.log('Connected!');
        console.log('----------');
        console.log('Reading room temperature');
        var dp = new knx.Datapoint({ga: '0/0/15', dpt: 'dpt9.001'}, connection);
        dp.on('change', function(oldvalue, newvalue) {
          console.log("**** 0/0/15 changed from: %j to: %j ",
            oldvalue, newvalue);
        });
      },
      event: function (evt, src, dest, value) {
        var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        var msg = util.format("%s **** KNX EVENT: %j, src: %j, dest: %j", ts, evt, src, dest);
        console.log("%s %s", msg, value == null ? "" : util.format(", value: %j", value));
      }
    }
  });

}
