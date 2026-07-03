/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2026 Zacharie Monnet
*/

const wiredTestOptions = require('./wiredtest-options.js');

module.exports = function wiredTestConnectionOptions(testOptions, handlers) {
  const connectionOptions = Object.assign({}, testOptions || {}, wiredTestOptions);

  if (handlers) {
    connectionOptions.handlers = handlers;
  }

  return connectionOptions;
}
