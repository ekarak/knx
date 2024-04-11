/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import KnxLog from './KnxLog'

const SERVICE_TYPE = {
	SEARCH_REQUEST: 0x0201,
	SEARCH_RESPONSE: 0x0202,
	DESCRIPTION_REQUEST: 0x0203,
	DESCRIPTION_RESPONSE: 0x0204,
	CONNECT_REQUEST: 0x0205,
	CONNECT_RESPONSE: 0x0206,
	CONNECTIONSTATE_REQUEST: 0x0207,
	CONNECTIONSTATE_RESPONSE: 0x0208,
	DISCONNECT_REQUEST: 0x0209,
	DISCONNECT_RESPONSE: 0x020a,
	DEVICE_CONFIGURATION_REQUEST: 0x0310,
	DEVICE_CONFIGURATION_ACK: 0x0311,
	TUNNELING_REQUEST: 0x0420,
	TUNNELING_ACK: 0x0421,
	ROUTING_INDICATION: 0x0530,
	ROUTING_LOST_MESSAGE: 0x0531,
	UNKNOWN: -1,
}

const CONNECTION_TYPE = {
	DEVICE_MGMT_CONNECTION: 0x03,
	TUNNEL_CONNECTION: 0x04,
	REMOTE_LOGGING_CONNECTION: 0x06,
	REMOTE_CONFIGURATION_CONNECTION: 0x07,
	OBJECT_SERVER_CONNECTION: 0x08,
}

const PROTOCOL_TYPE = {
	IPV4_UDP: 0x01,
	IPV4_TCP: 0x02,
}

const KNX_LAYER = {
	LINK_LAYER: 0x02,
	RAW_LAYER: 0x04,
	BUSMONITOR_LAYER: 0x80,
}

const FRAMETYPE = {
	EXTENDED: 0x00,
	STANDARD: 0x01,
}

const RESPONSECODE = {
	NO_ERROR: 0x00,
	E_HOST_PROTOCOL_TYPE: 0x01,
	E_VERSION_NOT_SUPPORTED: 0x02,
	E_SEQUENCE_NUMBER: 0x04,
	E_CONNSTATE_LOST: 0x15,
	E_CONNECTION_ID: 0x21,
	E_CONNECTION_TYPE: 0x22,
	E_CONNECTION_OPTION: 0x23,
	E_NO_MORE_CONNECTIONS: 0x24,
	E_DATA_CONNECTION: 0x26,
	E_KNX_CONNECTION: 0x27,
	E_TUNNELING_LAYER: 0x29,
}

const MESSAGECODES = {
	'L_Raw.req': 0x10,
	'L_Data.req': 0x11,
	'L_Poll_Data.req': 0x13,
	'L_Poll_Data.con': 0x25,
	'L_Data.ind': 0x29,
	'L_Busmon.ind': 0x2b,
	'L_Raw.ind': 0x2d,
	'L_Data.con': 0x2e,
	'L_Raw.con': 0x2f,
	'ETS.Dummy1': 0xc1,
}

export const APCICODES: string[] = [
	'GroupValue_Read',
	'GroupValue_Response',
	'GroupValue_Write',
	'PhysicalAddress_Write',
	'PhysicalAddress_Read',
	'PhysicalAddress_Response',
	'ADC_Read',
	'ADC_Response',
	'Memory_Read',
	'Memory_Response',
	'Memory_Write',
	'UserMemory',
	'DeviceDescriptor_Read',
	'DeviceDescriptor_Response',
	'Restart',
	'OTHER',
]

export const KnxConstants = {
	SERVICE_TYPE,
	CONNECTION_TYPE,
	PROTOCOL_TYPE,
	KNX_LAYER,
	FRAMETYPE,
	RESPONSECODE,
	MESSAGECODES,
	HEADER_SIZE_10: 0x6,
	KNXNETIP_VERSION_10: 0x10,
}

/* TODO helper function to print enum keys */
export function keyText(mapref: string | object, value: number): string {
	const map = typeof mapref === 'string' ? KnxConstants[mapref] : mapref

	if (typeof map !== 'object') throw Error(`Unknown map: ${mapref}`)
	for (const [key, v] of Object.entries(map)) if (v === value) return key

	KnxLog.get().trace('not found: %j', value)
}
