/**
* knx.js - a pure Javascript library for KNX
* (C) 2016 Elias Karakoulakis
*/

const util = require('util');
const DPTLib = require('./dptlib');
const KnxProtocol = require('./KnxProtocol');
const KnxConstants = require('./KnxConstants');
const EventEmitter = require('events').EventEmitter;

//
function Datapoint(options, conn) {
  EventEmitter.call(this);
  if (options == null || options.ga == null) {
    throw "must supply at least { ga, dpt }!";
  }
  this.options = options;
  this.dptid = options.dpt || "DPT1.001";
  // "dpt9.001" => "DPT9", "001"
  var arr = this.dptid.toUpperCase().split('.');
  this.dptbasetypeid = arr[0];
  this.dptsubtypeid = arr[1];
  console.log('dptid: %s, basetype: %j', this.dptid, this.dptbasetypeid);
  if (DPTLib.hasOwnProperty(this.dptbasetypeid)) {
    this.dpt  = DPTLib[this.dptbasetypeid];
    this.dpst = (
      this.dpt.hasOwnProperty('subtypes') &&
      this.dpt.subtypes.hasOwnProperty(this.dptsubtypeid)
    ) ? this.dpt.subtypes[this.dptsubtypeid] : {};
  } else throw "Unknown Datapoint Type: " + this.dptid;
  if (conn) this.bind(conn);
}

util.inherits(Datapoint, EventEmitter);

Datapoint.prototype.bind = function (conn) {
  var self = this;
  if (!conn) throw "must supply a valid KNX connection to bind to"
  this.conn = conn;
  // bind generic event handler for this address
  conn.on(util.format('event_%s',self.options.ga), function (evt, src, value) {
    // get the Javascript value from the raw buffer, if the DPT defines fromBuffer()
    var jsvalue = (typeof self.dpt.fromBuffer == 'function') ?
      self.dpt.fromBuffer(value) : value;
    self.update(jsvalue);
    switch (evt) {
      case "GroupValue_Response":
        if (typeof self.readcb == 'function') self.readcb(src, dest, jsvalue);
    }
  });
  //
  this.read();
}

Datapoint.prototype.update = function (jsvalue) {
  if (this.previous_value != jsvalue) {
    this.emit('change', this.previous_value, jsvalue);
    this.previous_value = this.current_value;
    this.current_value = jsvalue;
  }
  var ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  console.log("%s **** DATAPOINT %s == %j %s",
    ts, this.options.ga, jsvalue, this.dpst.unit);
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
  // get the raw APDU data for the given JS value
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
