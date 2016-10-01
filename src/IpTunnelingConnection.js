/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const os = require('os');
const util = require('util');
const dgram = require('dgram');
const KnxConnection = require('./KnxConnection');
const KnxNetProtocol = require('./KnxProtocol');

/// <summary>
///     Initializes a new KNX tunneling connection with provided values. Make sure the local system allows
///     UDP messages to the localIpAddress and localPort provided
/// </summary>
function IpTunnelingConnection(options) {

  var instance = new KnxConnection(options);

  instance.BindSocket = function( cb ) {
    instance.debugPrint('IpTunnelingConnection.BindSocket');
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      instance.debugPrint(util.format('tunneling socket bound to %j', udpSocket.address()));
      cb && cb(udpSocket);
    });
    return udpSocket;
  }

  instance.AddHPAI = function (datagram) {
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

  // <summry>
  ///     Start the connection
  /// </summary>
  instance.Connect = function (callback) {
    var sm = this;
    // create a control socket for CONNECT, CONNECTIONSTATE and DISCONNECT
    sm.control = sm.BindSocket( function(socket) {
      socket.on("message", function(msg, rinfo, callback)  {
        sm.debugPrint('Inbound message in CONTROL channel');
        sm.onUdpSocketMessage(msg, rinfo, callback);
      });
      // create a tunnel socket for TUNNELING_REQUEST and friends
      sm.tunnel = sm.BindSocket( function(socket) {
        socket.on("message", function(msg, rinfo, callback)  {
          sm.debugPrint('Inbound message in TUNNEL channel');
          sm.onUdpSocketMessage(msg, rinfo, callback);
        });
        // start connection sequence
        sm.transition( 'connecting');
        sm.on('connected', callback);
      })
    });
  }

  return instance;
}


module.exports = IpTunnelingConnection;
