import util from 'util';
import factory from 'log-driver';

export enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export interface LogDriverOptions {
  level: LogLevel;
  format: (level: LogLevel, msg: string, ...args: any[]) => string;
}

export interface KnxLogger {
  get: (options?: KnxLogOptions) => Logger;
}

export interface Logger {
  trace: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  format: LogDriverOptions['format'];
}

let logger: Logger;


export interface KnxLogOptions {
  debug?: boolean;
  loglevel?: LogLevel;
}

const create = (options: KnxLogOptions): Logger => {
  const level: LogLevel =
    (options && (options.debug ? LogLevel.Debug : options.loglevel)) || LogLevel.Info;
  return factory({
    level,
    format(lvl: LogLevel, msg: string, ...a: any[]) {
      const ts = new Date().toISOString().replace(/T/, ' ').replace(/Z$/, '');
      return a.length
        ? util.format('[%s] %s ' + msg, lvl, ts, ...a)
        : util.format('[%s] %s %s', lvl, ts, msg);
    },
  });
};

const KnxLog: KnxLogger = { get: (options: KnxLogOptions): Logger => logger || (logger = create(options)) };

export default KnxLog;