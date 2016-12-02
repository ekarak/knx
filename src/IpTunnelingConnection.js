/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const util = require('util');
const dgram = require('dgram');

/// <summary>
///     Initializes a new KNX tunneling connection with provided values. Make sure the local system allows
///     UDP messages to the localIpAddress and localPort provided
/// </summary>
function IpTunnelingConnection(instance,  options) {

  instance.BindSocket = function( cb ) {
    instance.debugPrint('IpTunnelingConnection.BindSocket');
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      instance.debugPrint(util.format('tunneling socket bound to %j', udpSocket.address()));
      cb && cb(udpSocket);
    });
    return udpSocket;
  }

  // <summry>
  ///     Start the connection
  /// </summary>
  instance.Connect = function () {
    var sm = this;
    this.localAddress = this.getLocalAddress();
    // create a control socket for CONNECT, CONNECTIONSTATE and DISCONNECT
    this.control = this.BindSocket( function(socket) {
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
      })
    });
    return this;
  }

  instance.disconnected = function() {
    this.control.close();
    this.tunnel.close();
  }

  return instance;
}


module.exports = IpTunnelingConnection;
