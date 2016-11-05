var knx = require('.');
var util = require('util');

//var connection = knx.IpTunnelingConnection({ipAddr:'192.168.8.4'});
var connection = knx.IpRoutingConnection();
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
  console.log("%s ===> %s <===, src: %j, dest: %j, value: %j",
    new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
    evt, src, dest, value
  );
});
connection.on('error', function (connstatus) {
  console.log("%s **** ERROR: %j",
    new Date().toISOString().replace(/T/, ' ').replace(/Z$/, ''),
    connstatus);
});

p1.then(function() {
  var temperature_out = new knx.Datapoint({ ga: '0/0/14', dpt: 'DPT9.001' }, connection);
  var temperature_in  = new knx.Datapoint({ ga: '0/0/15', dpt: 'DPT9.001' }, connection);
  var currdate = new knx.Datapoint({ ga: '0/7/1', dpt: 'DPT11.001' }, connection);
  var currtime = new knx.Datapoint({ ga: '0/7/2', dpt: 'DPT10.001' }, connection);
});
