/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */
Error.stackTraceLimit = Infinity;

import { Connection } from "../../src";
import test from "tape";

/*
           ==========                ==================
 this is a WIRED test and requires a real KNX IP router on the LAN
           ==========                ==================
*/
//
test("KNX connect routing hybrid", function (t) {
  var connection = new Connection({
    loglevel: "debug",
    forceTunneling: true,
    handlers: {
      connected: function () {
        t.pass("connected in hybrid mode");
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