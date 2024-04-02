import os from "os";
import util from "util";
import * as ipaddr from "ipaddr.js";
import * as machina from "machina";
import { keyText, KnxConstants } from "./KnxConstants.js";
import IpRoutingConnection from "./IpRoutingConnection.js";
import IpTunnelingConnection from "./IpTunnelingConnection.js";
import KnxLog, { KnxLogOptions } from "./KnxLog.js";
import EventEmitter from "events";

type KnxDeviceAddress = string;

type KnxGroupAddress = string;

/** The type of the KnxValue depends on the DPT that it is associated with */
type KnxValue = number | string | boolean | Date;

type HandlersSpec = {
  connected?: () => void;
  disconnected?: () => void;
  event?: (
    evt: string,
    src: KnxDeviceAddress,
    dest: KnxGroupAddress,
    value: Buffer
  ) => void;
  error?: (connstatus: any) => void;
};

export type KnxOptions = {
  /** ip address of the KNX router or interface */
  ipAddr?: string;
  /** port of the KNX router or interface */
  ipPort?: number;
  /**  in case you need to specify the multicast interface (say if you have more than one) */
  interface?: string;
  /**  the KNX physical address we'd like to use */
  physAddr?: string;
  /**  set the log level for messsages printed on the console. This can be 'error', 'warn', 'info' (default), 'debug', or 'trace'. */
  loglevel?: string;
  /**  do not automatically connect, but use connection.Connect() to establish connection */
  manualConnect?: boolean;
  /** use tunneling with multicast (router) - this is NOT supported by all routers! See README-resilience.md */
  forceTunneling?: boolean;
  /**  wait at least 10 millisec between each datagram */
  minimumDelay?: number;
  /**  enable this option to suppress the acknowledge flag with outgoing L_Data.req requests. LoxOne needs this */
  suppress_ack_ldatareq?: boolean;
  /** 14/03/2020 In tunneling mode, echoes the sent message by emitting a new emitEvent, so other object with same group address, can receive the sent message. Default is false. */
  localEchoInTunneling?: boolean;
  /**  event handlers. You can also bind them later with connection.on(event, fn) */
  handlers?: HandlersSpec;
} & KnxLogOptions;

export interface Datagram {
  header_length: number;
  protocol_version: number;
  service_type: number;
  total_length: number;
  cemi?: {
    dest_addr: string;
    src_addr: string;
    addinfo_length?: number;
    apdu: {
      apci: string;
      data: any;
      tpci: number;
      bitlength?: number;
      apdu_length?: number;
      apdu_raw?: any;
    };
    msgcode: number;
    ctrl?: {
      frameType: number;
      reserved: number;
      repeat: number;
      broadcast: number;
      priority: number;
      acknowledge: number;
      confirm: number;
      destAddrType: number;
      hopCount: number;
      extendedFrame: number;
    }
  };
  tunnstate?: {
    seqnum?: number;
    channel_id: number;
    tunnel_endpoint: string;
    rsvd?: number;
  };
  tunn?: {
    protocol_type: number;
    tunnel_endpoint: string;
  }
  hpai?: {
    header_length?: number;
    protocol_type: number;
    tunnel_endpoint: string;
  }
  connstate?: {
    state: number;
    channel_id: number;
    status?: number;
  },
  cri?: {
    connection_type: number;
    knx_layer: number;
    unused: number;
  }
}

export class KnxFSM extends machina.FSM {
  private options: KnxOptions;
  private log: any;
  private ThreeLevelGroupAddressing: boolean;
  private reconnection_cycles: number;
  private sentTunnRequests: { [key: string]: Datagram };
  private useTunneling: boolean;
  private remoteEndpoint: {
    addrstring: string;
    addr: any;
    port: number;
  };
  private localEchoInTunneling: boolean | undefined;
  private channel_id?: any;
  private conntime?: number;
  private lastSentTime?: number;
  private connecttimer?: NodeJS.Timeout;
  private disconnecttimer?: NodeJS.Timeout;
  private connstatetimer?: NodeJS.Timeout;
  private idletimer?: NodeJS.Timeout;
  private tunnelingAckTimer?: NodeJS.Timeout;
  private seqnum: number;
  private seqnumRecv: number;

  public localAddress: string | null;

