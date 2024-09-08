/**
* knx.js - a KNX protocol stack in pure Javascript
* (C) 2016-2018 Elias Karakoulakis
*/

Error.stackTraceLimit = Infinity;

const knx = require('../..');
const test = require('tape');

//
test('Datapoint', function(t) {
    t.throws(() => {
        new knx.Datapoint();
      }, null, `must supply at least { ga, dpt }!`);
    
    class FakeConnection {
        constructor() {
            this.callbacks = [];
        }
        on(event, callback) {
            this.callbacks.push(callback);
        }
        emit(evt, src, buf) {
            for (const callback of this.callbacks) {
                callback(evt, src, buf);
            }
        }
    };
    const conn = new FakeConnection();
    const datapoint = new knx.Datapoint({ga: '1/0/1'}, conn);
    datapoint.on('event', (event, value, src) => {
        t.ok(event == 'GroupValue_Write', 'event should match GroupValue_Write');
        t.ok(value == false, 'value should be false');
        t.ok(src == '1.1.1', 'src should be 1.1.1');
      });
    conn.emit('GroupValue_Write', '1.1.1', Buffer.from([0x00], 'hex'));
    t.end();
});
