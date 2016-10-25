/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/
const os = require('os');
const ipv4 = require('ipv4.js');
const dgram = require('dgram');
const machina = require('machina');
const util = require('util');
const KnxConstants = require('./KnxConstants.js');
const KnxNetProtocol = require('./KnxProtocol.js');

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
    this.ThreeLevelGroupAddressing = true;
    this.remoteEndpoint = { addr: options.ipAddr, port: options.ipPort || 3671 };
  },

  namespace: "knxnet",

  initialState: "uninitialized",

  states: {

    uninitialized: {
      "*": function() {
        this.transition( "connecting" );
      },
    },

    connecting: {
      _onEnter: function( ) {
        var sm = this;
        if (!sm.localAddress) throw "Not bound to an IPv4 non-loopback interface";
        sm.debugPrint(util.format('Connecting to %s...', sm.localAddress));
        // set a connection timer for 3 seconds, 3 retries
        sm.connecttimer = setInterval( function() {
          sm.debugPrint('connection timed out - retrying...');
          sm.send( sm.prepareDatagram( KnxConstants.SERVICE_TYPE.CONNECT_REQUEST ));
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
      // any inbound tunneling requests must be
      inbound_TUNNELING_REQUEST: function ( datagram ) {
        this.debugPrint("*** ignoring inbound tunneling requests while establishing connection");
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
        this.processQueue();
      },
      // queue an OUTGOING tunelling request...
      outbound_TUNNELING_REQUEST: function ( datagram ) {
        // this.debugPrint(util.format('OUTBOUND tunneling request: %j', datagram));
        this.transition(  'sendingTunnelingRequest', datagram );
      },
      // OR receive an INBOUND tunneling request
      inbound_TUNNELING_REQUEST: function( datagram ) {
        if (datagram.tunnstate.channel_id == this.channel_id) {
          this.transition(  'receivingTunnelingRequest', datagram );
        } else {
          this.debugPrint(util.format(
            "*** Ignoring datagram for channel %d (own: %d)",
            datagram.tunnstate.channel_id, this.channel_id));
        }
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
          var msg = 'timed out waiting for CONNECTIONSTATE_RESPONSE';
          sm.emit('error', msg);
          sm.debugPrint(msg);
          sm.transition( 'connecting' );
        }.bind( this ), 1000 );
      },
      inbound_CONNECTIONSTATE_RESPONSE: function ( datagram ) {
        switch (datagram.connstate.status) {
          case 0:
            this.transition( 'idle');
            break;
          default:
            this.debugPrint(util.format(
              '*** error *** (connstate.code: %d)', datagram.connstate.status));
            this.emit('error', datagram.connstate);
            this.transition( 'connecting' );
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
        clearTimeout( this.tunnelingAckTimer );
        var sm = this;
        if (datagram.connstate.seqnum != this.lastSentDatagram.tunnstate.seqnum) {
          this.debugPrint(util.format('Receive sequence MISMATCH, got %d (expected %d)',
            datagram.connstate.seqnum, this.lastSentDatagram.tunnstate.seqnum));
        } else {
          //
          this.tunnelingRequestTimer = setTimeout( function() {
            sm.handle( "timeout_tun_req", datagram );
          }.bind( this ), 2000 );
        }
      },
      timeout_tun_ack: function (datagram) {
        this.debugPrint('timed out waiting for TUNNELING_ACK');
        this.emit('tunnelreqfailed', datagram);
        this.transition( 'idle' );
      },
      inbound_TUNNELING_REQUEST: function ( datagram ) {
        clearTimeout( this.tunnelingRequestTimer );
        var sm = this;
        // TODO: compare datagrams sm.lastSentDatagram == datagram ?? EXCLUDE sequence number from comparison!!
        sm.recvSeqNum = datagram.tunnstate.seqnum;
        sm.incSeqSend();
        sm.send( sm.prepareDatagram(
          KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
          datagram), function() {
            sm.emitEvent(datagram);
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
        this.recvSeqNum = datagram.tunnstate.seqnum;
        this.debugPrint(util.format(
          '^^^^ recvSeq: %d sendSeq: %d', this.recvSeqNum, this.sendSeqNum
        ));
        if(datagram.cemi.msgcode == KnxConstants.MESSAGECODES["L_Data.ind"]) {
          sm.debugPrint(util.format(
            'received L_Data.ind tunelling request (%d bytes)',
            datagram.total_length));
          this.emitEvent(datagram);
        }
        // check IF THIS IS NEEDED (maybe look at apdu control field for ack)
        var ack = sm.prepareDatagram (KnxConstants.SERVICE_TYPE.TUNNELING_ACK, datagram);
        sm.send(ack, function() {
          sm.transition( 'idle' );
        });
      },
      "*": function ( data ) {
        this.debugPrint(util.format('*** deferring Until Transition %j', data));
        this.deferUntilTransition( 'idle' );
      },
    }
  },
  emitEvent: function(datagram) {
    // emit events to our beloved subscribers in a multitude of targets
    var evtName = KnxConstants.APCICODES[datagram.cemi.apdu.apci];
    // 'GroupValue_Write_1/2/3', src, data
    this.emit(util.format("%s_%s", evtName, datagram.cemi.dest_addr),
      datagram.cemi.src_addr, datagram.cemi.apdu.data );
    // 'GroupValue_Write', src, dest, data
    this.emit(evtName,
      datagram.cemi.src_addr, datagram.cemi.dest_addr, datagram.cemi.apdu.data );
    // 'event_<dest_addr>', ''GroupValue_Write', src, data
    this.emit(util.format("event_%s", datagram.cemi.dest_addr),
      evtName, datagram.cemi.src_addr, datagram.cemi.apdu.data );
    // 'event', 'GroupValue_Write', src, dest, data
    this.emit("event",
      evtName, datagram.cemi.src_addr, datagram.cemi.dest_addr, datagram.cemi.apdu.data );

  },
  // get the local address of the IPv4 interface we're going to use
  getIPv4Interfaces: function() {
    var candidateInterfaces = {};
    var interfaces = os.networkInterfaces();
    for (var iface in interfaces) {
        for (var key in interfaces[iface]) {
            var intf = interfaces[iface][key];
            //console.log('key: %j, intf: %j', key, intf);
            if (intf.family == 'IPv4' && !intf.internal) {
              this.debugPrint(util.format(
                "=== candidate interface: %s (%j) ===", iface, intf
              ));
              candidateInterfaces[iface] = intf;
            }
        }
    }
    return candidateInterfaces;
  },
  getLocalAddress: function() {
    var candidateInterfaces = this.getIPv4Interfaces();
    // if user has declared a desired interface then use it
    if (this.options && this.options.interface) {
      if (!candidateInterfaces.hasOwnProperty(this.options.interface))
        throw "Interface "+this.options.interface+" not found or has no useful IPv4 address!"
      else
        return candidateInterfaces[this.options.interface].address;
    } else {
      // just return the first available IPv4 non-loopback interface
      return candidateInterfaces[Object.keys(candidateInterfaces)[0]].address;
    }
    // no local IpV4 interfaces?
    throw "No valid IPv4 interfaces detected";
  }
});
