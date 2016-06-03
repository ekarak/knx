/**
 * KNX Routing support (IP Multicast)
 * Created by ekarak on 01.05.2016.
 */

var util = require('util');
var KnxProtocol = require('./KnxProtocol');
var KnxReceiver = require('./KnxReceiver');

function KnxReceiverRouting(/*KnxConnection*/ connection) {
   KnxReceiverRouting.super_.call(this, connection);
}
util.inherits(KnxReceiverRouting, KnxReceiver);


module.exports = KnxReceiverRouting;
