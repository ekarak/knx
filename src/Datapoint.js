/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const util = require('util');
const DPTLib = require('./dptlib');
const KnxProtocol = require('./KnxProtocol');
const KnxConstants = require('./KnxConstants');

function Datapoint(options, conn) {
  if (options == null || options.ga == null) {
    throw "must supply at least { ga, dpt }!";
  }
  this.options = options;
  this.dptid = options.dpt || "DPT1.001";
  // "DPT9.001" => "dpt9", "001"
  var arr = this.dptid.split('.');
  this.dptbasetype = arr[0];
  this.dptsubtype = arr[1];
  console.log('dptid: %s, basetype: %j', this.dptid, this.dptbasetype);
  if (DPTLib.hasOwnProperty(this.dptbasetype)) {
    this.dpt = DPTLib[this.dptbasetype];
  } else throw "Unknown Datapoint Type: " + this.dptid;
  if (conn) this.bind(conn);
}

Datapoint.prototype.bind = function (conn) {
  var self = this;
  if (!conn) throw "must supply a valid KNX connection to bind to"
  this.conn = conn;
  // bind generic event handler for this address
  conn.on(util.format('event_%s',self.options.ga), function (evt, src, value) {
    var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    var jsvalue = self.dpt.fromBuffer(value);
    console.log("%s **** DATAPOINT %j %s\n", ts, jsvalue, self.dptsubtype && self.dptsubtype.units);
    switch (evt) {
      case "GroupValue_Response":
        self.previous_value = self.current_value;
        self.current_value = jsvalue;
        if (typeof self.readcb == 'function') self.readcb(src, dest, jsvalue);
    }
  });
}

/* format a Javascript value into the APDU format dictated by the DPT
   and submit a GroupValue_Write to the connection */
Datapoint.prototype.write = function (value) {
  if (!this.conn) throw "must supply a valid KNX connection to bind to";
  if (this.dpt.hasOwnProperty('range')) {
    // check if value is in range
    var range = this.dpt.basetype.range;
    if (value < range[0] || value > range[1]) {
      throw util.format("Value %j(%s) out of bounds(%j) for %s",
        value, (typeof value), range, this.dptid);
    }
  }
  var apdu_data = (typeof this.dpt.formatAPDU == 'function') ?
    this.dpt.formatAPDU(value) : value;
  this.conn.write(this.options.ga, apdu_data);
}

Datapoint.prototype.read = function (callback) {
  if (!this.conn) throw "must supply a valid KNX connection to bind to"
  this.conn.read(this.options.ga, callback);
}

Datapoint.prototype.toString = function () {
  return util.format('%s (%s)', this.options.ga, this.mod.dptid);
}

module.exports = Datapoint;
