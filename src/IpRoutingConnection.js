/**
 * KNX Routing support (IP Multicast)
 * Created by ekarak on 01.05.2016.
 */
var CONNECT_TIMEOUT = 5000;
var KnxConnection = require('./Connection');

var util = require('util');
var dgram = require('dgram');
var Promise = require('promise');

/**
<summary>
  Initializes a new KNX routing connection with provided values. Make
 sure the local system allows UDP messages to the multicast group.
 </summary>
 <param name="mcastIpAddr">Multicast IP address (optional - default to 224.0.23.12)</param>
 <param name="mcastIpPort">Multicast IP port (optional - defaults to 3671)</param>
**/
function IpRoutingConnection(options) {
  if (!options) options = {};
  if (!options.ipAddr) options.ipAddr = '224.0.23.12';
  if (!options.ipPort) options.ipPort = 3671;
  IpRoutingConnection.super_.call(this, options);
}
util.inherits(IpRoutingConnection, KnxConnection);


/// <summary>
///     Bind the multicast socket
/// </summary>
IpRoutingConnection.prototype.BindSocket = function ( cb ) {
  var conn = this;
	this.control.bind(function() {
		console.log('adding multicast membership for %s', conn.remoteEndpoint.addr);
		conn.control.addMembership(conn.remoteEndpoint.addr);
    cb && cb(conn);
	});
}

IpRoutingConnection.prototype.Send = function(datagram, callback) {
  var self = this;
  if (this.debug) {
    console.log('IpRouting.Send (%d bytes) ==> %j', buf.length, buf);
  }
  this.control.send(
    buf, 0, buf.length,
    this.remoteEndpoint.port, this.remoteEndpoint.addr,
    function (err) {
        if (self.debug)
            console.log('udp sent, err[' + (err ? err.toString() : 'no_err') + ']');
        if (typeof callback === 'function') callback(err);
  });
}

IpRoutingConnection.prototype.AddHPAI = function (datagram) {
  // FIXME
  console.log('HERE: %s %s', this.localAddresses, this.tunnel);
  // add the control udp local endpoint
  datagram.hpai = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.localAddress + ":" + this.control.address().port
  };
  // add the tunneling udp local endpoint
  datagram.tunn = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.localAddress + ":" + this.tunnel.address().port
  };
}

module.exports = IpRoutingConnection;
