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
          console.log("=== candidate interface: %s (%j) ===", k, intf);
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
      candidateInterfaces.forEach( function(intf) {
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

  namespace: "knxnet",

  initialState: "uninitialized",

  states: {

    uninitialized: {
      "*": function() {

          //this.deferUntilTransition( conn );
        this.transition(  "connecting" );
      },
    },

    connecting: {
      _onEnter: function( ) {
        var sm = this;
        sm.debugPrint('connecting...');
        sm.connectionAttempt = 0;
        // set a connection timer for 3 seconds, 3 retries
        sm.connecttimer = setInterval( function() {
          if (sm.connectionAttempt < 3) {
            sm.connectionAttempt++;
            sm.debugPrint('connection timed out - retrying...');
            sm.send( sm.prepareDatagram( KnxConstants.SERVICE_TYPE.CONNECT_REQUEST ));
          } else {
            sm.debugPrint('connection timed out - max retries reached...');
            sm.transition( "uninitialized" );
          }
        }.bind( this ), 3000 );
        // send connect request directly
        sm.send( sm.prepareDatagram( KnxConstants.SERVICE_TYPE.CONNECT_REQUEST ));
      },
      // _onExit is a special handler that is invoked just before
      // the FSM leaves the current state and transitions to another
      _onExit: function( ) {
        clearInterval( this.connecttimer );
      },
      inbound_CONNECT_RESPONSE: function (datagram) {
        var sm = this;
        this.sequenceNumber = -1;
        sm.debugPrint(util.format('got connect response'));
        // store channel ID into the Connection object
        this.channel_id = datagram.connstate.channel_id;
        // send connectionstate request directly
        sm.send( sm.prepareDatagram( KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST ));
      },
      inbound_CONNECTIONSTATE_RESPONSE: function (datagram) {
        var sm = this;
        var str = KnxConstants.keyText('RESPONSECODE', datagram.connstate.status);
        sm.debugPrint(util.format(
          'CONNECTED! got connection state response, connstate: %s, channel ID: %d',
          str, datagram.connstate.channel_id));
        // ready to go!
        this.conntime = Date.now();
        this.transition( 'idle');
        this.emit('connected');
      },
    },

    disconnecting: {
      _onEnter: function() {
        var sm = this;
        var aliveFor = this.conntime ? Date.now() - this.conntime : 0;
        this.debugPrint(util.format('connection alive for %d seconds', aliveFor/1000));
        sm.disconnecttimer = setTimeout( function() {
          this.handle(  "disconnect-timeout" );
        }.bind( this ), 3000 );
        //
        sm.send( sm.prepareDatagram ( KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST), function() {
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
      inbound_DISCONNECT_RESPONSE: function (datagram) {
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
        }.bind( this ), 10000 );
        this.debugPrint( " ... " );
      },
      // queue an OUTGOING tunelling request...
      outbound_TUNNELING_REQUEST: function ( datagram ) {
        // this.debugPrint(util.format('OUTBOUND tunneling request: %j', datagram));
        this.transition(  'sendingTunnelingRequest', datagram );
      },
      // OR receive an INBOUND tunneling request
      inbound_TUNNELING_REQUEST: function( datagram ) {
        this.transition(  'receivingTunnelingRequest', datagram );
      },
      inbound_DISCONNECT_REQUEST: function( datagram ) {
        this.transition( 'connecting' );
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
        sm.send (sm.prepareDatagram (KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST));
        //
        this.connstatetimer = setTimeout( function() {
          sm.debugPrint('timed out waiting for CONNECTIONSTATE_RESPONSE');
          sm.transition(  'connecting');
        }.bind( this ), 1000 );
        this.emit( "state", { status: "CONNECTIONSTATE_REQUEST" } );
      },
      inbound_CONNECTIONSTATE_RESPONSE: function ( datagram ) {
        switch (datagram.connstate.status) {
          case 0:
            this.transition( 'idle');
            break;
          default:
            this.debugPrint(util.format(
              '*** error (connstate.code: %d)', datagram.connstate.status));
            this.transition('connecting');
        }
      },
      _onExit: function() {
        clearTimeout( this.connstatetimer );
      },
    },

    /*
    * 1) OUTBOUND TUNNELING_REQUEST
    */
    sendingTunnelingRequest:  {
      _onEnter: function ( datagram ) {
        var sm = this;
        //sm.debugPrint('setting up tunnreq timeout for %j', datagram);
        this.tunnelingRequestTimer = setTimeout( function() {
          sm.handle(  "timeout", datagram );
        }.bind( this ), 1000 );
        // send the telegram on the wire
        this.send( datagram );
      },
      inbound_TUNNELING_ACK: function ( datagram ) {
        this.lastSentDatagram = datagram;
      },
      inbound_TUNNELING_REQUEST: function ( datagram ) {
        var sm = this;
        this.sequenceNumber = datagram.tunnstate.seqnum;
        // TODO: compare datagrams sm.lastSentDatagram == datagram ??
        sm.send( sm.prepareDatagram(
          KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
          datagram), function() { // completion callback
            sm.transition( 'idle' );
        })
      },
      timeout: function (datagram) {
        this.debugPrint('timed out waiting for outgoing TUNNELING_ACK');
        this.transition(  'connecting');
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition();
      },
      _onExit: function( datagram ) {
        clearTimeout( this.tunnelingRequestTimer );
      }
    },

    /*
    * 2) INBOUND tunneling request
    */
    receivingTunnelingRequest: {
      _onEnter: function (datagram) {
        var sm = this;
        // store incoming sequence number
        this.sequenceNumber = datagram.tunnstate.seqnum;
        //console.log('^^^^ seq == %d', this.sequenceNumber);
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
        sm.send( sm.prepareDatagram (KnxConstants.SERVICE_TYPE.TUNNELING_ACK, datagram), function() {
          sm.transition(  'idle' );
        });
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition();
      },
    }
  }
});

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
    "Received %s(/%s) message from %j:%d == %j",
    svctype, cemitype, rinfo.address, rinfo.port, dg
  ));
  // ... to drive the state machine
  var signal = util.format('inbound_%s', svctype);
  this.handle(signal, dg);
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
    seqnum:          this.sequenceNumber,
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
    case KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST:
    case KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST:
      this.AddConnState(datagram);
      this.AddCRI(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST:
      this.AddTunnState(datagram);
      this.AddCEMI(datagram);
      break;
    case KnxConstants.SERVICE_TYPE.TUNNELING_ACK:
      this.AddTunnState(datagram);
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
      // increment the sequence number only when about to send!
      telegram.tunnstate.seqnum = ++this.sequenceNumber;
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
    // ... then drive the state machine
    var signal = util.format('sent_%s', svctype);
    this.handle( signal, telegram );
    callback && callback();
  }
  catch (e) {
    console.log(util.format("*** ERROR: %s, %j", e, e.stack));
  }

}

KnxConnection.prototype.write = function(grpaddr, value, dpt) {
  // outbound request onto the state machine
  this.Request(KnxConstants.SERVICE_TYPE.TUNNELING_REQUEST, function(datagram) {
    datagram.cemi.dest_addr = grpaddr;
    datagram.cemi.apdu.data = value; // FIXME: use datapoints to format APDU
    return datagram;
  });
}

KnxConnection.prototype.read = function(grpaddr) {
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
