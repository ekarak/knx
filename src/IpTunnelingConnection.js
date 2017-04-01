/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const util = require('util');
const dgram = require('dgram');

function IpTunnelingConnection(instance, options) {

  instance.BindSocket = function(cb) {
    instance.debugPrint('IpTunnelingConnection.BindSocket');
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      instance.debugPrint(util.format('tunneling socket bound to %j',
        udpSocket.address()));
      cb && cb(udpSocket);
    });
    return udpSocket;
  }

  instance.Connect = function() {
    var sm = this;
    this.localAddress = this.getLocalAddress();
    // create the socket
    this.socket = this.BindSocket(function(socket) {
      socket.on("message", function(msg, rinfo, callback) {
        sm.debugPrint(util.format('Inbound message: %j', msg));
        sm.onUdpSocketMessage(msg, rinfo, callback);
      });
      // start connection sequence
      sm.transition('connecting');
    });
    return this;
  }

  instance.disconnected = function() {
    this.socket.close();
  }

  return instance;
}


module.exports = IpTunnelingConnection;
