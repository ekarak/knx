/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/
const os = require('os');
const dgram = require('dgram');
const machina = require('machina');
const util = require('util');
const KnxConstants = require('./KnxConstants.js');
const KnxNetProtocol = require('./KnxProtocol.js');

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

const KnxConnection = machina.Fsm.extend({

  // the initialize method is called right after the FSM
  // instance is constructed, giving you a place for any
  // setup behavior, etc. It receives the same arguments
  // (options) as the constructor function.
  initialize: function( options ) {
    //this.debugPrint( util.format('initialize connection: %j', options));
    this.options = options;
    // set the local IP endpoint
    this.localAddress = null;
    if (candidateInterfaces.length == 0) {
      // no local IpV4 interfaces?
      throw "No valid IPv4 interfaces detected";
    } else if (candidateInterfaces.length == 1) {
      this.localAddress = candidateInterfaces[0].address;
    } else {
      candidateInterfaces.forEach( intf => {
        if (intf.family == 'IPv4' && !intf.internal && !this.localAddress) {
          this.localAddress = intf.address;
        }
      })
      if (!this.localAddress) {
        throw "You must supply a valid network interface for KNX traffic";
      }
    }
    this.debugPrint(util.format(
      "Using %s as local IP for KNX traffic", this.localAddress
    ));
    this.connected = false;
    this.ThreeLevelGroupAddressing = true;
    this.remoteEndpoint = { addr: options.ipAddr, port: options.ipPort || 3671 };
    this.incomingPacketCounter = 0 ;
  },

  debug: function (msg) {
    console.log('%s (state=%s): %s',
      new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
      this.compositeState(),
      msg
    );
  },

  namespace: "knxnet",

  // `initialState` tells machina what state to start the FSM in.
  // The default value is "uninitialized". Not providing
  // this value will throw an exception in v1.0+
  initialState: "uninitialized",

  // The states object's top level properties are the
  // states in which the FSM can exist. Each state object
  // contains input handlers for the different inputs
  // handled while in that state.
  states: {
    uninitialized: {
      // Input handlers are usually functions. They can
      // take arguments, too (even though this one doesn't)
      // The "*" handler is special (more on that in a bit)
      "*": function() {
          //this.deferUntilTransition( conn );
          // the `transition` method takes a target state (as a string)
          // and transitions to it. You should NEVER directly assign the
          // state property on an FSM. Also - while it's certainly OK to
          // call `transition` externally, you usually end up with the
          // cleanest approach if you endeavor to transition *internally*
          // and just pass input to the FSM.
        // this.transition(  "connecting" );
      },
    },
    connecting: {
      _onEnter: function( ) {
        // set a connection timer for 3 seconds
        var sm = this;
        sm.connecttimer = setTimeout( function() {
          sm.debugPrint('connection timed out');
          sm.transition( "uninitialized" );
        }.bind( this ), 3000 );
        // just send off a connection request
        this.Request( KnxConstants.SERVICE_TYPE.CONNECT_REQUEST );
      },
      // _onExit is a special handler that is invoked just before
      // the FSM leaves the current state and transitions to another
      _onExit: function( ) {
        clearTimeout( this.connecttimer );
      },
      recv_CONNECT_RESPONSE: function (datagram) {
        var sm = this;
        sm.debugPrint(util.format('got connect response'));
        // store channel ID into the Connection object
        this.channel_id = datagram.connstate.channel_id;
        //
        this.Request( KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST );
      },
      recv_CONNECTIONSTATE_RESPONSE: function (datagram) {
        var sm = this;
        var str = KnxConstants.keyText('RESPONSECODE', datagram.connstate.status);
        sm.debugPrint(util.format(
          'CONNECTED! got connection state response, connstate: %s, channel ID: %d',
          str, datagram.connstate.channel_id));
        // ready to go!
        this.transition( 'idle');
        this.emit('connected');
      },
    },
    disconnecting: {
      _onEnter: function() {
        var sm = this;
        sm.disconnecttimer = setTimeout( function() {
          this.handle(  "disconnect-timeout" );
        }.bind( this ), 3000 );
        //
        sm.Request(KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST, null, function() {
          sm.debugPrint('sent DISCONNECT_REQUEST');
        });
      },
      "disconnect-timeout": function () {
        this.debugPrint("disconnection timed out");
        this.transition( "uninitialized")
      },
      _onExit: function() {
        clearTimeout( this. disconnecttimer)
      },
      recv_DISCONNECT_RESPONSE: function (datagram) {
        this.debugPrint(util.format('got disconnect response'));
        this.transition(  'uninitialized');
      },
    },
    // while idle we can either...
    idle: {
      _onEnter: function() {
        this.idletimer = setTimeout( function() {
          // time out on inactivity...
          this.transition(  "requestingConnState" );
        }.bind( this ), 30000 );
        this.emit( "state", { status: "IDLE" } );
      },
      // send an OUTGOING tunelling request...
      sent_TUNNELING_REQUEST: function ( datagram ) {
        this.transition(  'sendingTunnelingRequest', datagram );
      },
      // OR receive an INBOUND tunneling request
      recv_TUNNELING_REQUEST: function( datagram ) {
        this.transition(  'receivingTunnelingRequest', datagram );
      },
      _onExit: function() {
        clearTimeout( this.idletimer );
      },
    },
    // if idle for too long, request connection state from the KNX IP router
    requestingConnState: {
      _onEnter: function( ) {
        var sm = this;
        sm.debugPrint('requesting Connection State');
        sm.Request(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST, null, function() {
          sm.debugPrint('sent CONNECTIONSTATE_REQUEST');
        });
        //
        this.connstatetimer = setTimeout( function() {
          sm.debugPrint('timed out waiting for connection state')
          sm.handle(  "CONNECTIONSTATE_timeout" );
        }.bind( this ), 1000 );
        this.emit( "state", { status: "CONNECTIONSTATE_REQUEST" } );
      },
      recv_CONNECTIONSTATE_RESPONSE: function ( datagram ) {
        this.debugPrint('got connection state response - clearing timeout');
        this.transition(  'idle');
      },
      _onExit: function() {
        clearTimeout( this.connstatetimer );
      },
    },
    // 1) send TUNNELING_REQUEST, 2) recv ACK, ...
    sendingTunnelingRequest:  {
      _onEnter: function ( datagram ) {
        var sm = this;
        //sm.debugPrint('setting up tunnreq timeout for %j', datagram);
        this.tunnelingRequestTimer = setTimeout( function() {
          sm.handle(  "timeout", datagram );
        }.bind( this ), 1000 );
      },
      recv_TUNNELING_ACK: function ( datagram ) {
        // TODO: compare
        this.transition (  'ackingTunnelingRequest', datagram )
      },
      timeout: function (datagram) {
        this.debugPrint('timed out waiting for outgoing TUNNELING_ACK');
        this.transition(  'connecting');
      },
    },
    // ... 3) recv TUNREQ echo from KNXnet/IP router, 4) ack echo
    ackingTunnelingRequest:  {
      _onEnter: function ( datagram ) {
        var sm = this;
        sm.lastSentDatagram = datagram;
      },
      recv_TUNNELING_REQUEST: function ( datagram ) {
        var sm = this;
        // TODO: compare datagrams sm.lastSentDatagram == dg ??
        sm.Request(KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
          datagram, function() { // completion callback
            sm.transition( 'idle' );
        })
      },
      _onExit: function( datagram ) {
        clearTimeout( this.tunnelingRequestTimer );
      },
    },
    receivingTunnelingRequest: {
      _onEnter: function (datagram) {
        var sm = this;
        var evtName = KnxConstants.APCICODES[datagram.cemi.apdu.apci];
        if(datagram.cemi.msgcode == KnxConstants.MESSAGECODES["L_Data.ind"]) {
          sm.debugPrint(util.format(
            'received L_Data.ind tunelling request (%d bytes) - %s',
            datagram.total_length, evtName));
          this.emit(evtName,
            datagram.cemi.src_addr,
            datagram.cemi.dest_addr,
            datagram.cemi.apdu.data // TODO: interpret data according to any defined datapoints
          );
          this.emit("event",
            evtName,
            datagram.cemi.src_addr,
            datagram.cemi.dest_addr,
            datagram.cemi.apdu.data
          );
        }
        // check IF THIS IS NEEDED (maybe look at apdu control field for ack)
        this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_ACK, datagram, function() {
          sm.transition(  'idle' );
        });
      }
    }
  }
});

