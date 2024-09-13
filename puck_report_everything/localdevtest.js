let queue = require("./bleQ.js").BLEQueue();

console.log(JSON.stringify(queue));



var  on = false;

setInterval(function() {

  on = !on;
  console.log(on, "hey");
  LED1.write(on);
}, 1000);