### Connect to your KNX IP router via multicast

```js
// create a multicast connection, no mandatory arguments.
var connection = knx.IpRoutingConnection();
// optionally specify the multicast address if its not the standard
var connection = knx.IpRoutingConnection( {ipAddr: '224.0.23.12', ipPort: 3671} );
// you'll need to specify the multicast interface if you have more than one interface
// this is common in laptops that have both a wired AND a wireless interface
var connection = knx.IpRoutingConnection( {interface: 'eth0'} );
```

### Connect to your KNX IP interface via tunneling

Use this in case multicast doesn't work for you, this for example could be caused if:
- you only have a "KNX IP Interface" (meaning its only capable of tunneling), or
- your laptop is on wi-fi and your KNX IP router is on wired Ethernet, (most home routers don't route multicast traffic to the LAN segment), or
- you're simply not in the same LAN as the KNX IP router

```js
// create a tunneling (UDP/unicast) connection to a KNX IP router
var connection = knx.IpTunnelingConnection( {ipAddr: '192.168.2.222'} );
// -- OR -- you can optionally specify the port number and the local interface:
var connection = knx.IpTunnelingConnection( {ipAddr: '192.168.2.222', ipPort: 3671, interface: 'eth0'} );
```

### Send some raw telegrams

```js
// sending an arbitrary write request to a binary group address
connection.write("1/0/0", true);
// you also can be explicit about the datapoint type, eg. DPT9.001 is temperature Celcius
connection.write("2/1/0", 22.5, "DPT9.001");
// send a Read request to get the current state of 1/0/1 group address
// dont forget to register a GroupValue_Response handler!
connection.read("1/0/1");
// or, the opposite: send a Response telegram to an incoming GroupValue_Read request
connection.response("2/1/0", 22.5, "DPT9.001");)
//
```

### Declare datapoints based on their DPT

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

### Declare your devices

```js
var entry_light = new knx.Devices.BinarySwitch({ga: '1/2/33', status_ga: '1/2/133'});
entry_light.switchOn(); // or switchOff();
console.log("The entry light is %j", entry_light.status);
```

This effectively creates a pair of datapoints typically associated with a binary
switch, one for controlling it and another for getting a status feedback (eg via
manual operation)

### Creating custom datapoint bindings

```js
// DPT1 binary controls (eg relays) are the default DPT type
var entry_light = new knx.KnxBinding({groupaddr: '1/2/33'})
// all the non-binary datapoints require a dpt argument:
var lounge_dimmer = new knx.KnxBinding({groupaddr: '1/4/55', dpt: 'DPT3.007'})
//
```
