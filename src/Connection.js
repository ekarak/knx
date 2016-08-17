/**
 *
 */
var os = require('os');
var util = require('util');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var KnxNetStateMachine = require('./KnxNetStateMachine');
const KnxNetProtocol = require('./KnxProtocol.js');

var CONNECT_TIMEOUT = 5000;

// an array of all available IPv4 addresses
var candidateInterfaces = [];
var interfaces = os.networkInterfaces();
for (var k in interfaces) {
    //console.log('k: %j', k);
    for (var k2 in interfaces[k]) {
        var intf = interfaces[k][k2];
        //console.log('k2: %j, intf: %j', k, intf);
        if (intf.family == 'IPv4' && !intf.internal) {
          console.log("===candidate interface: %j===", intf);
            candidateInterfaces.push(intf);
        }
    }
}

/*
* set up the IP connection. TODO: factor out to prepare for USB local connections support
*/
function Connection(options) {
    Connection.super_.call(this);
    // set up the state machine
		// set the local IP endpoint
		this.localAddress = null;
		if (candidateInterfaces.length == 0) {
      // no local IpV4 interfaces?
			throw "No valid IPv4 interfaces detected";
		} else if (candidateInterfaces.length == 1) {
			console.log("Using %s as local IP for KNX traffic", candidateInterfaces[0].address);
			this.localAddress = candidateInterfaces[0].address;
		} else {
			candidateInterfaces.forEach( intf => {
				if (intf.family == 'IPv4' && !intf.internal && !this.localAddress) {
					console.log("=== Using %s as local IP for KNX traffic", intf.address);
					this.localAddress = intf.address;
				}
			})
			if (!this.localAddress) {
				throw "You must supply a valid network interface for KNX traffic";
			}
		}
    this.connected = false;
    this.ThreeLevelGroupAddressing = true;
    this.remoteEndpoint = { addr: options.ipAddr, port: options.ipPort || 3671 };
    this.incomingPacketCounter = 0 ;
}

util.inherits(Connection, EventEmitter);


Connection.prototype.GenerateSequenceNumber = function () {
    return this._sequenceNumber++;
}

Connection.prototype.RevertSingleSequenceNumber = function () {
    this._sequenceNumber--;
}

Connection.prototype.ResetSequenceNumber = function () {
    this._sequenceNumber = 0;
}

// <summary>
///     Start the connection
/// </summary>
Connection.prototype.Connect = function (callback) {
  var conn = this;
  // create a control socket for CONNECT, CONNECTIONSTATE and DISCONNECT
  conn.control = conn.BindSocket( function() {
    // create a tunnel socket for TUNNELING_REQUEST and friends
    conn.tunnel = conn.BindSocket( function() {
      // start connection sequence
      KnxNetStateMachine.transition(conn, 'connecting');
      KnxNetStateMachine.on('connected', callback);
    })
  });
}

/// <summary>
///     Stop the connection
/// </summary>
Connection.prototype.Disconnect = function (callback) {
    var self = this;
		if (self.debug) console.log("Disconnect...");
    throw "unimplemented"
}

Connection.prototype.AddConnState = function (datagram) {
  datagram.connstate = {
    channel_id: this.channel_id,
    seqnum:     this.GenerateSequenceNumber()
  }
}

Connection.prototype.AddTunnState = function (datagram) {
  // add the remote IP router's endpoint
  datagram.tunnstate = {
    channel_id: this.channel_id,
    seqnum:     this.GenerateSequenceNumber(),
    protocol_type:1, // UDP
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
}

Connection.prototype.AddCRI = function (datagram) {
  // add the CRI
  datagram.cri = {
    connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
    knx_layer:       KnxConstants.KNX_LAYER.LINK_LAYER,
    unused:          0
  }
}

Connection.prototype.AddCEMI = function(datagram) {
  datagram.cemi = {
    msgcode: 0x11, //L_Data.req
    ctrl: {
      frameType   : 1, // 0=extended 1=standard
      reserved    : 0,
      repeat      : 1,
      broadcast   : 0,
      priority    : 1, // 0-system 1-normal 2-urgent 3-low
      acknowledge : 1, // FIXME: only for L_Data.req
      confirm     : 0, // FIXME: only for L_Data.con 0-ok 1-error
      // 2nd byte
      destAddrType: 1, // FIXME: 0-physical 1-groupaddr
      hopCount    : 7,
      extendedFrame: 0
    },
    src_addr: "15.15.15", // FIXME: add local physical address property
    dest_addr: "0/0/15", // FIXME
    tpdu: 0x00,
    apdu: new Buffer([0,0]) // FIXME
  }
}
Connection.prototype.Request = function (type, callback) {
  var datagram = this.prepareDatagram( type );
  var st = KnxConstants.keyText('SERVICE_TYPE', type);
  // select which UDP channel we should use
  var channel = [
    KnxConstants.SERVICE_TYPE.CONNECT_REQUEST,
    KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST,
    KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST]
    .indexOf(type) > -1 ?  this.control : this.tunnel;
	if (this.debug) console.log("Sending %s %j via port %d", st, datagram, channel.address().port);
  try {
    this.writer = KnxNetProtocol.createWriter();
    var packet = this.writer.KNXNetHeader(datagram);
    KnxNetStateMachine.handle(this, st);
    this.Send(channel, packet.buffer, callback);
  }
  catch (e) {
    console.log(e, e.stack);
  }
  if (typeof callback === 'function') callback();
}

// prepare a datagram for the given service type
Connection.prototype.prepareDatagram = function (svcType) {
  var datagram = {
    "header_length":    6,
    "protocol_version": 16, // 0x10 == version 1.0
    "service_type": svcType,
    "total_length": null, // filled in automatically
  }
  this.AddHPAI(datagram);
  switch(svcType){
    case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST: {
      this.AddConnState(datagram);
      this.AddTunnState(datagram);
      this.AddCRI(datagram);
    }
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST: {
      this.AddConnState(datagram);
      this.AddTunnState(datagram);
      this.AddCRI(datagram);
    }
    case KnxConstants.SERVICE_TYPE.TUNNELLING_REQUEST: {
      this.AddTunnState(datagram);
      this.AddCEMI(datagram);
    }
  }
  return datagram;
}

Connection.prototype.Send = function(datagram) {
  console.log("WARNING: not sending datagram, you need to override Connection.Send() function");
}
Connection.prototype.Read = function(grpaddr) {
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELLING_REQUEST, function() {
    console.log('sent TUNNELING_REQUEST');
  });

}

module.exports = Connection;
