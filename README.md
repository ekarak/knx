## KNXnet/IP for Node.JS
A feature-complete KNXnet/IP stack in pure Javascript, capable of talking multicast (routing) and unicast (tunneling). Adding KNX to your Node.JS applications is now finally easy as pie.
- You won't need to install a specialised eibd daemon with its arcane dependencies  and most importantly,
- If you got an IP router and a network that supports IP multicast (such as wired ethernet), you can start talking to KNX within seconds!

## Installation
Make sure your machine has Node.JS (version 4.x or greater) and do:

`npm install knx`

At last, a **reliable** KNX connection:

```js
$ node
> var knx = require('knx');
=== candidate interface: wlan0 ({"address":"192.168.8.8","netmask":"255.255.255.0","family":"IPv4","mac":"0c:84:dc:b7:19:93","internal":false}) ===
undefined
> var connection = knx.IpRoutingConnection(); // multicast!
undefined
> connection.Connect(function() {
...   // Connected!
...   connection.on('event', function (evt, src, dest, value) {
.....     var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
.....     console.log("%s **** KNX EVENT: %j, src: %j, dest: %j, value: %j", ts, evt, src, dest, value);
.....   }); });
undefined
> 2016-09-24 05:34:07 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 1
2016-09-24 05:34:09 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/1/15", value: 0
2016-09-24 05:34:09 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 0
2016-09-24 05:34:17 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/1/15", value: 0
2016-09-24 05:34:17 **** KNX EVENT: "GroupValue_Write", src: "1.1.100", dest: "5/0/8", value: 1
```

Then, here's how to properly talk to KNX from Node:

```js
  // sending an arbitrary write request to a binary group address
  connection.write("1/0/0", true);
  // define a datapoint:
  var dp = new knx.Datapoint({ga: '1/1/1'});
  dp.bind(connection);
  // Now send off a couple of requests:
  dp.read((src, dest, value) => {
    console.log("**** RESPONSE %j reports that %j has current value: %j", src, dest, value);
  });
  dp.write(1);
```

Although seemingly innocent, the consecutive calls to *read()* and then *write()* on the same group address will either *confuse* your KNX IP router, or *return incoherent results*. This library is, to the best of my knowledge, the only one that can handle the *serialisation* of tunneling requests in a way that your program will have a *robust and reliable* KNX connection.
The main cause for writing my own KNX access layer is that I couldn't find a *robust* access layer that properly handles state management. KNXnet/IP uses **UDP** sockets, which is not ideal from a programmer's perspective. Packets can come and go in any order; very few libraries offer the robustness to reconcile state and ensure a **steady and reliable connection**.


## Development documentation

- [Basic API usage](../master/README-API.md)
- [List of supported events](../master/README-events.md)
