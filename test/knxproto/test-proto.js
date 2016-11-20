'use strict';
const knxnetprotocol = require('../../src/KnxProtocol.js');
const assert = require('assert');
const test = require('tape');
//knxnetprotocol.debug = true;

test('KNX protocol reader/writer', function(t) {
  var tests = {
    CONNECT_REQUEST: "06100205001a0801c0a80ab3d96d0801c0a80ab3d83604040200",
    CONNECT_RESPONSE: "061002060014030008010a0c17350e5704040000",
    "CONNECT_RESPONSE, failure E_NO_MORE_CONNECTIONS: 0x24": "0610020600080024",
    "tunneling request (GroupValue_Read) apdu=1byte" : "061004200015040200002e00bce000000832010000",
    "tunneling request (GroupValue_Write) apdu=1byte": "061004200015040200002e00bce000000832010081",
    "tunneling request (GroupValue_Write) apdu=2byte": "061004200016040201002900bce00000083b0200804a"
  };
  Object.keys(tests).forEach((key, idx) => {
    var dgram = tests[key];
    var buf = new Buffer(dgram, 'hex');
    var reader = knxnetprotocol.createReader(buf);
    var writer = knxnetprotocol.createWriter();
    reader.KNXNetHeader('tmp');
    var decoded = reader.next()['tmp'];
    console.log("\n=== %s: %j (%d bytes) ===> %j",
      key, dgram, buf.length, decoded);
    writer.KNXNetHeader(decoded);
    if (Buffer.compare(buf, writer.buffer) != 0) {
      console.log("\n\n========\n  OOPS: %s\n========\nbuffer is different: %s",
        key, JSON.stringify(decoded, null, 4));
      console.log(buf);
      console.log(writer.buffer);
    }
    t.ok(Buffer.compare(buf, writer.buffer) == 0);
  });
  t.end();
});

test('KNX protocol composer', function(t) {
  var tests = {
    "compose tunneling request (write) apdu=1byte - turn ON a light": {
      hexbuf: "061004200015040200002e00bce000000832010081",
      dgram: {
        header_length: 6,
        protocol_version: 16,
        service_type: 1056,
        total_length: 21,
        tunnstate: { header_length: 4, channel_id: 2, seqnum: 0, rsvd: 0 },
        cemi:
         { msgcode: 46,
           addinfo_length: 0,
           ctrl:
            { frameType: 1,
              reserved: 0,
              repeat: 1,
              broadcast: 1,
              priority: 3,
              acknowledge: 0,
              confirm: 0,
              destAddrType: 1,
              hopCount: 6,
              extendedFrame: 0 },
           src_addr: '0.0.0',
           dest_addr: '1/0/50',
           apdu:
            { tpci: 0,
              apci: 'GroupValue_Write',
              data: 1 }
          } } },

    "compose tunneling request (write) apdu=1byte - turn OFF a light": {
      hexbuf: "061004200015040200002e00bce000000832010080",
      dgram: {
        header_length: 6,
        protocol_version: 16,
        service_type: 1056,
        total_length: 21,
        tunnstate: { header_length: 4, channel_id: 2, seqnum: 0, rsvd: 0 },
        cemi:
         { msgcode: 46,
           addinfo_length: 0,
           ctrl:
            { frameType: 1,
              reserved: 0,
              repeat: 1,
              broadcast: 1,
              priority: 3,
              acknowledge: 0,
              confirm: 0,
              destAddrType: 1,
              hopCount: 6,
              extendedFrame: 0 },
           src_addr: '0.0.0',
           dest_addr: '1/0/50',
           apdu:
            { tpci: 0,
              apci: 'GroupValue_Write',
              data: [0] }
          } } },

  }

  Object.keys(tests).forEach((key, idx) => {
    var testcase = tests[key];
    var buf = new Buffer(testcase.hexbuf, 'hex');
    console.log("\n=== %s", key);
    var writer = knxnetprotocol.createWriter();
    writer.KNXNetHeader(testcase.dgram);
    if (Buffer.compare(buf, writer.buffer) != 0) {
      var reader = knxnetprotocol.createReader(writer.buffer);
      reader.KNXNetHeader('tmp');
      var decoded = reader.next()['tmp'];
      console.log("\n\n========\n  OOPS: %s\n========\nbuffer is different: %j\n%s",
        key, decoded, JSON.stringify(decoded, null, 4));
      console.log(buf);
      console.log(writer.buffer);
    }
    t.ok(Buffer.compare(buf, writer.buffer) == 0);
  });
  t.end();
});
