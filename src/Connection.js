/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

const util = require('util');

const FSM = require('./FSM');
const DPTLib = require('./dptlib');
const KnxLog = require('./KnxLog');
const KnxConstants = require('./KnxConstants');
const KnxNetProtocol = require('./KnxProtocol');

// bind incoming UDP packet handler
FSM.prototype.onUdpSocketMessage = function (msg, rinfo, callback) {
  // get the incoming packet's service type ...
  try {
    const reader = KnxNetProtocol.createReader(msg);
    reader.KNXNetHeader('tmp');
    const dg = reader.next()['tmp'];
    const descr = datagramDesc(dg);
    KnxLog.get().trace('(%s): Received %s message: %j', this.compositeState(), descr, dg);
    if (!isNaN(this.channel_id) &&
      ((dg.hasOwnProperty('connstate') &&
          dg.connstate.channel_id != this.channel_id) ||
        (dg.hasOwnProperty('tunnstate') &&
          dg.tunnstate.channel_id != this.channel_id))) {
      KnxLog.get().trace('(%s): *** Ignoring %s datagram for other channel (own: %d)',
        this.compositeState(), descr, this.channel_id);
    } else {
      // ... to drive the state machine (eg "inbound_TUNNELING_REQUEST_L_Data.ind")
      const signal = util.format('inbound_%s', descr);
      if (descr === "DISCONNECT_REQUEST") {
        KnxLog.get().info("empty internal fsm queue due to %s: ", signal);
        this.clearQueue();
      }
      this.handle(signal, dg);
    }
  } catch (err) {
    KnxLog.get().debug('(%s): Incomplete/unparseable UDP packet: %s: %s',
      this.compositeState(), err, msg.toString('hex')
    );
  }
};

FSM.prototype.AddConnState = function (datagram) {
  datagram.connstate = {
    channel_id: this.channel_id,
    state: 0
  }
}

FSM.prototype.AddTunnState = function (datagram) {
  // add the remote IP router's endpoint
  datagram.tunnstate = {
    channel_id: this.channel_id,
    tunnel_endpoint: this.remoteEndpoint.addr + ':' + this.remoteEndpoint.port
  }
}

const AddCRI = (datagram) => {
  // add the CRI
  datagram.cri = {
    connection_type: KnxConstants.CONNECTION_TYPE.TUNNEL_CONNECTION,
    knx_layer: KnxConstants.KNX_LAYER.LINK_LAYER,
    unused: 0
  }
}

