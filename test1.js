var knxjs = require('.');
console.log('test1');
var connection = new knxjs.IpTunnelingConnection({ipAddr:'10.12.23.53'});
connection.debug = true;

var lightValue = false;
function toggleLight() {
    lightValue = !lightValue;
    connection.Write("1/0/50", lightValue);
}

connection.Connect(function () {
    setTimeout(toggleLight, 1000);
    setTimeout(toggleLight, 3000);
    setTimeout(function () {
        connection.Disconnect();
    }, 5000);
});
