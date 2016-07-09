var machina = require('machina');
var KnxConstants = require('./KnxConstants.js');
var KnxNetStateMachine = new machina.BehavioralFsm( {

  // the initialize method is called right after the FSM
  // instance is constructed, giving you a place for any
  // setup behavior, etc. It receives the same arguments
  // (options) as the constructor function.
  initialize: function( options ) {
    console.log('initialize: %j', options);
      this.options = options;
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
          this.deferUntilTransition( conn );
          // the `transition` method takes a target state (as a string)
          // and transitions to it. You should NEVER directly assign the
          // state property on an FSM. Also - while it's certainly OK to
          // call `transition` externally, you usually end up with the
          // cleanest approach if you endeavor to transition *internally*
          // and just pass input to the FSM.
        this.transition( conn, "connecting" );
      },
    },
    connecting: {
        // _onEnter is a special handler that is invoked
        // immediately as the FSM transitions into the new state
        _onEnter: function( conn ) {
          // set a connection timer for 3 seconds
          var sm = this;
            this.timer = setTimeout( function() {
                this.handle( "connect-timeout" );
            }.bind( this ), 3000 );
            //
            var datagram = conn.prepareDatagram( KnxConstants.SERVICE_TYPE.CONNECT_REQUEST );
            console.log('datagram: %j', datagram);
            var buf  = conn.writer.KNXNetHeader(datagram).buffer;
            console.log('buf: %j', buf);
            conn.Send(buf, function() {
              console.log('sent CONNECT_REQUEST');
              sm.emit( "sent", { datagram: datagram } );
            });
        },
        // If all you need to do is transition to a new state
        // inside an input handler, you can provide the string
        // name of the state in place of the input handler function.
        "connect-timeout": "uninitialized",
        CONNECT_RESPONSE: function( conn ) {
          clearTimeout( this.timer );
          console.log('sm: connect response - clearing timeout');
          this.emit( "connection", { status: "ESTABLISHED" } );
          this.transition('idle');
        },

        // _onExit is a special handler that is invoked just before
        // the FSM leaves the current state and transitions to another
        _onExit: function() {
            console.log("leaving "+this);
        }
    },
    idle: {
      _onEnter: function( conn ) {
          this.idletimer = setTimeout( function() {
              this.handle( "requestingConnState" );
          }.bind( this ), 5000 );
          // machina FSMs are event emitters. Here we're
          // emitting a custom event and data, etc.
          this.emit( "state", { status: "IDLE" } );
      },
      _onExit: function( conn ) {
          clearTimeout( this.idletimer );
      },
      // received tunneling request from the IP router while idle
      TUNNELLING_REQUEST: function ( conn ) {

      }

    },
    // requesting connection state from the KNX IP router
    requestingConnState: {
        _onEnter: function( conn ) {
          // sendvar knxjs = require('.'); CONNECTIONSTATE_REQUEST
          this.connstatetimer = setTimeout( function() {
              this.handle( "CONNECTIONSTATE_timeout" );
          }.bind( this ), 5000 );
          this.emit( "state", { status: "CONNECTIONSTATE_REQUEST" } );
        },
        CONNECTIONSTATE_RESPONSE: function( conn ) {
            clearTimeout( this.connstatetimer );
            this.transition('idle');
        },
        CONNECTIONSTATE_timeout: function( conn ) {
          console.log('error: connection state request timeout: '+this);
          this.transition('uninitialized');
        }
    },
    // making a tunneling request to the KNX IP router
    makingTunnRequest: {
        _onEnter: function( conn ) {
            this.tunnreqtimer = setTimeout( function() {
                this.handle( "timeout" );
            }.bind( this ), 1000 );

        },
        _onExit: function() {
            clearTimeout(this.tunnreqtimer);
        }
    },

  },
  connect: function( conn ) {
      this.handle( conn, "connecting" );
  }
});

module.exports = KnxNetStateMachine;
