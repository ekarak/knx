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
    states: any// Record<string, States>;

    constructor(options: Options);
    static extend<T>(protoProps: T, staticProps?: any): this;
  }

  export class FSM extends BehavioralFsm {
    constructor(options: Options);
  }
}