KnxConnection.prototype.GenerateSequenceNumber = function () {
    return this._sequenceNumber++;
}

KnxConnection.prototype.RevertSingleSequenceNumber = function () {
    this._sequenceNumber--;
}

KnxConnection.prototype.ResetSequenceNumber = function () {
    this._sequenceNumber = 0;
}

// bind incoming UDP packet handler
KnxConnection.prototype.onUdpSocketMessage = function(msg, rinfo, callback) {
  // get the incoming packet's service type ...
  var reader = KnxNetProtocol.createReader(msg);
  reader.KNXNetHeader('tmp');
  var dg = reader.next()['tmp'];
  var svctype = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
  // append the CEMI service type if this is a tunneling request...
  var cemitype = (dg.service_type == 1056) ?
    KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode)
    : "";
  this.debugPrint(util.format(
    "Received %s(/%s) message: %j from %j:%d",
    svctype, cemitype, msg, rinfo.address, rinfo.port
  ));
  // ... to drive the state machine
  var signal = util.format('recv_%s', svctype);
  this.handle(signal, dg);
};


// <summary>
///     Start the connection
/// </summary>
KnxConnection.prototype.Connect = function (callback) {
  var sm = this;
  // create a control socket for CONNECT, CONNECTIONSTATE and DISCONNECT
  sm.control = sm.BindSocket( function(socket) {
    socket.on("message", function(msg, rinfo, callback)  {
      sm.debugPrint('Inbound message in CONTROL channel');
      sm.onUdpSocketMessage(msg, rinfo, callback);
    });
    // create a tunnel socket for TUNNELING_REQUEST and friends
    sm.tunnel = sm.BindSocket( function(socket) {
      socket.on("message", function(msg, rinfo, callback)  {
        sm.debugPrint('Inbound message in TUNNEL channel');
        sm.onUdpSocketMessage(msg, rinfo, callback);
      });
      // start connection sequence
      sm.transition( 'connecting');
      sm.on('connected', callback);
    })
  });
}



