/**
 * Created by aborovsky on 24.08.2015.
 * refactored by ekarakou
 */
var util = require('util');

var KnxProtocol = require('./KnxProtocol');
var KnxReceiver = require('./KnxReceiver');

function KnxReceiverIpTunneling(/*KnxConnection*/ connection) {
	if (connection.debug) console.log('new KnxReceiverIpTunneling');
    KnxReceiverIpTunneling.super_.call(this, connection);
}
util.inherits(KnxReceiverIpTunneling, KnxReceiver);

KnxReceiverIpTunneling.prototype.ProcessDatagramHeaders = function (/*KnxDatagram*/ datagram) {

    if (datagram.connstate.channel_id != this.connection.ChannelId) {
      console.log('ignoring datagram for connection %j', datagram.connstate);
      return;
    }

    if (datagram.connstate.seqnum <= this._rxSequenceNumber) {
      console.log('wrong sequence number: got %d, expected %d',
        datagram.connstate.seqnum, this._rxSequenceNumber
      );
      return;
    }

    this._rxSequenceNumber = datagram.connstate.seqnum;

    var response = JSON.parse(JSON.stringify(datagram));

    this.ProcessCEMI(datagram, cemi);

    this.connection.knxSender.SendTunnelingAck(sequenceNumber);
}

KnxReceiverIpTunneling.prototype.ProcessDisconnectRequest = function (/*buffer*/ datagram) {
    if (channelId != this.connection.ChannelId)
        return;

    this.stop();
    this.connection.emit('close');
    this.udpClient.close();
}

/*
 TODO: implement ack processing!
 */
KnxReceiverIpTunneling.prototype.ProcessTunnelingAck = function (/*buffer*/ datagram) {
    // do nothing
}


KnxReceiverIpTunneling.prototype.ProcessConnectionStateResponse = function (datagram) {

    var response = datagram[7];
    if (response != 0x21) {
        this.connection.emit('alive');
        return;
    }
    if (this.connection.debug)
        console.log("KnxReceiverIpTunneling: Received connection state response - No active connection with channel ID %s", datagram.connstate.channel_id);
    this.connection.Disconnect();
}

KnxReceiverIpTunneling.prototype.ProcessConnectResponse = function (/*buffer*/ datagram) {

    if (datagram.connstate.channel_id == 0x00 && datagram.connstate.status == 0x24)
        throw "KnxReceiverIpTunneling: Received connect response - No more connections available";
    else {
        this.connection.ChannelId = datagram.connstate.channel_id;
        this.connection.ResetSequenceNumber();
        this.connection.connected = true;
        this.connection.emit('connected');
    }
}

module.exports = KnxReceiverIpTunneling;
