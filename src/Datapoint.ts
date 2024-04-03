import { EventEmitter } from 'events';
import { format } from 'util';
import * as DPTLib from './dptlib';
import KnxLog from './KnxLog';

interface Options {
  ga: string;
  dpt?: string;
  autoread?: boolean;
  status_ga?: string;
}

class Datapoint extends EventEmitter {
  private options: Options;
  private dptid: string;
  private dpt: any;
  private current_value: any;
  private conn: any;

  constructor(options: Options, conn: any) {
    if (options == null || options.ga == null)
      throw new Error('must supply at least { ga, dpt }!');
    super();

    this.options = options;
    this.dptid = options.dpt || 'DPT1.001';
    this.dpt = DPTLib.resolve(this.dptid);
    KnxLog.get().trace('resolved %s to %j', this.dptid, this.dpt);
    this.current_value = null;
    if (conn) this.bind(conn);
  }

  bind(conn: any) {
    if (!conn) throw new Error('must supply a valid KNX connection to bind to');
    this.conn = conn;
    const gaevent = format('event_%s', this.options.ga);
    conn.on(gaevent, (evt: string, src: any, buf: any) => {
      switch (evt) {
        case 'GroupValue_Write':
        case 'GroupValue_Response':
          if (buf) {
            const jsvalue = DPTLib.fromBuffer(buf, this.dpt);
            this.emit('event', evt, jsvalue);
            this.update(jsvalue);
          }
          break;
        default:
          this.emit('event', evt);
      }
    });
    if (this.options.autoread)
      if (conn.conntime) {
        this.read();
      } else {
        conn.on('connected', () => {
          this.read();
        });
      }
  }

  update(jsvalue: any) {
    const old_value = this.current_value;
    if (old_value === jsvalue) return;

    this.emit('change', this.current_value, jsvalue, this.options.ga);
    this.current_value = jsvalue;
    const ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    KnxLog.get().trace(
      '%s **** %s DATAPOINT CHANGE (was: %j)',
      ts,
      this.toString(),
      old_value
    );
  }

  write(value: any) {
    if (!this.conn) throw new Error('must supply a valid KNX connection to bind to');
    if (this.dpt.hasOwnProperty('range')) {
      const { range } = this.dpt.basetype;
      const [min, max] = range;
      if (value < min || value > max) {
        throw new Error(
          format(
            'Value %j(%s) out of bounds(%j) for %s',
            value,
            typeof value,
            range,
            this.dptid
          )
        );
      }
    }
    this.conn.write(
      this.options.ga,
      value,
      this.dptid,
      () => this.update(value)
    );
  }

  read(callback?: (src: any, jsvalue: any) => void) {
    if (!this.conn) throw new Error('must supply a valid KNX connection to bind to');
    this.conn.read(this.options.ga, (src: any, buf: any) => {
      const jsvalue = DPTLib.fromBuffer(buf, this.dpt);
      if (typeof callback == 'function') callback(src, jsvalue);
    });
  }

  toString() {
    return format(
      '(%s) %s %s',
      this.options.ga,
      this.current_value,
      (this.dpt.subtype && this.dpt.subtype.unit) || ''
    );
  }
}

export default Datapoint;