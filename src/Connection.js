/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var os = require('os');
var dgram = require('dgram');
var util = require('util');

var machina = require('machina');

var FSM = require('./FSM.js');
var DPTLib = require('./dptlib');
var KnxConstants = require('./KnxConstants.js');
var KnxNetProtocol = require('./KnxProtocol.js');

// bind incoming UDP packet handler
FSM.prototype.onUdpSocketMessage = function(msg, rinfo, callback) {
  // get the incoming packet's service type ...
  try {
    var reader = KnxNetProtocol.createReader(msg);
    reader.KNXNetHeader('tmp');
    var dg = reader.next()['tmp'];
    var descr = this.datagramDesc(dg);
    this.debugPrint(util.format(
      "Received %s message: %j", descr, dg
    ));
    if (!isNaN(this.channel_id) &&
      ((dg.hasOwnProperty('connstate') &&
          dg.connstate.channel_id != this.channel_id) ||
        (dg.hasOwnProperty('tunnstate') &&
          dg.tunnstate.channel_id != this.channel_id))) {
      this.debugPrint(util.format(
        "*** Ignoring %s datagram for other channel (own: %d)",
        descr, this.channel_id));
    } else {
      // ... to drive the state machine (eg "inbound_TUNNELING_REQUEST_L_Data.ind")
      var signal = util.format('inbound_%s', descr);
      this.handle(signal, dg);
    }
  } catch(err) {
    console.log(err.stack);
    this.debugPrint(util.format(
      "%s: Incomplete/unparseable UDP packet: %s", err, msg.toString('hex')
    ));
  }
};

FSM.prototype.AddConnState = function(datagram) {
  datagram.connstate = {
    channel_id: this.channel_id,
    state: 0
  }
}

