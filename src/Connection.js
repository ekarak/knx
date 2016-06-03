/**
 *
 */
var os = require('os');
var util = require('util');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;

var CONNECT_TIMEOUT = 5000;

// an array of all available IPv4 addresses
var localAddresses = [];
var interfaces = os.networkInterfaces();
for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
        var intf = interfaces[k][k2];
        if (intf.family === 'IPv4' && !intf.internal) {
            localAddresses.push(intf.address);
        }
    }
}

/*
* set up the IP connection. TODO: factor out to prepare for USB local connections support
*/
function Connection(options) {
    Connection.super_.call(this);
		// set the local IP endpoint
		this.localAddress = null;
		if (localAddresses.length == 0) {
      // no local IpV4 interfaces? where are we? which year?
			throw "No valid IPv4 interfaces detected";
		} else if (localAddresses.length == 1) {
			console.log("Using %s as local IP for KNX traffic", localAddresses[0]);
			this.localAddress = localAddresses[0];
		} else {
			for (var k2 in interfaces[intf]) {
					var intf = interfaces[k][k2];
					if (intf.family === 'IPv4' && !intf.internal && intf.name === options.interface) {
						console.log("Using %s as local IP for KNX traffic", intf.address);
						this.localAddress = intf.address;
					}
			}
			if (!this.localAddresses) {
				throw "You must supply a valid network interface for KNX traffic";
			}
		}
		this.udpClient = null;
    this.connected = false;
    this.ThreeLevelGroupAddressing = true;
    this.remoteEndpoint = { addr: options.ipAddr, port: options.ipPort || 3671 };
}

util.inherits(Connection, EventEmitter);

/// <summary>
///     Send a byte array value as data to specified address
/// </summary>
/// <param name="address">KNX Address</param>
/// <param name="data">Byte array value or integer</param>

Connection.prototype.Action = function (address, data, callback) {
    if (this.debug)
        console.log("[%s] Sending %s to %s.", this.constructor.name, JSON.stringify(data), JSON.stringify(address));
    this.knxSender.Action(address, data, callback);
    if (this.debug)
        console.log("[%s] Sent %s to %s.", this.constructor.name, JSON.stringify(data), JSON.stringify(address));
}

// TODO: It would be good to make a type for address, to make sure not any random string can be passed in
/// <summary>
///     Send a request to KNX asking for specified address current status
/// </summary>
/// <param name="address"></param>
Connection.prototype.RequestStatus = function (address, callback) {
    if (this.debug)
        console.log("[%s] Sending request status to %s.", this.constructor.name, JSON.stringify(address));
    this.knxSender.RequestStatus(address, callback);
    if (this.debug)
        console.log("[%s] Sent request status to %s.", this.constructor.name, JSON.stringify(address));
}

/// <summary>
///     Convert a value received from KNX using datapoint translator, e.g.,
///     get a temperature value in Celsius
/// </summary>
/// <param name="type">Datapoint type, e.g.: 9.001</param>
/// <param name="data">Data to convert</param>
/// <returns></returns>
Connection.prototype.FromDataPoint = function (type, /*buffer*/data) {
    return DataPointTranslator.Instance.FromDataPoint(type, data);
}

/// <summary>
///     Convert a value to send to KNX using datapoint translator, e.g.,
///     get a temperature value in Celsius in a byte representation
/// </summary>
/// <param name="type">Datapoint type, e.g.: 9.001</param>
/// <param name="value">Value to convert</param>
/// <returns></returns>
Connection.prototype.ToDataPoint = function (type, value) {
    return DataPointTranslator.Instance.ToDataPoint(type, value);
}

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
		if (this.debug) console.log("connecting...");

    function clearReconnectTimeout() {
        if (self.reConnectTimeout) {
            clearTimeout(self.reConnectTimeout);
            delete self.reConnectTimeout;
        }
    }

    function clearConnectTimeout() {
        if (self.connectTimeout) {
            clearTimeout(self.connectTimeout);
            delete self.connectTimeout;
        }
    }

    if (this.connected && this.udpClient) {
        if (typeof callback === 'function') callback();
        return true;
    }

    this.connectTimeout = setTimeout(function () {
        self.removeListener('connected', clearConnectTimeout);
        self.Disconnect(function () {
            if (self.debug)
                console.log('Error connecting: timeout');
            if (typeof callback === 'function') callback({
							msg: 'Error connecting: timeout', reason: 'CONNECTTIMEOUT'
						});
            clearReconnectTimeout();
            this.reConnectTimeout = setTimeout(function () {
                if (self.debug)
                    console.log('reconnecting');
                self.Connect(callback);
            }, 3 * CONNECT_TIMEOUT);
        });
    }, CONNECT_TIMEOUT);
    this.once('connected', clearConnectTimeout);
    if (callback) {
        this.removeListener('connected', callback);
        this.once('connected', callback);
    }
    // try {
        if (this.udpClient != null) {
            try {
                this.udpClient.close();
                //this.udpClient.Client.Dispose();
            }
            catch (e) {
                // ignore
            }
        }
        this.udpClient = dgram.createSocket("udp4");
    //} catch (e) {
      //  throw new ConnectionErrorException(e);
    //}

		this.InitialiseSenderReceiver();
		if (self.debug) console.log("initialised sender and receiver...");

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

Connection.prototype.ConnectRequest = function (callback) {
	if (this.debug) console.log("ConnectRequest: init");
  var datagram = this.prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST);
  // add the tunneling request local endpoint
  datagram.hpai = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.localAddress + ":" + this.udpClient.address().port
  };
  // add the remote IP router's endpoint
  datagram.tunn = {
    protocol_type:1, // UDP
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
  // add the CRI
  datagram.cri = {
    connection_type:4, knx_layer:2, unused:0
  }
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
  try {
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

Connection.prototype.Write = function() {
    var datagram = prepareDatagram(KnxConstants.SERVICE_TYPE.TUNNELLING_REQUEST);
}

module.exports = Connection;
