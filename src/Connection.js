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
		this.udpClient = null;
    this.connected = false;
    this.ThreeLevelGroupAddressing = true;
    this.remoteEndpoint = { addr: options.ipAddr, port: options.ipPort || 3671 };
    this.incomingPacketCounter = 0 ;
    this._sequenceNumber = null; //byte
    this.ChannelId = 0x00;
}

util.inherits(Connection, EventEmitter);


Connection.prototype.GenerateSequenceNumber = function () {
    return this._sequenceNumber++;
}

Connection.prototype.RevertSingleSequenceNumber = function () {
    this._sequenceNumber--;
}

Connection.prototype.ResetSequenceNumber = function () {
    this._sequenceNumber = 0x00;
}

// <summary>
///     Start the connection
/// </summary>

Connection.prototype.Connect = function (callback) {
  var conn = this;
  this.udpClient = dgram.createSocket("udp4");
  // call connection-specific binding method
  this.BindSocket( function() {
    // bind incoming UDP packet handler
    conn.udpClient.on("message", function(msg, rinfo, callback) {
      console.log("received message: %j from %j:%d", msg, rinfo.address, rinfo.port);
      var reader = KnxNetProtocol.createReader(msg);
      reader.KNXNetHeader('packet'+this.incomingPacketCounter);
      conn.lastRcvdDatagram = reader.next()['packet'+this.incomingPacketCounter];
      console.log("decoded packet: %j", conn.lastRcvdDatagram);
      // get the incoming packet's service type...
      var st = KnxConstants.keyText('SERVICE_TYPE', conn.lastRcvdDatagram.service_type);
      // ... to drive the state machinej
      console.log('* %s => %j', st, KnxNetStateMachine.compositeState(conn))
      //if (typeof KnxNetStateMachine[st] == 'function') {
        console.log('dispatching %s to state machine', st);
        KnxNetStateMachine.handle(conn, st);
      //}
    });
    KnxNetStateMachine.on('connected', callback);
    KnxNetStateMachine.transition(conn, 'connecting');
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

Connection.prototype.AddHPAI = function (datagram) {
  // add the tunneling request local endpoint
  datagram.hpai = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.localAddress + ":" + this.udpClient.address().port
  };
}
Connection.prototype.AddTunn = function (datagram) {
  // add the remote IP router's endpoint
  datagram.tunn = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
}
Connection.prototype.AddCRI = function (datagram) {
  // add the CRI
  datagram.cri = {
    connection_type:4, knx_layer:2, unused:0
  }
}
Connection.prototype.AddConnHAPI = function (datagram) {
  datagram.connstate = {
    channel_id: this.channel_id,
    seqnum: this._sequenceNumber
  }
}

Connection.prototype.Request = function (type, callback) {
  var datagram = this.prepareDatagram( type );
  var st = KnxConstants.keyText('SERVICE_TYPE', type);
	if (this.debug) console.log("Sending %s %j", st, datagram);
  try {
    this.writer = KnxNetProtocol.createWriter();
    var packet = this.writer.KNXNetHeader(datagram);
    this.Send(packet.buffer, callback);
  }
  catch (e) {
    console.log(e);
    if (typeof callback === 'function') callback();
  }
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
      this.AddTunn(datagram);
      this.AddCRI(datagram);
    }
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST: {
      this.AddConnHAPI(datagram);
      this.AddTunn(datagram);
      this.AddCRI(datagram);
    }
  }

  if (this.connection && this.connection.ChannelId) {
    datagram.connstate = {
      "channel_id": this.connection.ChannelId,
      "seqnum":     this.connection.GenerateSequenceNumber()
    };
  }
  return datagram;
}

Connection.prototype.Send = function(datagram) {
  console.log("WARNING: not sending datagram, you need to override Connection.Send() function");
}

module.exports = Connection;
