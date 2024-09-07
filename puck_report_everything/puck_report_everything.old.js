// broadcast all Espruino sensor values as BLE aligning with these names:
// https://reelyactive.github.io/diy/cheatsheet/ 

const ACC_SAMPLE_RATE_HZ = 12.5; // Valid values are 1.6, 12.5, 26, 52, 104, 208
const LED_BLINK_MILLISECONDS = 50;
const POLL_QUEUE_MIILISECONDS = 50;

let queue = false;

// accelerometer
let accelPackage = false;
let accelPollMS = 100;
let accelDuration = 500;
let accelScaleX = false;
let accelScaleY = false;
let accelScaleZ = false;


function handleAcceleration(data) {
    accx = accelScaleX.scale(data.acc.x);
    accx = Math.round(accx * 9);
    accy = accelScaleY.scale(data.acc.y);
    accy = Math.round(accy * 9);
    accz = accelScaleZ.scale(data.acc.z);
    accz = Math.round(accz * 9);
    accelPackage = {acceleration : [accx,
                                   accy,
                                   accz]}
  }
  
function sendAcceleration(){
    queue.addToQueue("accel", 3, accelDuration, "replace", function(){
        return accelPackage;
    });
}


// Handle a button press: blink green LED and initiate accelerometer readings
function startup() {
  if(!queue){
    queue = new BLEQueue();
  }
  Puck.accelOn(ACC_SAMPLE_RATE_HZ);
  Puck.on('accel', handleAcceleration);
  
  Puck.accelOn(ACC_SAMPLE_RATE_HZ);
  LED2.write(true);
  setTimeout(function() { LED2.write(false); }, LED_BLINK_MILLISECONDS);
  
  setInterval(function(){
    queue.pollQueue(), 
    POLL_QUEUE_MIILISECONDS
  });
  
  accelScaleX = new dynScale(false, false, 0,1);
  accelScaleY = new dynScale(false, false, 0,1);
  accelScaleZ = new dynScale(false, false, 0,1);
  setInterval(sendAcceleration, accelPollMS);
  
}


class BLEQueue {
    constructor(){
        this.queue = [];
        this.buttonval = false;
        this.timeoutID = false;
        this.pollIntervalMS = 100;
        this.currentBroadcastItem = false;
    }

    addToQueue(id, priority, interval, ifDupeFound, getDataCallback){
        let time = new Date();
        let now = time.getTime();
        let item = {
            entrytime : now,
            priority: priority,
            getDataCallback : getDataCallback,
            interval: interval,
            id: id 
        }

        // see if it already exists:
        if(ifDupeFound != "add"){
            let obj = this.queue.find((o, i) => {
                if (o.id === id) {
                    if(ifDupeFound == "replace"){
                        // replace it
                        item.entrytime = this.queue[i].entrytime;
                        this.queue[i] = item;
                        return true; // stop searching
                    }else{
                        return true;
                    }
                }
            });
            if(!obj){
                this.queue.push(item);
            }
        }else{
            this.queue.push(item);
        }
    }


    pollQueue(){
        /*
        keep track of current timeoutID
        poll every X(low number) milliseconds:
            if there's priority 1 items, cancel current broadcast timeout unless it's also priority 1
            if not:
                get highest-priority item in queue
                    if there's not a current timeoutID
                        run it for specified interval. Save the teimoutID
                    if there is a current timeoutID
                        if the priority of new item is higher than the current broadcase ite,:
                            cancel current timeoutID
                            run new item, save the timeoutID     
        */

        // if there's a priority1 item broadcasting, don't do anything
        if(this.currentBroadcastItem && this.currentBroadcastItem.priority == 1){
            return;
        }
        if(!this.queue){
            return;
        }
        // otherwise check if there are any priority 1 items
        let p1_items = this.queue.filter(i => i.priority == 1);
        // if there are, then get it, cancel current item and run this.
        if(p1_items && p1_items.length > 0){
            let item = this.getNextQueueItem();
            if(item){
                let data = item.getDataCallback();
                item.data = data;
                this.broadcast(item, item.interval);
            }
        }
        // if there's a current timeoutID, don't do anything.
        if(this.timeoutID){
            return;
        }
        // there isn't, broadcase the highest-priority item;
        let item = this.getNextQueueItem();
        if(item){
            let data = item.getDataCallback();
            item.data = data;
            this.broadcast(item, item.interval);
        }

    }

    broadcast(item, interval){
        this.endBroadcast();
        this.currentBroadcastItem = item;
        let self = this;
console.log(JSON.stringify(item.data));
        NRF.setAdvertising({}, {
            showName: false,
            manufacturer: 0x0590,
            manufacturerData: JSON.stringify(item.data),
            interval: interval
        });        

        this.timeoutID = setTimeout(function(){
            self.endBroadcast();
        }, interval);
    }

    endBroadcast(){
        clearTimeout(this.timeoutID);
        this.currentBroadcastItem = false;
        this.timeoutID = false;
    }

    getNextQueueItem(){
        this.queue.sort(function(a,b){
            if(a.priority != b.priority){
                return a.priority - b.priority;
            }
            return a.entrytime - b.entrytime;
        });
        if(this.queue.length > 0){
            let item = this.queue.shift();
            return item;
        }
        return false;
    }

}

class dynScale{
  constructor(inmin, inmax, outmin, outmax){
    this.inmin = inmin;
    this.inmax = inmax;
    this.outmin = outmin;
    this.outmax = outmax;
  }
  
  scale(value){
     if(!this.inmin || value < this.inmin){
        this.inmin = value; 
     }
     if(!this.inmax || value > this.inmax){
        this.inmax = value; 
     }
     let inrange = this.inmax - this.inmin;
     if(inrange == 0){
       return (this.outmax + this.outmin) / 2;
     }
     let ratio = (value - this.inmin) / inrange;
     let outrange = this.outmax - this.outmin;
     let outval = this.outmin + (outrange * ratio)
     return outval;
  }
}



startup();


