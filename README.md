## KNXnet/IP for Node.JS

A feature-complete KNXnet/IP stack in pure Javascript, capable of talking multicast (routing) and unicast (tunneling). Adding KNX to your Node.JS applications is now finally easy as pie.
- Wide DPT (datapoint type) support (DPT1 - DPT20 supported)
- Extensible Device support (binary lights, dimmers, ...)
- You won't need to install a specialised eibd daemon with its arcane dependencies  and most importantly,
- If you got an IP router and a network that supports IP multicast (such as wired ethernet), you can start talking to KNX within seconds!

## Installation

Make sure your machine has Node.JS (version 4.x or greater) and do:

`npm install knx`

## Usage

At last, here's a **reliable** KNX connection that simply works without any configs. To get a basic KNX monitor, you just need to run this in Node:

```js
var knx = require('knx');
var connection = knx.IpRoutingConnection(); // multicast!
connection.Connect(function() {
  // Connected!
  connection.on('event', function (evt, src, dest, value) {
  console.log("%s **** KNX EVENT: %j, src: %j, dest: %j, value: %j",
    new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
    evt, src, dest, value);
  });
});
```

KNX events, what a joy:

```
> 2016-09-24 05:34:07 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 1
2016-09-24 05:34:09 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/1/15", value: 0
2016-09-24 05:34:09 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 0
2016-09-24 05:34:17 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/1/15", value: 0
2016-09-24 05:34:17 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 1
```

Try writing a value to a group address:

```js
  connection.write("1/0/0", true);
```

Or maybe define a datapoint, binding it to the connection you've just established.
Its important to highlight that before you start defining datapoints (and devices as we'll see later), your code *needs to ensure that the connection has been established*, usually by using a Promise:

```js
new Promise(function(resolve, reject) {
  connection.Connect(function() {
    console.log('----------');
    console.log('Connected!');
    console.log('----------');
    resolve();
  });
}).then(function() {
  var dp = new knx.Datapoint({ga: '1/1/1'}, connection);
  // Now send off a couple of requests:
  dp.read((src, value) => {
    console.log("**** RESPONSE %j reports current value: %j", src, value);
  });
  dp.write(1);
});
```

Define a device:

```js
var light = new knx.Devices.BinarySwitch({ga: '1/1/8', status_ga: '1/1/108'}, connection);
console.log("The current light status is %j", light.status.current_value);
light.control.on('change', function(oldvalue, newvalue) {
  console.log("**** LIGHT control changed from: %j to: %j", oldvalue, newvalue);
});
light.status.on('change', function(oldvalue, newvalue) {
  console.log("**** LIGHT status changed from: %j to: %j", oldvalue, newvalue);
});
light.switchOn();
```

## And why should I bother?

Although seemingly innocent, the consecutive calls to *read()* and then *write()* on the same group address will either *confuse* your KNX IP router, or *return incoherent results*. This library is, to the best of my knowledge, the only one that can handle the *serialisation* of tunneling requests in a way that your program will have a *robust and reliable* KNX connection.
The main cause for writing my own KNX access layer is that I couldn't find a *robust* access layer that properly handles state management. KNXnet/IP uses **UDP** sockets, which is not ideal from a programmer's perspective. Packets can come and go in any order; very few libraries offer the robustness to reconcile state and ensure a **steady and reliable connection**.


## Development documentation

- [Basic API usage](../master/README-API.md)
- [List of supported events](../master/README-events.md)
