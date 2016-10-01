var knx = require('.');
var util = require('util');

//var connection = knx.IpTunnelingConnection({ipAddr:'192.168.8.4'});
var connection = knx.IpRoutingConnection();

connection.debug = true;
connection.Connect(function() {
  console.log('----------');
  console.log('Connected!');
  console.log('----------');
  connection.on('event', function (evt, src, dest, value) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log("%s\n**** KNX EVENT: %j, src: %j, dest: %j, value: %j \n", ts, evt, src, dest, value);
  })
  connection.write('')
  console.log('Now sending a Read request');
  var dp = new knx.Datapoint({ga: '0/0/15', dpt: 'dpt9.001'});
  dp.bind(connection);
  dp.read((src, dest, value) => {
    console.log("**** RESPONSE %j reports that %j has current value: %j", src, dest, value);
  });
  dp.write(1);
  //
  //console.log('%j', knx.Devices);
  //var light = new knx.Devices.BinarySwitch({ga: '1/1/1', status_ga: '1/1/101'}, connection);
  //light.bind(connection);
  //light.switchOn();
});
