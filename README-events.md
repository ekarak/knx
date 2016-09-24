## Events

There's a ton of information being emitted by the library, so you can get full disclosure as to what's going on under the hood.

### Connection events

```js
// device with 'src' physical address wrote to 'dest' group address
connection.on('GroupValue_Write', function (src, dest, value) { ... });

// read event: device with physical address 'src', is asking on the KNX
// bus the current value of group address 'dest'
connection.on('GroupValue_Read', function (src, dest) { ... });

// response event: device with physical address 'src', is responding to a
// read request that the current value of group address 'dest' is 'value'
connection.on('GroupValue_Response', function (src, dest, value) { ... });

// there's also the generic catch-all event which passes the event type
// as its 1st argument, along with all the other info
connection.on('event', function (evt, src, dest, value) { ... });)
```

Here's the full list of events emitted:
```
["GroupValue_Read", "GroupValue_Response", "GroupValue_Write",
"PhysicalAddress_Write",  "PhysicalAddress_Read", "PhysicalAddress_Response",
"ADC_Read", "ADC_Response", "Memory_Read", "Memory_Response", "Memory_Write",
"UserMemory", "DeviceDescriptor_Read", "DeviceDescriptor_Response",
"Restart", "OTHER"]
```
