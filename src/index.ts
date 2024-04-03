/**
 * knx.ts - a KNX protocol stack in pure Typescript
 * (C) 2016-2017 Elias Karakoulakis
 */

import { format } from 'util'
import { logger } from 'log-driver'

import Connection from './FSM'
import Datapoint from './Datapoint'
import Devices from './devices'
import Log from './KnxLog'
import dpts from './dptlib'

// do not use import here or package.json would be loaded twice
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgJson = require('../package.json')

logger.info(
	format(
		'Loading %s: %s, version: %s',
		pkgJson.name,
		pkgJson.description,
		pkgJson.version,
	),
)

export { Connection, Datapoint, Devices, Log, dpts }
