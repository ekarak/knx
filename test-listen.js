var knx = require('.');
var util = require('util');

//var connection = knx.IpTunnelingConnection({ipAddr:'192.168.8.4'});
var connection = knx.IpRoutingConnection();

connection.debug = true;

connection.Connect(function() {
  console.log('----------');
  console.log('Connected!');
  console.log('----------');
});

connection.on('event', function (evt, src, dest, value) {
  console.log("%s: %j, src: %j, dest: %j, value: %j",
    new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
    evt, src, dest, value
  );
});
connection.on('error', function (connstatus) {
  console.log("%s: **** ERROR: %j",
    new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
    connstatus);
});
