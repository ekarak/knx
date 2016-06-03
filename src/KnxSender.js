const knxnetprotocol = require('./KnxProtocol');

function KnxSender(/*KnxConnection*/ connection) {
    this.connection = connection;
    this.writer = knxnetprotocol.createWriter();
}

KnxSender.prototype.SendData = KnxSender.prototype.SendDataSingle;

module.exports = KnxSender;
