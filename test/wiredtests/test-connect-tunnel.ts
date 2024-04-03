/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

Error.stackTraceLimit = Infinity;

import { Connection } from "../../src";
import test from "tape";

import options from "./wiredtest-options";

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
//
test("KNX connect tunneling", function (t) {
  var connection = new Connection({
    // set up your KNX IP router's IP address (not multicast!)
    // for getting into tunnelling mode
    ipAddr: options.ipAddr,
    physAddr: options.physAddr,
    debug: true,
    handlers: {
      connected: function () {
        console.log("----------");
        console.log("Connected!");
        console.log("----------");
        t.pass("connected in TUNNELING mode");
        this.Disconnect();
      },
      disconnected: function () {
        t.pass("disconnected in TUNNELING mode");
        t.end();
        process.exit(0);
      },
      error: function (connstatus) {
        t.fail("error connecting: " + connstatus);
        t.end();
        process.exit(1);
      },
    },
  });
});

setTimeout(function () {
  console.log("Exiting with timeout...");
  process.exit(2);
}, 1000);
