/// <reference types="node" />

import * as events from "events";

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

type ConnectionSpec = {
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
};

type KnxDeviceAddress = string;

type KnxGroupAddress = string;

/** The type of the KnxValue depends on the DPT that it is associated with */
type KnxValue = number | string | boolean | Date;

/** Possible formats "X" or "X.Y", i.e. "1" or "1.001" */
type DPT = string;

type DatapointOptions = {
  ga: KnxGroupAddress;
  dpt?: DPT;
  autoread?: boolean;
};

interface DatapointEvent {
  on(
    event: "change",
    listener: (old_value: KnxValue, new_value: KnxValue) => void
  ): this;
  on(event: string, listener: (event: string, value: any) => void): this;
}

declare module "knx" {
  type MachinaEventsCallback = (...args: any[]) => void;

  interface MachinaEventsReturn {
    eventName: string;
    callback: MachinaEventsCallback;
    off: () => void;
  }

  class MachinaEvents {
    emit(eventName: string): void;
    on(eventName: string, callback: MachinaEventsCallback): MachinaEventsReturn;
    off(eventName?: string, callback?: MachinaEventsCallback): void;
  }

  interface MachinaEventsReturn {
    eventName: string;
    callback: MachinaEventsCallback;
    off: () => void;
  }

  export interface IConnection extends MachinaEvents {
    debug: boolean;
    Connect(): void;
    Disconnect(cb?: () => void): void;
    read(ga: KnxGroupAddress, cb?: (err: Error, src: KnxDeviceAddress, value: Buffer) => void): void;
    write(ga: KnxGroupAddress, value: Buffer, dpt: DPT, cb?: () => void): void;
  }

  export class Connection extends MachinaEvents implements IConnection {
    public debug: boolean;
    constructor(conf: ConnectionSpec);
    Connect(): void;
    Disconnect(cb?: () => void): void;
    read(ga: KnxGroupAddress, cb?: (err: Error, src: KnxDeviceAddress, value: Buffer) => void): void;
    write(ga: KnxGroupAddress, value: Buffer, dpt: DPT, cb?: () => void): void;
    writeRaw(
      ga: KnxGroupAddress,
      value: Buffer,
      bitlength?: number,
      cb?: () => void
    ): void;
  }

  export class Datapoint extends events.EventEmitter implements DatapointEvent {
    readonly current_value: KnxValue;
    readonly dptid: DPT;

    constructor(options: DatapointOptions, conn?: IConnection);
    bind(conn: Connection): void;
    write(value: KnxValue): void;
    read(callback?: (err: Error, src: KnxDeviceAddress, value: KnxValue) => void): void;
  }
}