FSM.prototype.AddCEMI = function (datagram, msgcode) {
  const sendAck = ((msgcode || 0x11) == 0x11) && !this.options.suppress_ack_ldatareq; // only for L_Data.req
  datagram.cemi = {
    msgcode: msgcode || 0x11, // default: L_Data.req for tunneling
    ctrl: {
      frameType: 1, // 0=extended 1=standard
      reserved: 0, // always 0
      repeat: 1, // the OPPOSITE: 1=do NOT repeat
      broadcast: 1, // 0-system broadcast 1-broadcast
      priority: 3, // 0-system 1-normal 2-urgent 3-low
      acknowledge: sendAck ? 1 : 0,
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
FSM.prototype.Request = function (type, datagram_template, callback) {
  // populate skeleton datagram
  const datagram = this.prepareDatagram(type);
  // decorate the datagram, if a function is passed
  if (typeof datagram_template == 'function') {
    datagram_template(datagram);
  }
  // make sure that we override the datagram service type!
  datagram.service_type = type;
  const st = KnxConstants.keyText('SERVICE_TYPE', type);
  // hand off the outbound request to the state machine
  this.handle('outbound_' + st, datagram);
  if (typeof callback === 'function') callback();
}

// prepare a datagram for the given service type
FSM.prototype.prepareDatagram = function (svcType) {
  const datagram = {
    "header_length": 6,
    "protocol_version": 16, // 0x10 == version 1.0
    "service_type": svcType,
    "total_length": null, // filled in automatically
  }
  //
  AddHPAI(datagram);
  //
  switch (svcType) {
    case KnxConstants.SERVICE_TYPE.CONNECT_REQUEST:
      AddTunn(datagram);
      AddCRI(datagram); // no break!
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
    case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
      this.AddConnState(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
      this.AddCEMI(datagram, KnxConstants.MESSAGECODES['L_Data.ind']);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
      AddTunn(datagram);
      this.AddTunnState(datagram);
      this.AddCEMI(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
      this.AddTunnState(datagram);
      break;
    default:
      KnxLog.get().debug('Do not know how to deal with svc type %d', svcType);
  }
  return datagram;
}

/*
send the datagram over the wire
*/
FSM.prototype.send = function (datagram, callback) {
  var cemitype; // TODO: set, but unused
  try {
    this.writer = KnxNetProtocol.createWriter();
    switch (datagram.service_type) {
      case KnxConstants.SERVICE_TYPE.ROUTING_INDICATION:
      case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
        // append the CEMI service type if this is a tunneling request...
        cemitype = KnxConstants.keyText('MESSAGECODES', datagram.cemi.msgcode);
        break;
    }
    const packet = this.writer.KNXNetHeader(datagram);
    const buf = packet.buffer;
    const svctype = KnxConstants.keyText('SERVICE_TYPE', datagram.service_type); // TODO: unused
    const descr = datagramDesc(datagram);
    KnxLog.get().trace('(%s): Sending %s ==> %j', this.compositeState(), descr, datagram);
    this.socket.send(
      buf, 0, buf.length,
      this.remoteEndpoint.port, this.remoteEndpoint.addr.toString(),
      (err) => {
        KnxLog.get().trace('(%s): UDP sent %s: %s %s', this.compositeState(),
          (err ? err.toString() : 'OK'), descr, buf.toString('hex')
        );
        if (typeof callback === 'function') callback(err);
      }
    );
  } catch (e) {
    KnxLog.get().warn(e);
    if (typeof callback === 'function') callback(e);
  }
}

FSM.prototype.write = function (grpaddr, value, dptid, callback) {
  if (grpaddr == null || value == null) {
    KnxLog.get().warn('You must supply both grpaddr and value!');
    return;
  }
  try {
    // outbound request onto the state machine
    const serviceType = this.useTunneling ?
      KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
      KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
    this.Request(serviceType, function (datagram) {
      DPTLib.populateAPDU(value, datagram.cemi.apdu, dptid);
      datagram.cemi.dest_addr = grpaddr;
    }, callback);
  } catch (e) {
    KnxLog.get().warn(e);
  }
}

FSM.prototype.respond = function (grpaddr, value, dptid) {
  if (grpaddr == null || value == null) {
    KnxLog.get().warn('You must supply both grpaddr and value!');
    return;
  }
  const serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function (datagram) {
    DPTLib.populateAPDU(value, datagram.cemi.apdu, dptid);
    // this is a READ request
    datagram.cemi.apdu.apci = "GroupValue_Response";
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  });
}

FSM.prototype.writeRaw = function (grpaddr, value, bitlength, callback) {
  if (grpaddr == null || value == null) {
    KnxLog.get().warn('You must supply both grpaddr and value!');
    return;
  }
  if (!Buffer.isBuffer(value)) {
    KnxLog.get().warn('Value must be a buffer!');
    return;
  }
  // outbound request onto the state machine
  const serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function (datagram) {
    datagram.cemi.apdu.data = value;
    datagram.cemi.apdu.bitlength = bitlength ? bitlength : (value.byteLength * 8);
    datagram.cemi.dest_addr = grpaddr;
  }, callback);
}

// send a READ request to the bus
// you can pass a callback function which gets bound to the RESPONSE datagram event
FSM.prototype.read = function (options, callback) {
  const { ga: grpaddr, readReqTimeout } = options;
  if (typeof callback == 'function') {
    // when the response arrives:
    const responseEvent = 'GroupValue_Response_' + grpaddr;
    KnxLog.get().trace('Binding connection to ' + responseEvent);
    const binding = (err, src, data) => {
      // unbind the event handler
      this.off(responseEvent, binding);
      // unbind the timeout handler
      clearTimeout(timeout);
      // fire the callback
      callback(err, src, data);
    }
    // prepare for the response
    this.on(responseEvent, binding);
    // per default clean up after 3 seconds just in case no one answers the read request
    // you can customize this by passing a readReqTimeout in the options object
    const timeout = setTimeout(() => {
      const msg = 'Read request timed out';
      const err = new Error(msg);
      KnxLog.get().warn(msg);
      binding(err, null, null);
    }, readReqTimeout | 3000);
  }
  const serviceType = this.useTunneling ?
    KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST :
    KnxConstants.SERVICE_TYPE.ROUTING_INDICATION;
  this.Request(serviceType, function (datagram) {
    // this is a READ request
    datagram.cemi.apdu.apci = "GroupValue_Read";
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  });
}

FSM.prototype.Disconnect = function (cb) {
  var that = this;

  if (this.state === 'connecting') {
    KnxLog.get().debug('Disconnecting directly');
    that.transition("uninitialized");
    if (cb) {
      cb()
    }
    return
  }

  KnxLog.get().debug('waiting for Idle-State');
  this.onIdle(function () {
    KnxLog.get().trace('In Idle-State');

    that.on('disconnected', () => {
      KnxLog.get().debug('Disconnected from KNX');
      if (cb) {
        cb()
      }
    });

    KnxLog.get().debug('Disconnecting from KNX');
    that.transition("disconnecting");
  });

  // machina.js removeAllListeners equivalent:
  // this.off();
}

FSM.prototype.onIdle = function (cb) {
  if (this.state === 'idle') {
    KnxLog.get().trace('Connection is already Idle');
    cb();
  } else {
    this.on("transition", function (data) {
      if (data.toState === 'idle') {
        KnxLog.get().trace('Connection just transitioned to Idle');
        cb();
      }
    });
  }
}

// return a descriptor for this datagram (TUNNELING_REQUEST_L_Data.ind)
const datagramDesc = (dg) => {
  let blurb = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
  if (dg.service_type == KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST ||
    dg.service_type == KnxConstants.SERVICE_TYPE.ROUTING_INDICATION) {
    blurb += '_' + KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode);
  }
  return blurb;
}

// add the control udp local endpoint. UPDATE: not needed apparnently?
const AddHPAI = (datagram) => {
  datagram.hpai = {
    protocol_type: 1, // UDP
    //tunnel_endpoint: this.localAddress + ":" + this.control.address().port
    tunnel_endpoint: '0.0.0.0:0'
  };
}

// add the tunneling udp local endpoint UPDATE: not needed apparently?
const AddTunn = (datagram) => {
  datagram.tunn = {
    protocol_type: 1, // UDP
    tunnel_endpoint: '0.0.0.0:0'
    //tunnel_endpoint: this.localAddress + ":" + this.tunnel.address().port
  };
}

// TODO: Conncetion is obviously not a constructor, but tests call it with `new`. That should be deprecated.
function Connection(options) {
  const conn = new FSM(options);
  // register with the FSM any event handlers passed into the options object
  if (typeof options.handlers === 'object') {
    for (const [key, value] of Object.entries(options.handlers)) {
      if (typeof value === 'function') {
        conn.on(key, value);
      }
    }
  }
  // boot up the KNX connection unless told otherwise
  if (!options.manualConnect) conn.Connect();
  return conn;
};

module.exports = Connection;
