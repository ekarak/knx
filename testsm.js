var knxjs = require('.');


console.log('test1');
var connection = new knxjs.IpTunnelingConnection({ipAddr:'10.12.23.53'});
connection.debug = true;
connection.Connect(function() {
  console.log('connected.');
});

setTimeout(function () {
  console.log('bye!');
}, 3000);
