var knxjs = require('.');


console.log('Initializing new tunneling connection');
var connection = new knxjs.IpTunnelingConnection({ipAddr:'192.168.8.4'});
connection.debug = true;
connection.Connect(function() {
  console.log('Connected. - Now sending a command');
  //connection.Write('1/2/0', true);
  console.log('           - Registering event handler');
  connection.on('event', function (evt, src, dest, value) {
    console.log("KNX EVENT: %j, src: %j, dest: %j, value: %j", evt, src, dest, value);
  })
});

setTimeout(function () {
  console.log('bye!');
}, 3000);
