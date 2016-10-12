var knx = require('.');
var util = require('util');

var connection = knx.IpTunnelingConnection({ipAddr:'192.168.8.4'});
//var connection = knx.IpRoutingConnection();

connection.debug = true;

var p1 = new Promise(function(resolve, reject) {
  connection.Connect(function() {
    console.log('----------');
    console.log('Connected!');
    console.log('----------');
    resolve();
  });
});

connection.on('event', function (evt, src, dest, value) {
  var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  var msg = util.format("%s **** KNX EVENT: %j, src: %j, dest: %j", ts, evt, src, dest);
  console.log("%s %s", msg, value == null ? "" : util.format(", value: %j", value));
});

p1.then(function() {

  console.log('Reading room temperature');
  var dp = new knx.Datapoint({ga: '0/0/15', dpt: 'dpt9.001'}, connection);
  dp.on('change', function(oldvalue, newvalue) {
    console.log("**** 0/0/15 changed from: %j to: %j ",
      oldvalue, newvalue);
  });

  //
  var light = new knx.Devices.BinarySwitch({ga: '1/1/8', status_ga: '1/1/108'}, connection);
  console.log("The current light status is %j", light.status.current_value);
  light.control.on('change', function(oldvalue, newvalue) {
    console.log("**** LIGHT control changed from: %j to: %j",
      oldvalue, newvalue);
  });
  light.status.on('change', function(oldvalue, newvalue) {
    console.log("**** LIGHT status changed from: %j to: %j",
      oldvalue, newvalue);
  });
  light.switchOn();
});
