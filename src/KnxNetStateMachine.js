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
          this.handle( state, "connect-timeout" );
        }.bind( this ), 3000 );
        //
        conn.Request(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST, function() {
          sm.debug(conn, 'sent CONNECT_REQUEST');
        });
      },
      // If all you need to do is transition to a new state
      // inside an input handler, you can provide the string
      // name of the state in place of the input handler function.
      "connect-timeout": "uninitialized",
      // _onExit is a special handler that is invoked just before
      // the FSM leaves the current state and transitions to another
      _onExit: function( conn ) {
        this.debug(conn, "leaving connecting");
      },
      CONNECT_RESPONSE: function( conn ) {
        var sm = this;
        // store channel ID
        conn.channel_id = conn.lastRcvdDatagram.connstate.channel_id;
        this.debug(conn, util.format('connect response, channelId: %j', conn.lastRcvdDatagram.connstate.channel_id))
        conn.Request(KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST, function() {
          sm.debug(conn, 'sent CONNECTIONSTATE_REQUEST');
        })
      },
      CONNECTIONSTATE_RESPONSE: function (conn) {
        console.log('sm: connection state response - clearing timeout');
        clearTimeout( this.connecttimer );
        this.emit( "connected" );
        this.transition( conn, 'idle');
      },
    },
    //
    idle: {
      _onEnter: function( conn ) {
        this.debug(conn, "setting idle timer");
        this.idletimer = setTimeout( function() {
          this.debug( conn, "idletimer fired");
          this.transition( conn, "requestingConnState" );
        }.bind( this ), 30000 );
          // machina FSMs are event emitters. Here we're
          // emitting a custom event and data, etc.
          this.emit( "state", { status: "IDLE" } );
      },
      TUNNELLING_REQUEST: function ( conn ) {
        this.debug(conn, "got TUNNELING_REQUEST");
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
      CONNECTIONSTATE_RESPONSE: function (conn) {
        console.log('connection state response - clearing timeout');
        clearTimeout( this.connstatetimer );
        this.emit( "connected" );
        this.transition( conn, 'idle');
      },
    },
    // making a tunneling request to the KNX IP router
    makingTunnRequest: {
      _onEnter: function( conn ) {
        this.tunnreqtimer = setTimeout( function() {
          this.handle( conn, "timeout" );
        }.bind( this ), 1000 );
      },
      TUNNELLING_ACK: function (conn) {
        this.debug('tunneling_ack');
      },
      _onExit: function() {
        clearTimeout(this.tunnreqtimer);
      }
    },
  }
});

module.exports = KnxNetStateMachine;
