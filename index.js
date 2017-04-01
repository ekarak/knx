/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var fs = require('fs');
var path = require('path');
var knx_path = path.join(__dirname, 'package.json');
var pkginfo = JSON.parse(fs.readFileSync(knx_path));
console.log('Loading %s: %s, version: %s',
  pkginfo.name, pkginfo.description, pkginfo.version);

exports.Connection = require('./src/Connection.js');
exports.Datapoint = require('./src/Datapoint.js');
exports.Devices = require('./src/devices');
