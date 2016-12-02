### Connect to your KNX IP router

```js
// Create a multicast connection, no mandatory arguments.
// Get a nice greeting when connected.
var connection = new knx.Connection( {
  handlers: {
    connnected: function() {
      console.log('Hurray, I can talk KNX!');
      // WRITE an arbitrary write request to a binary group address
      connection.write("1/0/0", 1);
      // you also can be explicit about the datapoint type, eg. DPT9.001 is temperature Celcius
      connection.write("2/1/0", 22.5, "DPT9.001");
      // you can also issue a READ request and pass a callback to capture the response
      connection.read("1/0/1", (src, responsevalue) => { ... });
    }
  }
});  
// optionally specify another address and port
var connection = new knx.Connection( {ipAddr: '224.0.23.12', ipPort: 3671} );
// in case you need to specify the multicast interface if you have more than one
var connection = new knx.Connection( {interface: 'eth0'} );
```

**Important**: connection.write() will only accept *raw APDU payloads* and a DPT.
This practically means that for *reading and writing to anything other than a binary
switch* (eg. for dimmer controls) you'll need to declare one or more *datapoints*.

### Declare datapoints based on their DPT

Datapoints correlate an *endpoint* (identifed by a group address such as '1/2/3')
with a *DPT* (DataPoint Type), so that *serialization* of values to and from KNX
works correctly (eg. temperatures as 16bit floats), and values are being translated
to Javascript objects and back.

```js
// declare a simple binary control
var binary_control = new knx.Datapoint({ga: '1/0/1', dpt: 'DPT1.001'});
// bind it to the active connection
binary_control.bind(connection);
// write a new value to the bus
binary_control.write(true); // or false!
// send a read request, and fire the callback upon response
binary_control.read( function (response) {
    console.log("KNX response: %j", response);
  };
// or declare a dimmer control
var dimmer_control = new knx.Datapoint({ga: '1/2/33', dpt: 'DPT3.007'});
```

Datapoints need to be bound to a connection. This can be done either at their
creation, *or* using their `bind()` call. Its important to highlight that before
you start defining datapoints (and devices as we'll see later), your code
*needs to ensure that the connection has been established*, usually by using a Promise:

```js
var connection = knx.Connection({
  handlers: {
    connected: function() {
      console.log('----------');
      console.log('Connected!');
      console.log('----------');
      var dp = new knx.Datapoint({ga: '1/1/1'}, connection);
      // Now send off a couple of requests:
      dp.read((src, value) => {
        console.log("**** RESPONSE %j reports current value: %j", src, value);
      });
      dp.write(1);
    }
  }
});
```


### Declare your devices

You can define a device (basically a set of GA's that are related to a
physical KNX device eg. a binary switch) so that you have higher level of control:

```js
var light = new knx.Devices.BinarySwitch({ga: '1/1/8', status_ga: '1/1/108'}, connection);
console.log("The current light status is %j", light.status.current_value);
light.control.on('change', function(oldvalue, newvalue) {
  console.log("**** LIGHT control changed from: %j to: %j", oldvalue, newvalue);
});
light.status.on('change', function(oldvalue, newvalue) {
  console.log("**** LIGHT status changed from: %j to: %j", oldvalue, newvalue);
});
light.switchOn(); // or switchOff();
```

This effectively creates a pair of datapoints typically associated with a binary
switch, one for controlling it and another for getting a status feedback (eg via
manual operation)
