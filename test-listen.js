var dgram = require('dgram');
var s = dgram.createSocket('udp4', function(msg, err) {
	console.log("createSocket: %s (%s)", msg, err);
});

s.bind(3671, function() {
  s.addMembership('224.0.12.23');
});
s.on("message", function (msg, rinfo) {
  console.log("server got: " + msg + " from " +
    rinfo.address + ":" + rinfo.port);
});
