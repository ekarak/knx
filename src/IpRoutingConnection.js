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
	this.udpClient.bind(this.RemoteEndpoint.port, function() {
		console.log('adding multicast membership for %s', that.RemoteEndpoint.host);
		that.udpClient.addMembership(that.RemoteEndpoint.host);
	});
}

IpRoutingConnection.prototype.Send = function(datagram, callback) {
console.log('not implemented yet');
}


module.exports = IpRoutingConnection;
