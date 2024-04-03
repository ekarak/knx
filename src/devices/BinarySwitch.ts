import { Logger } from 'log-driver'
import Datapoint from '../Datapoint'
import KnxLog from '../KnxLog'

export default class BinarySwitch {
	private control_ga: string

	private status_ga: string

	private conn: any

	private control: Datapoint

	private status: Datapoint

	private log: Logger

	constructor(options: { ga: string; status_ga: string }, conn: any) {
		if (!options || !options.ga) throw Error('must supply at least { ga }!')

		this.control_ga = options.ga
		this.status_ga = options.status_ga
		if (conn) this.bind(conn)
		this.log = KnxLog.get()
	}

	bind(conn: any) {
		if (!conn)
			this.log.warn('must supply a valid KNX connection to bind to')
		this.conn = conn
		this.control = new Datapoint({ ga: this.control_ga }, conn)
		if (this.status_ga)
			this.status = new Datapoint({ ga: this.status_ga }, conn)
	}

	// EventEmitter proxy for status ga (if its set), otherwise proxy control ga
	on(...args: any[]) {
		const tgt = this.status_ga ? this.status : this.control
		try {
			tgt.on.call(tgt, ...args)
		} catch (err) {
			this.log.error(err)
		}
	}

	switchOn() {
		if (!this.conn)
			this.log.warn('must supply a valid KNX connection to bind to')
		this.control.write(1)
	}

	switchOff() {
		if (!this.conn)
			this.log.warn('must supply a valid KNX connection to bind to')
		this.control.write(0)
	}

	write(v: any) {
		if (!this.conn)
			this.log.warn('must supply a valid KNX connection to bind to')
		this.control.write(v)
	}
}
