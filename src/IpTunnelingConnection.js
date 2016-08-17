/**
 */
const Connection = require('./Connection');
const KnxNetProtocol = require('./KnxProtocol');
const KnxNetStateMachine = require('./KnxNetStateMachine');

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
  var conn = this;
  if (this.debug) console.log('IpTunnelingConnection.prototype.BindSocket');
  var udpSocket = dgram.createSocket("udp4");
  // bind incoming UDP packet handler
  udpSocket.on("message", function(msg, rinfo, callback) {
    if (this.debug) console.log("received message: %j from %j:%d", msg, rinfo.address, rinfo.port);
    var reader = KnxNetProtocol.createReader(msg);
    reader.KNXNetHeader('packet');
    conn.lastRcvdDatagram = reader.next()['packet'];
    if (this.debug) console.log("decoded packet: %j", conn.lastRcvdDatagram);
    // get the incoming packet's service type...
    var st = KnxConstants.keyText('SERVICE_TYPE', conn.lastRcvdDatagram.service_type);
    // ... to drive the state machinej
    console.log('* %s => %j', st, KnxNetStateMachine.compositeState(conn))
    //if (typeof KnxNetStateMachine[st] == 'function') {
      console.log('dispatching %s to state machine', st);
      KnxNetStateMachine.handle(conn, st);
    //}
  });
  udpSocket.bind(function() {
    console.log('socket bound to %j', udpSocket.address());
    cb && cb(conn);
  });
  return udpSocket;
}

/* FIXME: cuurently sends only through the control connection */
IpTunnelingConnection.prototype.Send = function(channel, buf, callback) {
  var self = this;
  if (self.debug) {
    var reader = KnxNetProtocol.createReader(buf);
    reader.KNXNetHeader('packet');
    var decoded = reader.next()['packet'];
    //
    console.log('IpTunneling.Send (%d bytes) ==> %j\n\t%s',
      buf.length, buf, JSON.stringify(decoded, null, 4));
  }
  channel.send(
    buf, 0, buf.length,
    this.remoteEndpoint.port, this.remoteEndpoint.addr,
    function (err) {
        if (self.debug)
            console.log('udp sent, err[' + (err ? err.toString() : 'no_err') + ']');
        if (typeof callback === 'function') callback(err);
  });
}

IpTunnelingConnection.prototype.AddHPAI = function (datagram) {
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

module.exports = IpTunnelingConnection;
