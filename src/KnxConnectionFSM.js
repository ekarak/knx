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

module.exports = machina.Fsm.extend({

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
        this.recvSeqNum = 0;
        this.sendSeqNum = 0;
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
        this.emit('connected');
        this.transition( 'idle');
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition( 'idle' );
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
        // console.trace();
        this.processQueue();
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
              '*** error *** (connstate.code: %d)', datagram.connstate.status));
            this.transition('connecting');
        }
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition( 'idle' );
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
        this.tunnelingAckTimer = setTimeout( function() {
          sm.handle( "timeout_tun_ack", datagram );
        }.bind( this ), 2000 );
        // send the telegram on the wire
        this.send( datagram );
        this.lastSentDatagram = datagram;
      },
      inbound_TUNNELING_ACK: function ( datagram ) {
        var sm = this;
        clearTimeout( this.tunnelingAckTimer );
        // check connstate.seqnum
        if (datagram.connstate.seqnum != this.lastSentDatagram.tunnstate.seqnum) {
          this.debugPrint(util.format('Receive sequence MISMATCH, got %d (expected %d)',
            datagram.connstate.seqnum, this.lastSentDatagram.tunnstate.seqnum));
        } else {
          sm.incSeqSend();
        }
        this.tunnelingRequestTimer = setTimeout( function() {
          sm.handle( "timeout_tun_req", datagram );
        }.bind( this ), 2000 );
      },
      timeout_tun_ack: function (datagram) {
        this.debugPrint('timed out waiting for TUNNELING_ACK');
        this.emit('tunnelreqfailed', datagram);
        this.transition( 'idle' );
      },
      inbound_TUNNELING_REQUEST: function ( datagram ) {
        var sm = this;
        clearTimeout( this.tunnelingRequestTimer );
        // TODO: compare datagrams sm.lastSentDatagram == datagram ??
        sm.send( sm.prepareDatagram(
          KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
          datagram), function() {
            sm.incSeqRecv();
            sm.transition( 'idle' );
        })
      },
      timeout_tun_req: function (datagram) {
        this.debugPrint('timed out waiting for TUNNELING_REQUEST');
        this.emit('unacknowledged', datagram);
        this.transition( 'idle' );
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring until transition %j', data));
        this.deferUntilTransition( 'idle' );
      }
  },

    /*
    * 2) INBOUND tunneling request
    */
    receivingTunnelingRequest: {
      _onEnter: function (datagram) {
        var sm = this;
        if (datagram.tunnstate.channel_id == this.channel_id) {
          this.recvSeqNum = datagram.tunnstate.seqnum;
        }
        console.log('^^^^ recvSeq == %d sendSeq == %d', this.recvSeqNum, this.sendSeqNum);
        var evtName = KnxConstants.APCICODES[datagram.cemi.apdu.apci];
        if(datagram.cemi.msgcode == KnxConstants.MESSAGECODES["L_Data.ind"]) {
          sm.debugPrint(util.format(
            'received L_Data.ind tunelling request (%d bytes) - %s',
            datagram.total_length, evtName));
          // emit events
          this.emit(evtName,
            datagram.cemi.src_addr, datagram.cemi.dest_addr, datagram.cemi.apdu.data );
          //
          this.emit(util.format("%s_%s", evtName, datagram.cemi.dest_addr),
            datagram.cemi.src_addr, datagram.cemi.apdu.data );
          //
          this.emit("event",
            evtName, datagram.cemi.src_addr, datagram.cemi.dest_addr, datagram.cemi.apdu.data );
          //
          this.emit(util.format("event_%s", datagram.cemi.dest_addr),
            evtName, datagram.cemi.src_addr, datagram.cemi.apdu.data );
        }
        // check IF THIS IS NEEDED (maybe look at apdu control field for ack)
        sm.send( sm.prepareDatagram (KnxConstants.SERVICE_TYPE.TUNNELING_ACK, datagram), function() {
          sm.transition(  'idle' );
        });
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition( 'idle' );
      },
    }
  }
});
