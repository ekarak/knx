/**
 * <license>
 * Created by ekarak
 */
var util = require('util');
const KnxSender = require('./KnxSender');
const KnxConstants = require('./KnxConstants');

function KnxSenderIpTunneling(/*KnxConnection*/ connection) {
    KnxSenderIpTunneling.super_.call(this, connection);
    this.connection = connection;
}
util.inherits(KnxSenderIpTunneling, KnxSender);

// send request over tunneling (unicast) endpoint
KnxSenderIpTunneling.prototype.SendDataSingle = function (/*KnxDatagram*/ datagram, callback) {
  var self = this;
  var buf  = this.writer.KNXNetHeader(datagram).buffer;

  if (this.connection.debug) {
    console.log('KnxSenderIpTunneling.prototype.SendDataSingle (%d bytes) ==> %s', buf.length, JSON.stringify(datagram, null, 2));
  }

  this.connection.udpClient.send(
		buf, 0, buf.length,
		this.connection.remoteEndpoint.port, this.connection.remoteEndpoint.addr,
    function (err) {
        if (self.connection.debug)
            console.log('udp sent, err[' + (err ? err.toString() : 'no_err') + ']');
        if (typeof callback === 'function') callback(err);
    });
}

module.exports = KnxSenderIpTunneling;
