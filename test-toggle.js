//
var knx = require('knx');
if (process.argv.length < 3) {
  console.log('usage: %s <ga> <optional: status_ga> to toggle a light on & off', process.argv[1]);
  process.exit(1);
}
var connection = knx.IpRoutingConnection();
connection.debug = true;

var p1 = new Promise(function(resolve, reject) {
  connection.Connect(function() {
    console.log('----------');
    console.log('Connected!');
    console.log('----------');
    resolve();
  });
});

p1.then(function() {
  // define a datapoint:
  var dp = new knx.Datapoint({ ga: process.argv[2], dpt: 'DPT1.001' }, connection);
  if (process.argv[3]) {
    var status_ga = new knx.Datapoint({ ga: process.argv[3], dpt: 'DPT1.001' }, connection);
    status_ga.on('change', function(oldvalue, newvalue) {
      console.log("**** Status changed from: %j to: %j",
        oldvalue, newvalue);
    });
  }
  // Now send off a couple of requests:
  console.log('\n\n\n');
  console.log('PRESS ANY KEY TO TOGGLE %s AND "q" TO QUIT.', process.argv[2]);
  console.log('\n\n\n');
  var dpVal = false;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (data) => {
      console.log(JSON.stringify(data));
      if(data[0] === 113) {
          process.exit(0);
          return;
      }
      dpVal = !dpVal;
      console.log("Sending " + dpVal);
      dp.write(dpVal);
  });
});
