var knx = require('.');
var util = require('util');

//var connection = knx.IpTunnelingConnection({ipAddr:'192.168.8.4'});
var connection = knx.IpRoutingConnection();

//connection.debug = true;
connection.Connect(function() {
  console.log('----------');
  console.log('Connected!');
  console.log('----------');
  connection.on('event', function (evt, src, dest, value) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    var msg = util.format("%s **** KNX EVENT: %j, src: %j, dest: %j", ts, evt, src, dest);
    console.log("%s %s", msg, value == null ? "" : util.format(", value: %j", value));
  })
  console.log('Reading room temperature');
  var dp = new knx.Datapoint({ga: '0/0/15', dpt: 'dpt9.001'});
  dp.on('change', function(oldvalue, newvalue) {
    console.log("**** 0/0/15 changed from: %j to: %j ",
      oldvalue, newvalue);
  });
  dp.bind(connection);

  //
  var light = new knx.Devices.BinarySwitch({ga: '1/1/1', status_ga: '1/1/101'});
  light.bind(connection);
  light.switchOff();
  console.log("The current light status is %j", light.status.current_value);
  light.control.on('change', function(oldvalue, newvalue) {
    console.log("**** LIGHT control changed from: %j to: %j",
      oldvalue, newvalue);
  });
  light.status.on('change', function(oldvalue, newvalue) {
    console.log("**** LIGHT status changed from: %j to: %j",
      oldvalue, newvalue);
  });
});
