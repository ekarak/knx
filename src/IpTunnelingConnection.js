/**
 */
const Connection = require('./Connection');
const KnxNetProtocol = require('./KnxProtocol');

var os = require('os');
var util = require('util');
var dgram = require('dgram');
var Promise = require('promise');

/// <summary>
///     Initializes a new KNX tunneling connection with provided values. Make sure the local system allows
///     UDP messages to the localIpAddress and localPort provided
/// </summary>
function IpTunnelingConnection(options) {
  IpTunnelingConnection.super_.call(this, options);
//  console.log('connection: %j', this);
}

util.inherits(IpTunnelingConnection, Connection);

IpTunnelingConnection.prototype.BindSocket = function( cb ) {
  if (this.debug) console.log('IpTunnelingConnection.prototype.BindSocket');
  var conn = this;
  this.udpClient.bind(this.remoteEndpoint.port, function() {
    console.log('udpClient bound to %j', conn.udpClient.address());
    cb && cb(conn);
  });
}

IpTunnelingConnection.prototype.Send = function(buf, callback) {
  var self = this;
  if (this.debug) {
    console.log('IpTunneling.Send (%d bytes) ==> %j', buf.length, buf);
  }
  this.udpClient.send(
    buf, 0, buf.length,
    this.remoteEndpoint.port, this.remoteEndpoint.addr,
    function (err) {
        if (self.debug)
            console.log('udp sent, err[' + (err ? err.toString() : 'no_err') + ']');
        if (typeof callback === 'function') callback(err);
  });
}

module.exports = IpTunnelingConnection;