  initialize(options: KnxOptions) {
    this.options = options || {};
    this.log = KnxLog.get(options);
    this.localAddress = null;
    this.ThreeLevelGroupAddressing = true;
    this.reconnection_cycles = 0;
    this.sentTunnRequests = {};
    this.useTunneling = options.forceTunneling || false;
    this.remoteEndpoint = {
      addrstring: options.ipAddr || "224.0.23.12",
      addr: ipaddr.parse(options.ipAddr || "224.0.23.12"),
      port: options.ipPort || 3671,
    };
    const range = this.remoteEndpoint.addr.range();
    this.localEchoInTunneling =
      typeof options.localEchoInTunneling !== "undefined"
        ? options.localEchoInTunneling
        : false;
    this.log.debug(
      "initializing %s connection to %s",
      range,
      this.remoteEndpoint.addrstring
    );
    switch (range) {
      case "multicast":
        if (this.localEchoInTunneling) {
          this.localEchoInTunneling = false;
          this.log.debug(
            "localEchoInTunneling: true but DISABLED because i am on multicast"
          );
        }
        IpRoutingConnection(this);
        break;
      case "unicast":
      case "private":
      case "loopback":
        this.useTunneling = true;
        IpTunnelingConnection(this);
        break;
      default:
        throw util.format(
          "IP address % (%s) cannot be used for KNX",
          options.ipAddr,
          range
        );
    }
  }

  namespace: string = "knxnet";

  initialState: string = "uninitialized";

  states = {
    uninitialized: {
      ["*"]() {
        this.transition("connecting");
      },
    },

    jumptoconnecting: {
      _onEnter() {
        this.transition("connecting");
      },
    },

    connecting: {
      _onEnter() {
        this.emit("disconnected");
        this.log.debug(util.format("useTunneling=%j", this.useTunneling));
        if (this.useTunneling) {
          let connection_attempts = 0;
          if (!this.localAddress)
            throw "Not bound to an IPv4 non-loopback interface";
          this.log.debug(
            util.format("Connecting via %s...", this.localAddress)
          );
          this.connecttimer = setInterval(() => {
            connection_attempts += 1;
            if (connection_attempts >= 3) {
              clearInterval(this.connecttimer);
              if (this.remoteEndpoint.addr.range() == "multicast") {
                this.log.warn(
                  "connection timed out, falling back to pure routing mode..."
                );
                this.usingMulticastTunneling = true;
                this.transition("connected");
              } else {
                this.reconnection_cycles += 1;
                const delay = Math.min(this.reconnection_cycles * 3, 300);
                this.log.debug(
                  "reattempting connection in " + delay + " seconds"
                );
                setTimeout(
                  () => this.transition("jumptoconnecting"),
                  delay * 1000
                );
              }
            } else {
              this.log.warn("connection timed out, retrying...");
              this.send(
                this.prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST)
              );
            }
          }, 3000);
          delete this.channel_id;
          delete this.conntime;
          delete this.lastSentTime;
          this.send(
            this.prepareDatagram(KnxConstants.SERVICE_TYPE.CONNECT_REQUEST)
          );
        } else {
          this.transition("connected");
        }
      },
      _onExit() {
        clearInterval(this.connecttimer);
      },
      inbound_CONNECT_RESPONSE(datagram: any) {
        this.log.debug(util.format("got connect response"));
        if (
          datagram.hasOwnProperty("connstate") &&
          datagram.connstate.status ===
            KnxConstants.RESPONSECODE.E_NO_MORE_CONNECTIONS
        ) {
          try {
            this.socket.close();
          } catch (error) {}
          this.transition("uninitialized");
          this.emit("disconnected");
          this.log.debug(
            "The KNXnet/IP server rejected the data connection (Maximum connections reached). Waiting 1 minute before retrying..."
          );
          setTimeout(() => {
            this.Connect();
          }, 60000);
        } else {
          this.channel_id = datagram.connstate.channel_id;
          this.send(
            this.prepareDatagram(
              KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST
            )
          );
        }
      },
      inbound_CONNECTIONSTATE_RESPONSE(datagram: any) {
        if (this.useTunneling) {
          const str = keyText("RESPONSECODE", datagram.connstate.status);
          this.log.debug(
            util.format(
              "Got connection state response, connstate: %s, channel ID: %d",
              str,
              datagram.connstate.channel_id
            )
          );
          this.transition("connected");
        }
      },
      ["*"](data: any) {
        this.log.debug(util.format("*** deferring Until Transition %j", data));
        this.deferUntilTransition("idle");
      },
    },

    connected: {
      _onEnter() {
        this.reconnection_cycles = 0;
        this.seqnum = -1;
        this.lastSentTime = this.conntime = Date.now();
        this.log.debug(
          util.format(
            "--- Connected in %s mode ---",
            this.useTunneling ? "TUNNELING" : "ROUTING"
          )
        );
        this.transition("idle");
        this.emit("connected");
      },
    },

