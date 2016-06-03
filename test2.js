var knxjs = require('.');
var connection = new knxjs.KnxConnectionRouting();
console.log("connection created");
var lightValue = false;
function toggleLight() {
    lightValue = !lightValue;
    connection.Action("1/0/50", lightValue);
}

connection.Connect(function () {
    setTimeout(toggleLight, 2000);
    setTimeout(toggleLight, 5000);
    setTimeout(function () {
        connection.Disconnect();
    }, 7000);
});
