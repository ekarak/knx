var machina = require('machina');
const util = require('util');
var KnxConstants = require('./KnxConstants.js');
var KnxNetStateMachine = new machina.BehavioralFsm({


  // the initialize method is called right after the FSM
  // instance is constructed, giving you a place for any
  // setup behavior, etc. It receives the same arguments
  // (options) as the constructor function.
  initialize: function( options ) {
    console.log('initialize state machine: %j', options);
      this.options = options;
  },

  debug: function (conn, msg) {
    console.log('* SM (%s): %s', this.compositeState(conn), msg);
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
      "*": function( conn ) {
          //this.deferUntilTransition( conn );
          // the `transition` method takes a target state (as a string)
          // and transitions to it. You should NEVER directly assign the
          // state property on an FSM. Also - while it's certainly OK to
          // call `transition` externally, you usually end up with the
          // cleanest approach if you endeavor to transition *internally*
          // and just pass input to the FSM.
        // this.transition( conn, "connecting" );
      },
    },
    connecting: {
      // _onEnter is a special handler that is invoked
      // immediately as the FSM transitions into the new state
      _onEnter: function( conn ) {
        // set a connection timer for 3 seconds
        var sm = this;
        sm.connecttimer = setTimeout( function() {
          sm.debug(conn, 'connection timed out');
          this.handle( conn, "connect-timeout" );
        }.bind( this ), 3000 );
        //
        conn.Request(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST, function() {
          sm.debug(conn, 'sent CONNECT_REQUEST');
        });
      },
      // If all you need to do is transition to a new state
      // inside an input handler, you can provide the string
      // name of the state in place of the input handler function.
      "connect-timeout": function (conn) {
        this.debug(conn, "connection timed out");
        this.transition(conn, "uninitialized")
      },
      // _onExit is a special handler that is invoked just before
      // the FSM leaves the current state and transitions to another
      _onExit: function( conn ) {
        this.debug(conn, "leaving connecting");
      },
      recv_CONNECT_RESPONSE: function (conn, datagram) {
        var sm = this;
        this.debug(conn, util.format('got connect response'));
        // store channel ID into the Connection object
        conn.channel_id = datagram.connstate.channel_id;
        //
        conn.Request(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST, function() {
          sm.debug(conn, 'sent CONNECTIONSTATE_REQUEST');
        })
      },
      recv_CONNECTIONSTATE_RESPONSE: function (conn, datagram) {
        var sm = this;
        var str = KnxConstants.keyText('RESPONSECODE', datagram.connstate.status);
        this.debug(conn, util.format(
          'CONNECTED! got connection state response, connstate: %s, channel ID: %d',
          str, datagram.connstate.channel_id));
        clearTimeout( this.connecttimer );
        // ready to go!
        this.transition( conn, 'idle');
        this.emit('connected');
      },
    },
    //
    idle: {
      _onEnter: function( conn ) {
        this.debug(conn, "setting idle timer");
        this.idletimer = setTimeout( function() {
          this.transition( conn, "requestingConnState" );
        }.bind( this ), 30000 );
          // machina FSMs are event emitters. Here we're
          // emitting a custom event and data, etc.
          this.emit( "state", { status: "IDLE" } );
      },
      sent_TUNNELLING_REQUEST: function ( conn ) {
        this.transition( conn, 'sendingTunnelingRequest' );
      },
      recv_TUNNELLING_REQUEST: function( conn, datagram ) {
        this.debug( conn, util.format('received TUNNELING REQUEST (%d bytes)', datagram.total_length) );
        var event;
        switch(datagram.cemi.msgcode) {
          case KnxConstants.MESSAGECODES["L_Data.req"]: // requesting a data frame
          case KnxConstants.MESSAGECODES["L_Data.ind"]: // received a data frame
          case KnxConstants.MESSAGECODES["L_Data.con"]: // TODO
        }
        this.emit("event",
          event,
          datagram.cemi.src_addr,
          datagram.cemi.dest_addr,
          datagram.cemi.apdu);
      },
      _onExit: function( conn ) {
          clearTimeout( this.idletimer );
      },
    },
    // requesting connection state from the KNX IP router
    requestingConnState: {
      _onEnter: function( conn ) {
        var sm = this;
        this.debug(conn, 'requesting Connection State');
        conn.Request(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST, function() {
          sm.debug(conn, 'sent CONNECTIONSTATE_REQUEST');
        })
        this.connstatetimer = setTimeout( function() {
          sm.debug( conn, 'timed out waiting for connection state')
          sm.handle( conn, "CONNECTIONSTATE_timeout" );
        }.bind( this ), 1000 );
        this.emit( "state", { status: "CONNECTIONSTATE_REQUEST" } );
      },
      recv_CONNECTIONSTATE_RESPONSE: function (conn) {
        this.debug(conn, 'got connection state response - clearing timeout');
        clearTimeout( this.connstatetimer );
        this.transition( conn, 'idle');
      },
    },
    sendingTunnelingRequest:  {
      _onEnter: function ( conn ) {
        var sm = this;
        sm.debug(conn, 'setting up tunnreq timeout');
        this.tunnelingRequestTimer = setTimeout( function() {
          sm.handle( conn, "timeout" );
        }.bind( this ), 1000 );
      },
      recv_TUNNELING_ACK: function (conn) {
        clearTimeout(this.tunnelingRequestTimer);
        this.debug( conn, 'clearing timeout, TUNNELING_ACK received')
      },
      timeout: function (conn) {
        this.debug( conn, 'timed out waiting for TUNNELING_ACK');
        this.transition( conn, 'connecting');
      }
    }
  }
});

module.exports = KnxNetStateMachine;