    disconnecting: {
      _onEnter() {
        if (this.useTunneling) {
          const aliveFor = this.conntime ? Date.now() - this.conntime : 0;
          KnxLog.get().debug(
            "(%s):\tconnection alive for %d seconds",
            this.compositeState(),
            aliveFor / 1000
          );
          this.disconnecttimer = setTimeout(() => {
            KnxLog.get().debug(
              "(%s):\tconnection timed out",
              this.compositeState()
            );
            try {
              this.socket.close();
            } catch (error) {}
            this.transition("uninitialized");
            this.emit("disconnected");
          }, 3000);
          this.send(
            this.prepareDatagram(KnxConstants.SERVICE_TYPE.DISCONNECT_REQUEST),
            (err: any) => {
              KnxLog.get().debug(
                "(%s):\tsent DISCONNECT_REQUEST",
                this.compositeState()
              );
            }
          );
        }
      },
      _onExit() {
        clearTimeout(this.disconnecttimer);
      },
      inbound_DISCONNECT_RESPONSE(datagram: any) {
        if (this.useTunneling) {
          KnxLog.get().debug(
            "(%s):\tgot disconnect response",
            this.compositeState()
          );
          try {
            this.socket.close();
          } catch (error) {}
          this.transition("uninitialized");
          this.emit("disconnected");
        }
      },
    },

    idle: {
      _onEnter() {
        if (this.useTunneling) {
          if (this.idletimer == null) {
            this.idletimer = setTimeout(() => {
              this.transition("requestingConnState");
              clearTimeout(this.idletimer);
              this.idletimer = null;
            }, 60000);
          }
        }
        KnxLog.get().debug("(%s):\t%s", this.compositeState(), " zzzz...");
        this.processQueue();
      },
      _onExit() {},
      outbound_ROUTING_INDICATION(datagram: Datagram) {
        const elapsed = Date.now() - this.lastSentTime;
        if (
          !this.options.minimumDelay ||
          elapsed >= this.options.minimumDelay
        ) {
          this.transition("sendDatagram", datagram);
        } else {
          setTimeout(
            () => this.handle("outbound_ROUTING_INDICATION", datagram),
            this.minimumDelay - elapsed
          );
        }
      },
      outbound_TUNNELING_REQUEST(datagram: Datagram) {
        if (this.useTunneling) {
          const elapsed = Date.now() - this.lastSentTime;
          if (
            !this.options.minimumDelay ||
            elapsed >= this.options.minimumDelay
          ) {
            this.transition("sendDatagram", datagram);
          } else {
            setTimeout(
              () => this.handle("outbound_TUNNELING_REQUEST", datagram),
              this.minimumDelay - elapsed
            );
          }
        } else {
          KnxLog.get().debug(
            "(%s):\tdropping outbound TUNNELING_REQUEST, we're in routing mode",
            this.compositeState()
          );
        }
      },
      ["inbound_TUNNELING_REQUEST_L_Data.ind"](datagram: Datagram) {
        if (this.useTunneling) {
          this.transition("recvTunnReqIndication", datagram);
        }
      },
      ["inbound_TUNNELING_REQUEST_L_Data.con"](datagram: Datagram) {
        if (this.useTunneling) {
          const confirmed = this.sentTunnRequests[datagram.cemi.dest_addr];
          if (confirmed) {
            delete this.sentTunnRequests[datagram.cemi.dest_addr];
            this.emit("confirmed", confirmed);
          }
          KnxLog.get().trace(
            "(%s): %s %s",
            this.compositeState(),
            datagram.cemi.dest_addr,
            confirmed
              ? "delivery confirmation (L_Data.con) received"
              : "unknown dest addr"
          );
          this.acknowledge(datagram);
        }
      },
      ["inbound_ROUTING_INDICATION_L_Data.ind"](datagram: Datagram) {
        this.emitEvent(datagram);
      },
      inbound_DISCONNECT_REQUEST(datagram: any) {
        if (this.useTunneling) {
          this.transition("connecting");
        }
      },
    },

    requestingConnState: {
      _onEnter() {
        KnxLog.get().debug("Requesting Connection State");
        KnxLog.get().trace(
          "(%s): Requesting Connection State",
          this.compositeState()
        );
        this.send(
          this.prepareDatagram(
            KnxConstants.SERVICE_TYPE.CONNECTIONSTATE_REQUEST
          )
        );
        this.connstatetimer = setTimeout(() => {
          const msg = "timed out waiting for CONNECTIONSTATE_RESPONSE";
          KnxLog.get().trace("(%s): %s", this.compositeState(), msg);
          this.transition("connecting");
          this.emit("error", msg);
        }, 1000);
      },
      _onExit() {
        clearTimeout(this.connstatetimer);
      },
      inbound_CONNECTIONSTATE_RESPONSE(datagram: any) {
        const state = keyText("RESPONSECODE", datagram.connstate.status);
        switch (datagram.connstate.status) {
          case 0:
            this.transition("idle");
            break;
          default:
            this.log.debug(
              util.format(
                "*** error: %s *** (connstate.code: %d)",
                state,
                datagram.connstate.status
              )
            );
            this.transition("connecting");
            this.emit("error", state);
        }
      },
      ["*"](data: any) {
        this.log.debug(
          util.format(
            "*** deferring %s until transition from requestingConnState => idle",
            data.inputType
          )
        );
        this.deferUntilTransition("idle");
      },
    },

