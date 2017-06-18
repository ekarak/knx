/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

const util = require('util');
const dgram = require('dgram');

function IpTunnelingConnection(instance, options) {

  instance.BindSocket = function(cb) {
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      instance.debugPrint(util.format('IpTunnelingConnection.BindSocket %s:%d',
        instance.localAddress, udpSocket.address().port));
      cb && cb(udpSocket);
    });
    return udpSocket;
  }

  instance.Connect = function() {
    var sm = this;
    this.localAddress = this.getLocalAddress();
    // create the socket
    this.socket = this.BindSocket(function(socket) {
      socket.on("error", function(errmsg) {
        sm.debugPrint(util.format('Socket error: %j', errmsg));
      });
      socket.on("message", function(msg, rinfo, callback) {
        sm.debugPrint(util.format('Inbound message: %s', msg.toString('hex')));
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
