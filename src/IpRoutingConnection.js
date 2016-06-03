/**
 * KNX Routing support (IP Multicast)
 * Created by ekarak on 01.05.2016.
 */
var CONNECT_TIMEOUT = 5000;
var KnxConnection = require('./Connection');
var KnxReceiverRouting = require('./KnxReceiverIpRouting');
var KnxSenderRouting   = require('./KnxSenderIpRouting');

var util = require('util');
var dgram = require('dgram');
var Promise = require('promise');

/**
<summary>
  Initializes a new KNX routing connection with provided values. Make
 sure the local system allows UDP messages to the multicast group.
 </summary>
 <param name="mcastIpAddr">Multicast IP address (optional - default to 224.0.23.12)</param>
 <param name="mcastIpPort">Multicast IP port (optional - defaults to 3671)</param>
**/
function IpRoutingConnection(options) {
  if (!options) options = {};
  if (!options.ipAddr) options.ipAddr = '224.0.23.12';
  if (!options.ipPort) options.ipPort = 3671;
  IpRoutingConnection.super_.call(this, options);
}
util.inherits(IpRoutingConnection, KnxConnection);


/// <summary>
///     Bind the multicast socket
/// </summary>
IpRoutingConnection.prototype.BindSocket = function () {
	this.udpClient.bind(this.RemoteEndpoint.port, function() {
		console.log('adding multicast membership for %s', that.RemoteEndpoint.host);
		that.udpClient.addMembership(that.RemoteEndpoint.host);
	});

	this.udpClient.on("message", function (msg, rinfo) {
		console.log("multicast message: " + msg + " from " +
			rinfo.address + ":" + rinfo.port);
	});
}

IpRoutingConnection.prototype.InitialiseSenderReceiver = function() {
	if (this.knxReceiver == null || this.knxSender == null) {
			this.knxReceiver = new KnxReceiverRouting(this);
			this.knxSender = new KnxSenderRouting(this);
	}
}

IpRoutingConnection.prototype.GenerateSequenceNumber = function () {
    return this._sequenceNumber++;
}

IpRoutingConnection.prototype.RevertSingleSequenceNumber = function () {
    this._sequenceNumber--;
}

IpRoutingConnection.prototype.ResetSequenceNumber = function () {
    this._sequenceNumber = 0x00;
}




function delay(time) {
    return new Promise(function (fulfill, reject) {
        setTimeout(fulfill, time);
    });
}

function timeout(func, time, timeoutFunc) {

    var success = null;

    var succPromise = new Promise(function (fulfill, reject) {
        func(function () {
            if (success === null) {
                fulfill();
                success = true;
            }
            else
                reject();
        });
    });

    var timeoutPromise = delay(time);

    timeoutPromise.then(function () {
        if (!success)
            return timeoutFunc && timeoutFunc();
    });

    return Promise.race([succPromise, timeoutPromise]);
}

IpRoutingConnection.prototype.InitializeStateRequest = function () {
    var self = this;
		if (self.debug) console.log("IpRoutingConnection.prototype.InitializeStateRequest...");
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

IpRoutingConnection.prototype.TerminateStateRequest = function () {
	if (this.debug) console.log("IpRoutingConnection.prototype.TerminateStateRequest...");
    if (this._stateRequestTimer === null)
        return;
    clearTimeout(this._stateRequestTimer);
}

// TODO: I wonder if we can extract all these types of requests
IpRoutingConnection.prototype.ConnectRequest = function (callback) {
	if (this.debug) console.log("IpRoutingConnection.prototype.ConnectRequest...");
    // HEADER
    var datagram = new Buffer(26);
    datagram[0] = 0x06;
    datagram[1] = 0x10;
    datagram[2] = 0x02;
    datagram[3] = 0x05;
    datagram[4] = 0x00;
    datagram[5] = 0x1A;

    datagram[6] = 0x08;
    datagram[7] = 0x01;
    datagram[8] = this._localEndpoint.toBytes()[0];
    datagram[9] = this._localEndpoint.toBytes()[1];
    datagram[10] = this._localEndpoint.toBytes()[2];
    datagram[11] = this._localEndpoint.toBytes()[3];
    datagram[12] = (this._localEndpoint.port >> 8) & 255;
    datagram[13] = this._localEndpoint.port & 255;
    datagram[14] = 0x08;
    datagram[15] = 0x01;
    datagram[16] = this._localEndpoint.toBytes()[0];
    datagram[17] = this._localEndpoint.toBytes()[1];
    datagram[18] = this._localEndpoint.toBytes()[2];
    datagram[19] = this._localEndpoint.toBytes()[3];
    datagram[20] = (this._localEndpoint.port >> 8) & 255;
    datagram[21] = this._localEndpoint.port & 255;
    datagram[22] = 0x04;
    datagram[23] = 0x04;
    datagram[24] = 0x02;
    datagram[25] = 0x00;
    try {
        this.knxSender.SendDataSingle(datagram, callback);
    }
    catch (e) {
        if (typeof callback === 'function') callback();
    }
}

IpRoutingConnection.prototype.StateRequest = function (callback) {
    // HEADER
    var datagram = new Buffer(16);
    datagram[0] = 0x06;
    datagram[1] = 0x10;
    datagram[2] = 0x02;
    datagram[3] = 0x07;
    datagram[4] = 0x00;
    datagram[5] = 0x10;

    datagram[5] = this.ChannelId;
    datagram[7] = 0x00;
    datagram[8] = 0x08;
    datagram[9] = 0x01;
    datagram[10] = this._localEndpoint.toBytes()[0];
    datagram[11] = this._localEndpoint.toBytes()[1];
    datagram[12] = this._localEndpoint.toBytes()[2];
    datagram[13] = this._localEndpoint.toBytes()[3];
    datagram[14] = (this._localEndpoint.port >> 8) & 255;
    datagram[15] = this._localEndpoint.port & 255;

    try {
        this.knxSender.SendData(datagram, callback);
    }
    catch (e) {
        callback(e)
    }
}

IpRoutingConnection.prototype.DisconnectRequest = function (callback) {
    if(!this.connected) {
			  if (typeof callback === 'function') callback();
        return false;
    }
    // HEADER
    var datagram = new Buffer(16);
    datagram[0] = 0x06;
    datagram[1] = 0x10;
    datagram[2] = 0x02;
    datagram[3] = 0x09;
    datagram[4] = 0x00;
    datagram[5] = 0x10;

    datagram[6] = this.ChannelId;
    datagram[7] = 0x00;
    datagram[8] = 0x08;
    datagram[9] = 0x01;
    datagram[10] = this._localEndpoint.toBytes()[0];
    datagram[11] = this._localEndpoint.toBytes()[1];
    datagram[12] = this._localEndpoint.toBytes()[2];
    datagram[13] = this._localEndpoint.toBytes()[3];
    datagram[14] = (this._localEndpoint.port >> 8) & 255;
    datagram[15] = this._localEndpoint.port & 255;
    try {
        this.knxSender.SendData(datagram, callback);
    }
    catch (e) {
        callback(e)
    }
}

module.exports = IpRoutingConnection;
