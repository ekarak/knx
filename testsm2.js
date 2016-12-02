var knx = require('.');
var util = require('util');
Error.stackTraceLimit = Infinity;

var connection = knx.Connection({
  ipAddr:'192.168.8.4',
  debug: true,
  handlers: {
    connected: function() {
      console.log('----------');
      console.log('Connected!');
      console.log('----------');
      var light = new knx.Devices.BinarySwitch({ga: '1/1/8', status_ga: '1/1/108'}, connection);
      light.control.on('change', function(oldvalue, newvalue) {
          console.log("**** LIGHT control changed from: %j to: %j",
            oldvalue, newvalue);
      });
      light.status.on('change', function(oldvalue, newvalue) {
          console.log("**** LIGHT status changed from: %j to: %j",
            oldvalue, newvalue);
      });
    }
  }
});

//light.switchOff();
