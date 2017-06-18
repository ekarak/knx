/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

var knx = require('../..');

Error.stackTraceLimit = Infinity;

var connection = knx.Connection({
	debug: true,
	useMulticastTunneling: true,
	handlers: {
		connected: function() {
			console.log('----------');
			console.log('Connected!');
			console.log('----------');
			process.exit(0);
		},
		error: function() {
			process.exit(1);
		}
	}
});

setTimeout(function() {
	console.log('Exiting...');
	process.exit(0);
}, 1500);
