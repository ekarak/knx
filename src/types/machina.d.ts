import EventEmitter from "events";

declare module "machina" {
  export interface States {
    /** It's the "catch-all" handler which, if provided, will match any input in that state that's not explicitly matched by name */
    "*"?: () => void;

    _onEnter?: () => void;

    timeout?: string;

    _reset?: string;

    _onExit?: () => void;

    [key: string]: {
      [key: string]: () => void;
    };
  }

  export interface Options {
    initialState: string;
    states: Record<string, States>;
    namespace?: string;
    initialize?: () => void;
  }

  export class BehavioralFsm extends EventEmitter {
    initialState: string;
    namespace: string;
    states: any; // Record<string, States>;
    state: string;

    static extend(
      protoProps: Partial<BehavioralFsm>,
      staticProps?: any
    ): typeof BehavioralFsm;
    compositeState(client: BehavioralFsm): any;
    clearQueue(client: BehavioralFsm, name?: string): void;
    handle(client: BehavioralFsm, ...args: any[]): any;
    transition(client: BehavioralFsm, newState: string): void;
    initialize(...args: any): void;
  }

  export class Fsm extends BehavioralFsm {
    static extend(
      protoProps: Partial<Fsm>,
      staticProps?: any
    ): typeof Fsm;
    compositeState(): any;
    clearQueue(name?: string): void;
    handle(...args: any[]): any;
    transition(newState: string): void;
  }
}
