/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const KnxConnection = require('./KnxConnection');

const util = require('util');
const dgram = require('dgram');

/**
  Initializes a new KNX routing connection with provided values. Make
 sure the local system allows UDP messages to the multicast group.
**/
function IpRoutingConnection(options) {

  if (!options) options = {};
  if (!options.ipAddr) options.ipAddr = '224.0.23.12';
  if (!options.ipPort) options.ipPort = 3671;

  var instance = new KnxConnection(options);

  instance.BindSocket = function( cb ) {
    var conn = this;
    var udpSocket = dgram.createSocket("udp4");
    udpSocket.bind(function() {
      instance.debugPrint(util.format(
        'IpRoutingConnection.BindSocket %j, add membership for %s',
        udpSocket.address(), conn.remoteEndpoint.addr
      ));
      conn.control.addMembership(conn.remoteEndpoint.addr);
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

  // <summary>
  ///     Start the connection
  /// </summary>
  instance.Connect = function (callback) {
    var sm = this;
    this.localAddress = this.getLocalAddress(this.options);
    this.control = this.tunnel = this.BindSocket( function(socket) {
      socket.on("message", function(msg, rinfo, callback)  {
        sm.debugPrint(util.format('Inbound multicast message %j: %j', rinfo, msg));
        sm.onUdpSocketMessage(msg, rinfo, callback);
      });
      // start connection sequence
      sm.transition( 'connecting' );
    });
    this.on('connected', callback);
  }

  return instance;
}

module.exports = IpRoutingConnection;
