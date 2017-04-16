/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var knx = require('knx');

let connection = new knx.Connection( {
  //debug: true,
  handlers: {
    connected: () => {
      console.log('Connected!')

      connection.on('event', function (evt, src, dest, value) {
          console.log('**** KNX EVENT: %j, src: %j, dest: %j, value: %j',
              evt, src, dest, value)
      })

      var timer_control = new knx.Datapoint({ga: '4/1/4', dpt: 'DPT9.001', autoread: true}, connection);
      var timer_status = new knx.Datapoint({ga: '4/1/3', dpt: 'DPT9.001', autoread: true}, connection);
      timer_control.on('change', function(oldvalue, newvalue) {
        console.log("**** LOGO timer changed from: %j to: %j", oldvalue, newvalue);
      });
      timer_status.on('change', function(oldvalue, newvalue) {
        console.log("**** Timer status changed from: %j to: %j", oldvalue, newvalue);
      });
      setTimeout(function () {
        timer_control.write(12);
      }, 500);

      process.on('SIGINT', () => {
          console.log('Terminating')
          connection.Disconnect()
      })
    }
  }
} )
