/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/
const os = require('os');
const dgram = require('dgram');
const machina = require('machina');
const util = require('util');
const DPTLib = require('./dptlib');
const KnxConstants = require('./KnxConstants.js');
const KnxNetProtocol = require('./KnxProtocol.js');
const KnxConnection = require('./KnxConnectionFSM.js');

// bind incoming UDP packet handler
KnxConnection.prototype.onUdpSocketMessage = function(msg, rinfo, callback) {
  // get the incoming packet's service type ...
  var reader = KnxNetProtocol.createReader(msg);
  reader.KNXNetHeader('tmp');
  var dg = reader.next()['tmp'];
  if (dg) {
    var svctype = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
    // append the CEMI service type if this is a tunneling request...
    var cemitype = (dg.service_type == 1056) ?
      KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode)
      : "";
    this.debugPrint(util.format(
      "Received %s(/%s) message: %j", svctype, cemitype, dg
    ));
    // ... to drive the state machine
    var signal = util.format('inbound_%s', svctype);
    this.handle(signal, dg);
  } else {
    this.debugPrint(util.format(
      "Incomplete/unparseable UDP packet: %j", msg
    ));
  }
};

KnxConnection.prototype.AddConnState = function (datagram) {
  datagram.connstate = {
    channel_id:      this.channel_id,
    state:           0
  }
}

