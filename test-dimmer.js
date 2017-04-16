/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var knx = require('knx');

let connection = new knx.Connection( {
  debug: true,
  handlers: {
    connected: () => {
      console.log('Connected!')

      connection.on('event', function (evt, src, dest, value) {
          console.log('**** KNX EVENT: %j, src: %j, dest: %j, value: %j',
              evt, src, dest, value)
      })

      let dimmer_control = new knx.Datapoint({ga: '14/2/129', dpt: 'DPT5.001'}, connection);
      console.log('--------- 100');
      dimmer_control.write(100);
      console.log('--------- 0');
      process.on('SIGINT', () => {
          console.log('Terminating')
          connection.Disconnect()
      })
    }
  }
} )
