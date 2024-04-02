import dgram from 'dgram';
import KnxLog from './KnxLog';
import KnxNet from './FSM';


function IpTunnelingConnection(instance: KnxNet): KnxNet {
  const log = KnxLog.get();

  instance.BindSocket = function (cb: (socket: dgram.Socket) => void): dgram.Socket {
    const udpSocket = dgram.createSocket('udp4');
    udpSocket.bind(() => {
      log.debug(
        'IpTunnelingConnection.BindSocket %s:%d',
        instance.localAddress,
        udpSocket.address().port
      );
      cb && cb(udpSocket);
    });
    return udpSocket;
  };

  instance.Connect = function (): IpTunnelingConnectionInstance {
    this.localAddress = this.getLocalAddress();
    // create the socket
    this.socket = this.BindSocket((socket: dgram.Socket) => {
      socket.on('error', (errmsg: string) => log.debug('Socket error: %j', errmsg));
      socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo, callback: () => void) => {
        log.debug('Inbound message: %s', msg.toString('hex'));
        this.onUdpSocketMessage(msg, rinfo, callback);
      });
      // start connection sequence
      this.transition('connecting');
    });
    return this;
  };

  return instance;
}

export default IpTunnelingConnection;