KnxConnection.prototype.AddTunnState = function (datagram) {
  // add the remote IP router's endpoint
  datagram.tunnstate = {
    channel_id:      this.channel_id,
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
}

KnxConnection.prototype.AddCRI = function (datagram) {
  // add the CRI
  datagram.cri = {
    connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
    knx_layer:       KnxConstants.KNX_LAYER.LINK_LAYER,
    unused:          0
  }
}

KnxConnection.prototype.AddCEMI = function(datagram, msgcode) {
  datagram.cemi = {
    msgcode: msgcode || 0x11, // default: L_Data.req
    ctrl: {
      frameType   : 1, // 0=extended 1=standard
      reserved    : 0, // always 0
      repeat      : 1, // the OPPOSITE: 1=do NOT repeat
      broadcast   : 1, // 0-system broadcast 1-broadcast
      priority    : 3, // 0-system 1-normal 2-urgent 3-low
      acknowledge : 1, // FIXME: only for L_Data.req
      confirm     : 0, // FIXME: only for L_Data.con 0-ok 1-error
      // 2nd byte
      destAddrType: 1, // FIXME: 0-physical 1-groupaddr
      hopCount    : 5,
      extendedFrame: 0
    },
    src_addr: "15.15.15", // FIXME: add local physical address property
    dest_addr: "0/0/0", //
    apdu: {
      // default operation is GroupValue_Write
      apci: KnxConstants.APCICODES.indexOf('GroupValue_Write'),
      tpci: 0,
      data: 0
    }
  }
}

/*
* submit an outbound request to the state machine
*
* type: service type
* datagram_template:
*    if a datagram is passed, use this as
*    if a function is passed, use this to DECORATE
*    if NULL, then construct a new empty datagram. Look at AddXXX methods
*/
KnxConnection.prototype.Request = function (type, datagram_template, callback) {
  var self = this;
  var datagram;
  if (datagram_template != null) {
    datagram = (typeof datagram_template == 'function') ?
      datagram_template(this.prepareDatagram( type )) :
      datagram_template;
  } else {
    datagram = this.prepareDatagram( type );
  }
  // make sure that we override the datagram service type!
  datagram.service_type = type;
  var st = KnxConstants.keyText('SERVICE_TYPE', type);
  // hand off the outbound request to the state machine
  self.handle ( 'outbound_'+st, datagram );
  if (typeof callback === 'function') callback();
}

// prepare a datagram for the given service type
KnxConnection.prototype.prepareDatagram = function (svcType) {
  var datagram = {
    "header_length":    6,
    "protocol_version": 16, // 0x10 == version 1.0
    "service_type": svcType,
    "total_length": null, // filled in automatically
  }
  //
  this.AddHPAI(datagram);
  //
  switch(svcType) {
    case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST:
      this.AddCRI(datagram); // no break!
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
    case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
      this.AddConnState(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
      this.AddTunnState(datagram);
      datagram.tunnstate.seqnum = this.sendSeqNum;
      this.AddCEMI(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
      this.AddTunnState(datagram);
      datagram.tunnstate.seqnum = this.recvSeqNum;
      break;
    default:
      console.trace('Do not know how to deal with svc type %d', svcType);
  }
  return datagram;
}

/*
send the telegram over the wire
*/
KnxConnection.prototype.send = function(telegram, callback) {
  var conn = this;

  // select which UDP channel we should use (control/tunnel)
  var channel = [
    KnxConstants.SERVICE_TYPE.CONNECT_REQUEST,
    KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST,
    KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST]
    .indexOf(telegram.service_type) > -1 ?  this.control : this.tunnel;
  try {
    var cemitype ;
    this.writer = KnxNetProtocol.createWriter();
    // append the CEMI service type if this is a tunneling request...
    if (telegram.service_type == 1056) { // KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST)
      cemitype = KnxConstants.keyText('MESSAGECODES', telegram.cemi.msgcode);
    }
    var packet = this.writer.KNXNetHeader(telegram);
    var buf = packet.buffer;
    var svctype = KnxConstants.keyText('SERVICE_TYPE', telegram.service_type);
    this.debugPrint(util.format(
      'Sending %s(/%s) %j (%d bytes) from port %d ==> %j',
      svctype, cemitype, buf, buf.length, channel.address().port, telegram
    ));
    channel.send(
      buf, 0, buf.length,
      conn.remoteEndpoint.port, conn.remoteEndpoint.addr,
      function (err) {
        conn.debugPrint(util.format(
          'UDP sent %d bytes to %j, err[' + (err ? err.toString() : 'no_err') + ']',
          buf.length, conn.remoteEndpoint));
        if (typeof callback === 'function') callback(err);
    });
    callback && callback();
  }
  catch (e) {
    console.log(util.format("*** ERROR: %s, %j", e, e.stack));
  }

}

KnxConnection.prototype.write = function(grpaddr, apdu_data, dptid, callback) {
  if (grpaddr == null || apdu_data == null) {
    console.trace('must supply both grpaddr(%j) and apdu_data(%j)!', grpaddr, apdu_data);
    return;
  }
  if (dptid) {
    var dpt = DPTLib.resolve(dptid);
    if (typeof dpt.formatAPDU == 'function') {
      apdu_data = dpt.formatAPDU(apdu_data);
    } else {
      console.trace('---- no formatAPDU found in %s, passing raw value instead', dptid);
    }
  }
  // outbound request onto the state machine
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST, function(datagram) {
    datagram.cemi.dest_addr = grpaddr;
    datagram.cemi.apdu.data = apdu_data;
    //console.trace('----- writing to %s apdu_data: %j', grpaddr, apdu_data);
    return datagram;
  }, callback);
}

KnxConnection.prototype.read = function(grpaddr, callback) {
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST, function(datagram) {
    // this is a READ request
    datagram.cemi.apdu.apci = KnxConstants.APCICODES.indexOf("GroupValue_Read");
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  }, callback);
}

KnxConnection.prototype.Disconnect = function(msg) {
  this.transition("disconnecting");
  // machina.js removeAllListeners equivalent:
  // this.off();
}

KnxConnection.prototype.debugPrint = function(msg) {
  if (this.debug) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log('%s (%s): %s', ts, this.compositeState(), msg);
  }
}

KnxConnection.prototype.incSeqSend = function () {
  this.sendSeqNum = (this.sendSeqNum + 1) & 0xFF;
};

KnxConnection.prototype.incSeqRecv = function () {
  this.recvSeqNum = (this.recvSeqNum + 1) & 0xFF;
};

module.exports = KnxConnection;
