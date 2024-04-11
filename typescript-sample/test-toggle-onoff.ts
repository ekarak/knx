/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2017 Elias Karakoulakis
*/

import { KnxClient, Datapoint } from 'knx'

var groupAddress = process.argv[2]

var connection = new KnxClient({
    ipAddr: process.env.KNXGW,
    handlers: {
        connected: onConnected
    }
})

async function onConnected() {
    console.log('Connected')
    var dp = new Datapoint({
        ga: groupAddress,
        dpt: 'DPT1.001'
    }, connection)

    dp.on('change', (oldValue: number, newValue: number) =>
        console.log(`Value changed from ${oldValue} to ${newValue}`) )

    dp.read()
    await wait(2000)

    dp.write(1)
    await wait(2000)

    dp.write(0)
    await wait(2000)

    connection.Disconnect()
}

function wait(ms: number) {
    return new Promise( (resolve) => {
        setTimeout(resolve, ms)
    })
}