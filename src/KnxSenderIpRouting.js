/**
 * KNX Routing support (IP Multicast)
 * Created by ekarak on 01.05.2016.
 */
var util = require('util');
var KnxSender = require('./KnxSender');

function KnxSenderIpRouting(/*KnxConnection*/ connection) {
    KnxSenderIpRouting.super_.call(this, connection);
}

util.inherits(KnxSenderIpRouting, KnxSender);

module.exports = KnxSenderIpRouting;
