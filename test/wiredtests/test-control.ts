/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2018 Elias Karakoulakis
*/
Error.stackTraceLimit = Infinity;

import { Connection, Datapoint } from '../../src';
import test from "tape";

import options from "./wiredtest-options";
/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/

  test('KNX wired test - control a basic DPT1 binary switch', function(t) {
    var counter = 0;
    var connection = new Connection({
      debug: true,
      physAddr: options.physAddr,
      handlers: {
        connected: function() {
          console.log('----------');
          console.log('Connected!');
          console.log('----------');
          var light = new Datapoint({
            ga: options.wired_test_control_ga,
            dpt: 'DPT1.001'
          }, connection);
          light.on('change', () => {
            counter += 1;
            if (counter == 4) {
              t.pass('all 4 responses received');
              t.end();
              process.exit(0);
            }
          });
          // operation 1
          light.write(0);
          // operation 2
          setTimeout(function() {
            light.write(1);
          }, 500);
          // issue #71 - writing to an invalid address should not stall the FSM
          connection.write('10/10/5', 1);
          // operation 3 - Do the same with writeRaw
          setTimeout(function() {
            connection.writeRaw(options.wired_test_control_ga, Buffer.from('00', 'hex'), 1);
          }, 1000);
          // operation 4 - Do the same with writeRaw
          setTimeout(function() {
            connection.writeRaw(options.wired_test_control_ga, Buffer.from('01', 'hex'), 0);
          }, 1500);
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
          t.fail('error: '+connstatus);
          process.exit(1);
        }
      }
    });
  })

  setTimeout(function() {
    console.log('Exiting with timeout ...');
    process.exit(2);
  }, 2000);
