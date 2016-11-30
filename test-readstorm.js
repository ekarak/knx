var knx = require('knx');

var connection = new knx.IpRoutingConnection();
connection.debug = true;

function setupDatapoint(groupadress, statusga) {
  var dp = new knx.Datapoint({ga: groupadress, status_ga: statusga, dpt: "DPT1.001"}, connection);
  dp.on('change', (oldvalue, newvalue) => {
    console.log("**** %s current value: %j", groupadress, newvalue);
  });
  return dp;
}
Error.stackTraceLimit = Infinity;
new Promise(function(resolve, reject) {
  connection.Connect(function() {
    console.log('===========\nConnected!\n===========');
    resolve();
  });
  }).then(function() {
    setupDatapoint('1/1/0', '1/1/100');
    setupDatapoint('1/1/1', '1/1/101');
    setupDatapoint('1/1/2', '1/1/102');
    setupDatapoint('1/1/3', '1/1/103');
    setupDatapoint('1/1/4', '1/1/104');
    setupDatapoint('1/1/5', '1/1/105');
    setupDatapoint('1/1/6', '1/1/106');
    setupDatapoint('1/1/7', '1/1/107');
    dp8 = setupDatapoint('1/1/8', '1/1/108');
    setTimeout(function () {
      dp8.write(1);
      setTimeout(function () {
        dp8.write(0);
      }, 3000);
    }, 3000);
  }, function(error) { console.error(error);}
);