/// <summary>
///     Stop the connection
/// </summary>
KnxConnection.prototype.Disconnect = function (callback) {
    var self = this;
		if (self.debug) console.log("Disconnect...");
    throw "unimplemented"
}

KnxConnection.prototype.AddConnState = function (datagram) {
  datagram.connstate = {
    channel_id:      this.channel_id,
    seqnum:          this.GenerateSequenceNumber()
  }
}

KnxConnection.prototype.AddTunnState = function (datagram) {
  // add the remote IP router's endpoint
  datagram.tunnstate = {
    channel_id:      this.channel_id,
    seqnum:          this.GenerateSequenceNumber(),
    protocol_type:   1, // UDP
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

KnxConnection.prototype.AddCEMI = function(datagram) {
  datagram.cemi = {
    msgcode: 0x11, // FIXME: L_Data.req
    ctrl: {
      frameType   : 1, // 0=extended 1=standard
      reserved    : 0,
      repeat      : 1,
      broadcast   : 1,
      priority    : 1, // 0-system 1-normal 2-urgent 3-low
      acknowledge : 1, // FIXME: only for L_Data.req
      confirm     : 0, // FIXME: only for L_Data.con 0-ok 1-error
      // 2nd byte
      destAddrType: 1, // FIXME: 0-physical 1-groupaddr
      hopCount    : 7,
      extendedFrame: 0
    },
    src_addr: "15.15.15", // FIXME: add local physical address property
    dest_addr: "0/0/0", //
    apdu: {
      // default operation is GroupValue_Write
      apci: KnxConstants.APCICODES.indexOf('GroupValue_Write'),
      tpci: 0,
      data: 1
    }
  }
}

/*
* send a request to KNX of
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
  // select which UDP channel we should use (control/tunnel)
  var channel = [
    KnxConstants.SERVICE_TYPE.CONNECT_REQUEST,
    KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST,
    KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST]
    .indexOf(type) > -1 ?  this.control : this.tunnel;
  this.debugPrint(util.format(
    "Sending %s %j via port %d", st, datagram, channel.address().port
  ));
  try {
    this.writer = KnxNetProtocol.createWriter();
    var packet = this.writer.KNXNetHeader(datagram);
    this.Send(channel, packet.buffer, function() {
      self.handle(self, 'sent_'+st, datagram);
      callback && callback();
    });
  }
  catch (e) {
    console.log(util.format("*** ERROR: %s, %j", e, e.stack));
  }
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
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST: {
      this.AddTunnState(datagram);
      this.AddCEMI(datagram);
    }
  }
  return datagram;
}

KnxConnection.prototype.Send = function(channel, buf, callback) {
  var conn = this;
  var reader = KnxNetProtocol.createReader(buf);
  reader.KNXNetHeader('packet');
  var dg = reader.next()['packet'];
  // append the CEMI service type if this is a tunneling request...
  var cemitype = (dg.service_type == 1056) ? KnxConstants.keyText('MESSAGECODES', dg.cemi.msgcode) : "";
  var svctype = KnxConstants.keyText('SERVICE_TYPE', dg.service_type);
  this.debugPrint(util.format(
    'IpTunneling.Send %s(/%s) (%d bytes) ==> %j',
    svctype, cemitype, buf.length, buf
  ));
  channel.send(
    buf, 0, buf.length,
    conn.remoteEndpoint.port, conn.remoteEndpoint.addr,
    function (err) {
      conn.debugPrint(util.format(
        'udp sent to %j, err[' + (err ? err.toString() : 'no_err') + ']',
        conn.remoteEndpoint));
      if (typeof callback === 'function') callback(err);
    });
  // ... then drive the state machine
  var signal = util.format('sent_%s', svctype);
  this.handle( signal, dg );
}

KnxConnection.prototype.Write = function(grpaddr, value, dpt) {
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST, function(datagram) {
    datagram.cemi.dest_addr = grpaddr;
    datagram.cemi.apdu.data = value; // FIXME: use datapoints to format APDU
    return datagram;
  });
}

KnxConnection.prototype.Read = function(grpaddr) {
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST, function(datagram) {
    // this is a READ request
    datagram.cemi.apdu.apci = KnxConstants.APCICODES.indexOf("GroupValue_Read");
    datagram.cemi.dest_addr = grpaddr;
    return datagram;
  });
}

KnxConnection.prototype.debugPrint = function(msg) {
  if (this.debug) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log('%s (state=%s): %s', ts, this.compositeState(), msg);
  }
}

module.exports = KnxConnection;