    sendDatagram: {
      _onEnter(datagram: Datagram) {
        this.seqnum += 1;
        if (this.useTunneling) datagram.tunnstate.seqnum = this.seqnum & 0xff;
        this.send(datagram, (err: any) => {
          if (err) {
            this.seqnum -= 1;
            this.transition("idle");
          } else {
            if (this.useTunneling)
              this.sentTunnRequests[datagram.cemi.dest_addr] = datagram;
            this.lastSentTime = Date.now();
            this.log.debug(
              "(%s):\t>>>>>>> successfully sent seqnum: %d",
              this.compositeState(),
              this.seqnum
            );
            if (this.useTunneling) {
              this.transition("sendTunnReq_waitACK", datagram);
            } else {
              this.transition("idle");
            }
          }
        });
      },
      ["*"](data: any) {
        this.log.debug(
          util.format(
            "*** deferring %s until transition sendDatagram => idle",
            data.inputType
          )
        );
        this.deferUntilTransition("idle");
      },
    },
    sendTunnReq_waitACK: {
      _onEnter(datagram: Datagram) {
        this.tunnelingAckTimer = setTimeout(() => {
          this.log.debug("timed out waiting for TUNNELING_ACK");
          this.transition("idle");
          this.emit("tunnelreqfailed", datagram);
        }, 2000);
      },
      _onExit() {
        clearTimeout(this.tunnelingAckTimer);
      },
      inbound_TUNNELING_ACK(datagram: Datagram) {
        this.log.debug(
          util.format(
            "===== datagram %d acknowledged by IP router",
            datagram.tunnstate.seqnum
          )
        );
        this.transition("idle");
      },
      ["*"](data: any) {
        this.log.debug(
          util.format(
            "*** deferring %s until transition sendTunnReq_waitACK => idle",
            data.inputType
          )
        );
        this.deferUntilTransition("idle");
      },
    },
    recvTunnReqIndication: {
      _onEnter(datagram: Datagram) {
        this.seqnumRecv = datagram.tunnstate.seqnum;
        this.acknowledge(datagram);
        this.transition("idle");
        this.emitEvent(datagram);
      },
      ["*"](data: any) {
        this.log.debug(util.format("*** deferring Until Transition %j", data));
        this.deferUntilTransition("idle");
      },
    },
  };

  acknowledge(datagram: Datagram) {
    const ack = this.prepareDatagram(
      KnxConstants.SERVICE_TYPE.TUNNELING_ACK,
      datagram
    );
    ack.tunnstate.seqnum = datagram.tunnstate.seqnum;
    this.send(ack, (err: any) => {});
  }

  emitEvent(datagram: Datagram) {
    const evtName = datagram.cemi.apdu.apci;
    this.emit(
      util.format("event_%s", datagram.cemi.dest_addr),
      evtName,
      datagram.cemi.src_addr,
      datagram.cemi.apdu.data
    );
    this.emit(
      util.format("%s_%s", evtName, datagram.cemi.dest_addr),
      datagram.cemi.src_addr,
      datagram.cemi.apdu.data
    );
    this.emit(
      evtName,
      datagram.cemi.src_addr,
      datagram.cemi.dest_addr,
      datagram.cemi.apdu.data
    );
    this.emit(
      "event",
      evtName,
      datagram.cemi.src_addr,
      datagram.cemi.dest_addr,
      datagram.cemi.apdu.data
    );
  }

  getLocalAddress() {
    const candidateInterfaces = this.getIPv4Interfaces();
    if (this.options && this.options.interface) {
      const iface = candidateInterfaces[this.options.interface];
      if (!iface)
        throw new Error(
          "Interface " +
            this.options.interface +
            " not found or has no useful IPv4 address!"
        );

      return candidateInterfaces[this.options.interface].address;
    }
    const first = Object.values(candidateInterfaces)[0];
    if (first) return first.address;

    throw "No valid IPv4 interfaces detected";
  }

  getIPv4Interfaces() {
    const candidateInterfaces: { [key: string]: any } = {};
    const interfaces = os.networkInterfaces();
    for (const [iface, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if ([4, "IPv4"].indexOf(addr.family) > -1 && !addr.internal) {
          this.log.trace(
            util.format("candidate interface: %s (%j)", iface, addr)
          );
          candidateInterfaces[iface] = addr;
        }
      }
    }
    return candidateInterfaces;
  }

  BindSocket(cb: (socket: any) => void) {}

  Connect() {}

  prepareDatagram(
    serviceType: number,
    datagram?: Datagram
  ): Datagram {
    return undefined as Datagram
  }

  send(datagram: Datagram, cb?: (err: Error) => void) {}
}

export default machina.FSM.extend(KnxFSM);
