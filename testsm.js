var knxjs = require('.');

console.log('Initializing new tunneling connection');

var connection = knxjs.IpTunnelingConnection({ipAddr:'192.168.8.4'});
//var connection = new knxjs.IpRoutingConnection();
connection.debug = true;
connection.Connect(function() {
  console.log('----------------------------------');
  console.log('Connected. - Registering event handler');
  connection.on('event', function (evt, src, dest, value) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log("%s: **** KNX EVENT: %j, src: %j, dest: %j, value: %j", ts, evt, src, dest, value);
  })
  console.log('             Now sending a Read request');
  connection.Read('1/1/1');
});
