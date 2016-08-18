/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
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
    // get the incoming packet's service type ...
    var reader = KnxNetProtocol.createReader(msg);
    reader.KNXNetHeader('tmp');
    var dg = reader.next()['tmp'];
    var svctype = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
    // append the CEMI service type if this is a tunneling request...
    var cemitype = (dg.service_type == 1056) ? KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode) : "";
    //if (conn.debug) console.log("received %s(/%s) message: %j from %j:%d, datagram: %j", svctype, cemitype, msg, rinfo.address, rinfo.port, dg );
    // ... to drive the state machine
    var signal = util.format('recv_%s', svctype);
    console.log('* %s => %j', signal, KnxNetStateMachine.compositeState(conn))
    //if (typeof KnxNetStateMachine[st] == 'function') {
      KnxNetStateMachine.handle(conn, signal, dg);
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
  var conn = this;
  var reader = KnxNetProtocol.createReader(buf);
  reader.KNXNetHeader('packet');
  var dg = reader.next()['packet'];
  var svctype = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
  if (conn.debug) {
    console.log('IpTunneling.Send (%d bytes) ==> %j', buf.length, buf);
    //console.log('IpTunneling.Send ==> %s', JSON.stringify(dg, null, 4));
  }
  channel.send(
    buf, 0, buf.length,
    this.remoteEndpoint.port, this.remoteEndpoint.addr,
    function (err) {
        if (conn.debug)
            console.log('udp sent, err[' + (err ? err.toString() : 'no_err') + ']');
        if (typeof callback === 'function') callback(err);
    });
  // ... then drive the state machine
  var signal = util.format('sent_%s', svctype);
  console.log('* %s => %j', signal, KnxNetStateMachine.compositeState(conn));
  KnxNetStateMachine.handle( conn, signal, dg );
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