FSM.prototype.AddTunnState = function(datagram) {
  // add the remote IP router's endpoint
  datagram.tunnstate = {
    channel_id: this.channel_id,
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
}

FSM.prototype.AddCRI = function(datagram) {
  // add the CRI
  datagram.cri = {
    connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
    knx_layer: KnxConstants.KNX_LAYER.LINK_LAYER,
    unused: 0
  }
}

FSM.prototype.AddCEMI = function(datagram, msgcode) {
  datagram.cemi = {
    msgcode: msgcode || 0x11, // default: L_Data.req for tunneling
    ctrl: {
      frameType: 1, // 0=extended 1=standard
      reserved: 0, // always 0
      repeat: 1, // the OPPOSITE: 1=do NOT repeat
      broadcast: 1, // 0-system broadcast 1-broadcast
      priority: 3, // 0-system 1-normal 2-urgent 3-low
      acknowledge: (msgcode || 0x11) == 0x11 ? 1 : 0, // only for L_Data.req
      confirm: 0, // FIXME: only for L_Data.con 0-ok 1-error
      // 2nd byte
      destAddrType: 1, // FIXME: 0-physical 1-groupaddr
      hopCount: 6,
      extendedFrame: 0
    },
    src_addr: this.options.physAddr || "15.15.15",
    dest_addr: "0/0/0", //
    apdu: {
      // default operation is GroupValue_Write
      apci: 'GroupValue_Write',
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
 *    if NULL, then just make a new empty datagram. Look at AddXXX methods
 */
FSM.prototype.Request = function(type, datagram_template, callback) {
  var self = this;
  // populate skeleton datagram
  var datagram = this.prepareDatagram(type);
  // decorate the datagram, if a function is passed
  if (typeof datagram_template == 'function') {
    datagram_template(datagram);
  }
  // make sure that we override the datagram service type!
  datagram.service_type = type;
  var st = KnxConstants.keyText('SERVICE_TYPE', type);
  // hand off the outbound request to the state machine
  self.handle('outbound_' + st, datagram);
  if (typeof callback === 'function') callback();
}

// prepare a datagram for the given service type
FSM.prototype.prepareDatagram = function(svcType) {
  var datagram = {
      "header_length": 6,
      "protocol_version": 16, // 0x10 == version 1.0
      "service_type": svcType,
      "total_length": null, // filled in automatically
    }
    //
  this.AddHPAI(datagram);
  //
  switch (svcType) {
    case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST:
      this.AddTunn(datagram);
      this.AddCRI(datagram); // no break!
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
    case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
      this.AddConnState(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
      this.AddCEMI(datagram, KnxConstants.MESSAGECODES['L_Data.ind']);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
      this.AddTunn(datagram);
      this.AddTunnState(datagram);
      this.AddCEMI(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
      this.AddTunnState(datagram);
      break;
    default:
      console.trace('Do not know how to deal with svc type %d', svcType);
  }
  //console.log(datagram);
  return datagram;
}

/*
send the datagram over the wire
*/
FSM.prototype.send = function(datagram, callback) {
  var conn = this;
  //try {
  var cemitype;
  this.writer = KnxNetProtocol.createWriter();
  switch (datagram.service_type) {
    case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
      // append the CEMI service type if this is a tunneling request...
      cemitype = KnxConstants.keyText('MESSAGECODES', datagram.cemi.msgcode);
      break;
  }
  var packet = this.writer.KNXNetHeader(datagram);
  var buf = packet.buffer;
  var svctype = KnxConstants.keyText('SERVICE_TYPE', datagram.service_type);
  var descr = this.datagramDesc(datagram);
  this.debugPrint(util.format('Sending %s ==> %j', descr, datagram));
  this.socket.send(
    buf, 0, buf.length,
    conn.remoteEndpoint.port, conn.remoteEndpoint.addr.toString(),
    function(err) {
      conn.debugPrint(util.format('UDP send %s: %s %s',
        (err ? err.toString() : 'OK'), descr, buf.toString('hex')
      ));
      if (typeof callback === 'function') callback(err);
    }
  );
  /*} catch (e) {
    console.log(util.format("*** ERROR: %s", e));
  }*/
}

FSM.prototype.write = function(grpaddr, value, dptid, callback) {
  if (grpaddr == null || value == null) {
    console.trace('You must supply both grpaddr and value!');
    return;
  }
  // outbound request onto the state machine
  var serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function(datagram) {
    DPTLib.populateAPDU(value, datagram.cemi.apdu, dptid);
    datagram.cemi.dest_addr = grpaddr;
  }, callback);
}

FSM.prototype.respond = function(grpaddr, value, dptid) {
  if (grpaddr == null || value == null) {
    console.trace('You must supply both grpaddr and value!');
    return;
  }
  var serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function(datagram) {
    DPTLib.populateAPDU(value, datagram.cemi.apdu, dptid);
    // this is a READ request
    datagram.cemi.apdu.apci = "GroupValue_Response";
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  });
}

FSM.prototype.writeRaw = function(grpaddr, value, bitlength, callback) {
  if (grpaddr == null || value == null) {
    console.trace('You must supply both grpaddr and value!');
    return;
  }
  if (!Buffer.isBuffer(value)) {
    console.trace('Value must be a buffer!');
    return;
  }
  // outbound request onto the state machine
  var serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function(datagram) {
    datagram.cemi.apdu.data = value;
    datagram.cemi.apdu.bitlength = bitlength ? bitlength : (value.byteLength * 8);
    datagram.cemi.dest_addr = grpaddr;
  }, callback);
}

// send a READ request to the bus
// you can pass a callback function which gets bound to the RESPONSE datagram event
FSM.prototype.read = function(grpaddr, callback) {
  if (typeof callback == 'function') {
    var conn = this;
    // when the response arrives:
    var responseEvent = 'GroupValue_Response_' + grpaddr;
    this.debugPrint('Binding connection to ' + responseEvent);
    var binding = function(src, data) {
        // unbind the event handler
        conn.off(responseEvent, binding);
        // fire the callback
        callback(src, data);
      }
      // prepare for the response
    this.on(responseEvent, binding);
    // clean up after 3 seconds just in case no one answers the read request
    setTimeout(function() {
      conn.off(responseEvent, binding);
    }, 3000);
  }
  var serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function(datagram) {
    // this is a READ request
    datagram.cemi.apdu.apci = "GroupValue_Read";
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  });
}

FSM.prototype.Disconnect = function(msg) {
  this.transition("disconnecting");
  // machina.js removeAllListeners equivalent:
  // this.off();
}

FSM.prototype.debugPrint = function(msg) {
  if (this.options.debug) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/Z$/, '');
    console.log('%s (%s):\t%s', ts, this.compositeState(), msg);
  }
}

// return a descriptor for this datagram (TUNNELING_REQUEST_L_Data.ind)
FSM.prototype.datagramDesc = function(dg) {
  var blurb = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
  if (dg.service_type == KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST ||
      dg.service_type == KnxConstants.SERVICE_TYPE.ROUTING_INDICATION) {
    blurb += '_' + KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode);
  }
  return blurb;
}

// add the control udp local endpoint. UPDATE: not needed apparnently?
FSM.prototype.AddHPAI = function(datagram) {
  datagram.hpai = {
    protocol_type: 1, // UDP
    //tunnel_endpoint: this.localAddress + ":" + this.control.address().port
    tunnel_endpoint: '0.0.0.0:0'
  };
}

// add the tunneling udp local endpoint UPDATE: not needed apparently?
FSM.prototype.AddTunn = function(datagram) {
  datagram.tunn = {
    protocol_type: 1, // UDP
    tunnel_endpoint: '0.0.0.0:0'
      //tunnel_endpoint: this.localAddress + ":" + this.tunnel.address().port
  };
}

Connection = function(options) {
  var conn = new FSM(options);
  // register with the FSM any event handlers passed into the options object
  if (typeof options.handlers === 'object') {
    Object.keys(options.handlers).forEach(function(key) {
      if (typeof options.handlers[key] === 'function') {
        conn.on(key, options.handlers[key]);
      }
    });
  }
  // boot up the KNX connection unless told otherwise
  if (!options.manualConnect) conn.Connect();
  return (conn);
}

module.exports = Connection;
