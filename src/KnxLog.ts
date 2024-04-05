import util from 'util'
import factory, { Logger, LogLevel } from 'log-driver'

export interface KnxLogger {
	get: (options?: KnxLogOptions) => Logger
}

let logger: Logger

export interface KnxLogOptions {
	debug?: boolean
	loglevel?: LogLevel
}

const create = (options: KnxLogOptions): Logger => {
	const level: LogLevel =
		(options && (options.debug ? 'debug' : options.loglevel)) || 'info'
	return factory({
		level,
		format(lvl: LogLevel, msg: string, ...a: any[]) {
			const ts = new Date()
				.toISOString()
				.replace(/T/, ' ')
				.replace(/Z$/, '')
			return a.length
				? util.format(`[%s] %s ${msg}`, lvl, ts, ...a)
				: util.format('[%s] %s %s', lvl, ts, msg)
		},
	})
}

const KnxLog: KnxLogger = {
	get: (options: KnxLogOptions): Logger => {
		if (!logger || options) logger = create(options)
		return logger
	},
}

export default KnxLog
