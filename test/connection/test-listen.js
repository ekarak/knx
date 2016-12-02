var knx = require('../..');
var util = require('util');

// this is a WIRED test and requires a real KNX IP router on the LAN
var connection = new knx.Connection({
  debug: true,
  handlers: {
    connected: function() {
      console.log('----------');
      console.log('Connected!');
      console.log('----------');
      var temperature_out = new knx.Datapoint({ ga: '0/0/14', dpt: 'DPT9.001' }, connection);
      var temperature_in  = new knx.Datapoint({ ga: '0/0/15', dpt: 'DPT9.001' }, connection);
      var currdate = new knx.Datapoint({ ga: '0/7/1', dpt: 'DPT11.001' }, connection);
      var currtime = new knx.Datapoint({ ga: '0/7/2', dpt: 'DPT10.001' }, connection);
    },
    event: function (evt, src, dest, value) {
      console.log("%s ===> %s <===, src: %j, dest: %j, value: %j",
        new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
        evt, src, dest, value
      );
    },
    error: function (connstatus) {
      console.log("%s **** ERROR: %j",
        new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
        connstatus);
    }
  }
});

setTimeout(function() {
  console.log('Exiting...');
  process.exit(0);
}, 1500);
