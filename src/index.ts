/**
* knx.ts - a KNX protocol stack in pure Typescript
* (C) 2016-2017 Elias Karakoulakis
*/

import { format } from 'util';
import log from 'log-driver';

import Connection from './FSM';
import Datapoint from './Datapoint';
import Devices from './devices';
import Log from './KnxLog';

const pkgJson = require('../package.json');

log.info(format('Loading %s: %s, version: %s',
pkgJson.name, pkgJson.description, pkgJson.version));

export { Connection, Datapoint, Devices, Log };