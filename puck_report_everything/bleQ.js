
/* 
BLEQueue Module

This library allows you to add BLE setAdvertising function calls to a queue, 
so that you can send sensor values in multiple BLE advertising packages.

This is important if you have a lot of values you want to report from your device,
Since BLE packets have to be super small.

This is module can be included in espruino devices.
(The name has to be short to keep espruino happy)
put it in the same folder as your espruino code.

Usage:

let queue = require("./bleQ.js").BLEQueue();

To add a message to the queue:
queue.addToQueue(String MESSAGE_NAME, 
                int PRIORITY, 
                int ADVERTISING_DURATION_MS, 
                String REPLACE_OR_ADD (either "replace" or "add"),  
                function get_data_callback, 
                function send_data_callback);

MESSAGE_NAME: A unique id for the type of queue item, 
    usually this is the sensor name (eg "acceleration"). 
    This is used to see if there are queue items of the same name in the queue,
    and adds or replaces as appropriate

PRIORITY: when poll_queue is run, 
    any PRIORITY = 1 queue item will immediately interrupt the current message being advertised. 
    multiple PRIORITY=1 queue items will wait until the previous is done advertising, in FIFO order
    PRIORITY > 1 queue items will then be pulled from the queue in PRIORITY then FIFO order

ADVERTISING_DURATION_MS : the amount of time, in MS, to advertise this packet.

REPLACE_OR_ADD : if "replace," will replace the DATA of any current Queue item with the name, 
                while leaving the timestamp in place, so the item doesn't lose its place in line.

get_data_callback : a function called just before sending the message, 
                    which (optionally) updates the items data property. 
                    This way you can decide to send whatever the CURRENT sensor value is,
                    OR do nothing and send the data that was current when the addToQueue function was called.
                    Ideally it should return data in a format suitable for setAdvertising.

send_data_callback(item) : a function that lets you customize how NRF.setAdvertising is called (or if it's even called at all).
                    takes item as an argument, through which you can access the items properties, in particular item.data
                    If you don't set this function, the setAdvertising function will be called with this format:
                NRF.setAdvertising({}, {
                    showName: false,
                    manufacturer: 0x0590,
                    manufacturerData: JSON.stringify(item.data),
                    interval: interval
                });                      

TO GET IT STARTED:

function queue.pollQueue looks at the current queue, 
    and changes the current BLE advertising packet as appropriate.

setInterval(function(){
    queue.pollQueue(), 
    POLL_QUEUE_MILLISECONDS // some interval smaller than any of your advertising intervals. 
                            // This will be the max lag time for any interrupting message
}); 

// then set some intervals for getting sensor data, and for adding items to the queue, eg:
  setInterval(readIllumination, illumReadMS); // a smaller interval, eg 200ms
  setInterval(sendIllumination, illumSendMS); // a larger interval, eg 500ms


function readIllumination(){
  let illumValue = Puck.light();
  illumPackage = {illuminance : illumValue};
}

function sendIllumination(){
  queue.addToQueue("illum", illumPriority, illumDurationMS, "replace", 
    function(){
      return illumPackage;
    }, 
    function(item){
      let advertisingOptions = {
        interval: item.interval,
        showName: false,
        manufacturer: 0x0590, // 0x0590 or DIRACT_MANUFACTURER_ID
      };
      advertisingOptions.manufacturerData = JSON.stringify(item.data);
      NRF.setAdvertising({}, advertisingOptions);         // Start advertising    
    }
  );
}  

*/
exports.BLEQueue = function(){


    /***********************************************
     * BLE QUEUE CLASS
     ***********************************************/
    class BLEQueue {
        constructor(){
            this.queue = [];
            this.buttonval = false;
            this.timeoutID = false;
            this.pollIntervalMS = 100;
            this.currentBroadcastItem = false;
        }

        addToQueue(id, priority, interval, ifDupeFound, getDataCallback, setAdvertisingCallback){
            let time = new Date();
            let now = time.getTime();
            let item = {
                entrytime : now,
                priority: priority,
                getDataCallback : getDataCallback,
                setAdvertisingCallback : setAdvertisingCallback,
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
            if(item.setAdvertisingCallback){
                item.setAdvertisingCallback(item);
            }else{
                NRF.setAdvertising({}, {
                    showName: false,
                    manufacturer: 0x0590,
                    manufacturerData: JSON.stringify(item.data),
                    interval: interval
                });        
            }
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

    /***********************************************
     * END BLE QUEUE CLASS
     ***********************************************/



    queue = new BLEQueue();
    return queue;
}
