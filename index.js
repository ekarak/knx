var fs = require('fs');
var path = require('path');

var knx_path = path.parse(require.resolve('.'));
knx_path.base = 'package.json';
var pkginfo = JSON.parse(fs.readFileSync(path.format(knx_path)));
console.log('Loading %s: %s, version: %s', pkginfo.name, pkginfo.description, pkginfo.version);

exports.Connection = require('./src/Connection.js');
exports.Datapoint = require('./src/Datapoint.js');
exports.Devices = require('./src/devices');
