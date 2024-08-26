let buttonInterval = 1000;
let tempInterval = 2050;
let sliderInterval = 500;



$(document).ready(function(){
    let time = new Date();
    let now = time.getTime();
    
    debug({"loaded " : now});

    /*
we;re going to fake inputs that the puck might get from its sensors, 
and model how we'd broadcast those packets.

for each sensor type, we nned to know:
- advertising interval - what's used as the advertising interval in NRF.setAdvertising

- freshness: how soon do we need to advertise it?
= are we advertising the CURRENT value, or the value at the time we send it?
-- eg we queue acceleromter data to send, but when we send we send the accel value at the time we're sending it. Probably.
-- but, a button press, we send the value of the button ("on or off") in effect at the time we QUEUED it.
- scheduling: do we send the data every minute? do we send it immediately and just once? Do we send it only when it's changed
- priority
-- immediate: stop what you're doing and send this value instead
-- medium : send unless an immediate event wants to happen. but don't let a low priority talk over it
-- low: more frequent, so let it get interrupted by immediate or medium



- but if there are a bunch of low priorities, then they need to get queued.

so the queue is ordered by (in this order):
- Priority number
- FIFO (entry timestamp)

need to make sure queue doesnt' get all backed up. 
prevent duplicates. So each entry into the queue needs a name
if an entry is a duplicate, replace or keep original?

the queue calls a callback function, which can determine if you get fresh data or use the orginal value.

interrupting:
priority 1 items get executed immediately, unless there's another priority 1 item.

lower priority items get added the the queue.

process
keep track of current timeoutID
poll every X(low number) milliseconds:
    if there's priority 1 items, cancel current broadcast timeout unless it's also priority 1
    if not:
        get highest-priority item in queue
            if there's not a current timeoutID
                broadcast the item
            if there is a current timeoutID
                don't do anything. > 1 priority items don't interrupt each other.
    */


    queue = new BLEQueue();

   $("#runqueue").on("click", function(){
    queue.runQueue();
   });


   $("#buttonpress").on("mousedown",function(){
    buttonval = true;
    queue.addToQueue("buttondown",1,buttonInterval, "replace",function(){
        return true;
    });
    debug(buttonval);
   })

   $("#buttonpress").on("mouseup",function(){
    buttonval = false;
    queue.addToQueue("buttonup",1,buttonInterval, "replace",function(){
        return false;
    });
    debug(buttonval);
   })



   $("#accel").change(function(){
    debug("slider"+ $("#accel").val());
    queue.addToQueue("slider",2,sliderInterval, "replace",function(){
        $("#accel").val();
    });    
   });


   setInterval(function(){
    queue.addToQueue("temp",3, tempInterval, "replace", function(){
        let temp = getTemp();
        console.log("getting temp", temp);
        return temp;
    });
   }, 1000);


    setInterval(function(){
        queue.pollQueue();
    }, queue.pollIntervalMS);


});


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
                        console.log("replacing");
                        console.log(item);
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
        showQueue(this.queue);
    }


    pollQueue(){
        console.log("pollQueue");
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
            console.log("p1 item", this.currentBroadcastItem);
            return;
        }
        if(!this.queue){
            console.log("no queue");
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
            console.log("timeoutid", this.timeoutID);
            return;
        }
        // there isn't, broadcase the highest-priority item;
        let item = this.getNextQueueItem();
        if(item){
            let data = item.getDataCallback();
            console.log("got data ", data);

            item.data = data;
            this.broadcast(item, item.interval);
        }

    }

    broadcast(item, interval){
        showbroadcast(item);
        showQueue(this.queue);
        this.endBroadcast();
        this.currentBroadcastItem = item;
        console.log("bcast" , interval);
        let self = this;
        this.timeoutID = setTimeout(function(){
            self.endBroadcast();
        }, interval);
    }

    endBroadcast(){
        console.log("end timeout ", this.timeoutID);
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
            showQueue(this.queue);
            return item;
        }
        showQueue(this.queue);
        return false;
    }

}


function showbroadcast(packet){
    $("#packetout").text(JSON.stringify(packet, null, "  "));
}

function showQueue(theq){
    $("#queue").text(JSON.stringify(theq, null, "  "));
} 

function getTemp(){
    return Math.random() * 300;
}

function debug(msg){
    $("#debug").append(JSON.stringify(msg, null, "  ")+"\n");
}
