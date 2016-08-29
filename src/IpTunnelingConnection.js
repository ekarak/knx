/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const KnxConnection = require('./KnxConnection');
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

  var instance = new KnxConnection(options);

  instance.BindSocket = function( cb ) {
    if (this.debug) console.log('IpTunnelingConnection.prototype.BindSocket');
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      console.log('socket bound to %j', udpSocket.address());
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
  return instance;
}

module.exports = IpTunnelingConnection;
