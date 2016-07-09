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
    var self = this;
    this.udpClient = dgram.createSocket("udp4");
    this.BindSocket();
    //
    this.udpClient.on("message", function (msg, rinfo) {
      console.log("received message: %j from %j:%d", msg, rinfo.address, rinfo.port);
      // TODO: dispatch incoming message
    });

    if (this.debug) console.log("connecting...");
    KnxNetStateMachine.connect(this);

    new Promise(function (fulfill, reject) {
			if (self.debug) console.log("Starting receiver...");
        self.knxReceiver.Start(fulfill);
    	})
      .then(function () {
				if (self.debug) console.log("InitializeStateRequest...");
          self.InitializeStateRequest();
      })
      .then(function () {
				if (self.debug) console.log("ConnectRequest...");
          self.ConnectRequest();
      })
      .then(function () {
          self.emit('connect');
          self.emit('connecting');
      });
}

/// <summary>
///     Stop the connection
/// </summary>
Connection.prototype.Disconnect = function (callback) {
    var self = this;
		if (self.debug) console.log("Disconnect...");
    if (callback)
        self.once('disconnect', callback);

    try {
        this.TerminateStateRequest();
        new Promise(function (fulfill, reject) {
            self.DisconnectRequest(fulfill);
        })
            .then(function () {
                self.knxReceiver.Stop();
                self.udpClient.close();
                self.connected = false;
                self.emit('close');
                self.emit('disconnect');
                self.emit('disconnected');
            })

    }
    catch (e) {
        self.emit('disconnect', e);
    }

}

Connection.prototype.InitializeStateRequest = function () {
    var self = this;
    this._stateRequestTimer = setInterval(function () {
        timeout(function (fulfill) {
            self.removeListener('alive', fulfill);
            self.StateRequest(function (err) {
                if (!err)
                    self.once('alive', function () {
                        fulfill();
                    });
            });
        }, 2 * CONNECT_TIMEOUT, function () {
            if (self.debug)
                console.log('connection stale, so disconnect and then try to reconnect again');
            new Promise(function (fulfill) {
                self.Disconnect(fulfill);
            }).then(function () {
                  self.Connect();
            });
        });
    }, 60000); // same time as ETS with group monitor open
}

Connection.prototype.TerminateStateRequest = function () {
    if (this._stateRequestTimer == null)
        return;
    clearTimeout(this._stateRequestTimer);
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
Connection.prototype.ConnectRequest = function (callback) {
	if (this.debug) console.log("ConnectRequest: init");
  var datagram = this.prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST);
  this.AddHPAI(datagram);
  this.AddTunn(datagram);
  this.AddCRI(datagram);
  try {
    this.knxSender.SendDataSingle(datagram, callback);
  }
  catch (e) {
    console.log(e);
    if (typeof callback === 'function') callback();
  }
}

Connection.prototype.StateRequest = function (callback) {
  if (this.debug) console.log("ConnectRequest: init");
  var datagram = prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST);
  datagram.hpai.ip_addr = this.localAddress; // FIXME
  datagram.hpai.ip_port = this.udpClient.address().port;
  try {
    this.knxSender.SendData(datagram, callback);
  }
  catch (e) {
    callback(e)
  }
}

Connection.prototype.DisconnectRequest = function (callback) {
  if(!this.connected) {
      callback && callback();
      return false;
  }
  var datagram = prepareDatagram(KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST);
  try {var elf = this;
    this.knxSender.SendData(datagram, callback);
  }
  catch (e) {
    callback(e)
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

Connection.prototype.Write = function() {
    var datagram = this.prepareDatagram(KnxConstants.SERVICE_TYPE.TUNNELLING_REQUEST);
    console.log("%j", datagram);
}

module.exports = Connection;
