// broadcast all Espruino sensor values as BLE aligning with these names:
// https://reelyactive.github.io/diy/cheatsheet/ 


/***********************************************
 * CONSTANTS
 ***********************************************/

/***********************************************
 * CONSTANTS FOR ACCELERATION AND BATTERY
 ***********************************************/

const INSTANCE_ID = null; // null = auto-generated.  Or specify ID with:
                          // new Uint8Array([ 0x00, 0x00, 0x00, 0x01 ]);

const ACC_SAMPLE_RATE_HZ = 1.6; // Valid values are 1.6, 12.5, 26, 52, 104, 208
const LED_BLINK_MILLISECONDS = 50;
const POLL_QUEUE_MIILISECONDS = 50;
const INVALID_ACCELERATION_CODE = 0x20;
const MAX_ACCELERATION_TO_ENCODE = 2;
const MAX_ACCELERATION_MAGNITUDE = 0x1f;
const ACCELERATION_UNITS_PER_G = 8192;
const ENABLE_ACCELEROMETER = true;
const MAX_BATTERY_VOLTAGE = 3.0;
const MIN_BATTERY_VOLTAGE = 2.0;
const DIRACT_PROXIMITY_FRAME = 0x01;
const DIRACT_DIGEST_FRAME = 0x11;
const DIRACT_DEFAULT_COUNT_LENGTH = 0x07;
const DIRACT_MANUFACTURER_ID = 0x0583;  // Code Blue Consulting
const DIRACT_INSTANCE_LENGTH = 4;
const DIRACT_INSTANCE_OFFSET = 2;
const BITS_PER_BYTE = 8;
const EDDYSTONE_INSTANCE_OFFSET = 14;
/***********************************************
 * END CONSTANTS FOR ACCELERATION AND BATTERY
 ***********************************************/

/***********************************************
 * END CONSTANTS
 ***********************************************/


/***********************************************
 * GLOBAL VARIABLES AND OBJECTS
 ***********************************************/
// the queue class
let queue = require("./bleQ.js").BLEQueue();

/***********************************************
 * GLOBAL VARIABLES AND OBJECTS - FOR ACCELERATION AND BATTERY
 ***********************************************/
let accelPackage = false;
let accelPollMS = 100;
let accelDurationMS = 1000;

// these will hold dynscale objects
// to scale the values of the inputs
let accelScaleX = false;
let accelScaleY = false;
let accelScaleZ = false;
let accelPriority = 3;
let instanceId = null;
/***********************************************
 * END GLOBAL VARIABLES AND OBJECTS - FOR ACCELERATION AND BATTERY
 ***********************************************/
// accelerometer
let illumPackage = false;
let illumSendMS = 1000;
let illumReadMS = 200;
let illumDurationMS = 500;
let illumPriority = 3;

// these will hold dynscale objects
// to scale the values of the inputs
let illumScale = false;
/***********************************************
 * GLOBAL VARIABLES AND OBJECTS - FOR ILLUMINATION
 ***********************************************/


/***********************************************
 * END GLOBAL VARIABLES AND OBJECTS
 ***********************************************/



/***********************************************
 * GENERAL FUNCTIONS
 ***********************************************/
// called once all the code is loaded.
function startup() {

  // flash the led
  LED2.write(true);
  setTimeout(function() { LED2.write(false); }, LED_BLINK_MILLISECONDS);

  // create the instanceID
  instanceId = autoInstanceId();

  if(!queue){
    queue = new BLEQueue();
  }

  // make a setup function for each sensor and call it here.
  setupAcceleration();
  setupIllumination();
  
  setInterval(function(){
    queue.pollQueue(), 
    POLL_QUEUE_MIILISECONDS
  });  
  
}
/***********************************************
 * END GENERAL FUNCTIONS
 ***********************************************/

/***********************************************
 * SENSOR-SPECIFIC FUNCTIONS
 ***********************************************/

/***********************************************
 * ILLUMINATION: LIGHT SENSOR
 ***********************************************/
function setupIllumination(){
  illumScale = new dynScale(false, false, 0, 100);
  setInterval(readIllumination, illumReadMS);
  setInterval(sendIllumination, illumSendMS);
}

function readIllumination(){
  let illumValue = Puck.light();
  illumValue = Math.round(illumScale.scale(illumValue));
  illumPackage = {illuminance : illumValue};
}

function sendIllumination(){
  console.log("adding illum to queue")
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
      console.log("sending illum" , advertisingOptions);
      NRF.setAdvertising({}, advertisingOptions);         // Start advertising    
    }
  );
}
/***********************************************
 * END ILLUMINATION: LIGHT SENSOR
 ***********************************************/


/***********************************************
 * ACCELERATION AND BATTERY
 ***********************************************/
function setupAcceleration(){

  // start tracking acceleration.
  Puck.accelOn(ACC_SAMPLE_RATE_HZ);
  Puck.on('accel', handleAcceleration);
  
  Puck.accelOn(ACC_SAMPLE_RATE_HZ);
  
  // initialized the acceleration Scaling classes.
  accelScaleX = new dynScale(false, false, 0,1);
  accelScaleY = new dynScale(false, false, 0,1);
  accelScaleZ = new dynScale(false, false, 0,1);

  // at this interval, send acceleration data
  setInterval(sendAcceleration, accelPollMS);
}

// this function happens whenever acceleration data is generated by the Puck
function handleAcceleration(data) {
  
  encodedAcceleration = encodeAcceleration(data.acc); 
  console.log(encodedAcceleration);
  accelPackage = encodedAcceleration;
  /*
  accx = accelScaleX.scale(data.acc.x);
  accy = accelScaleY.scale(data.acc.y);
  accz = accelScaleZ.scale(data.acc.z);
  accelPackage = {acceleration : [accx,
                                   accy,
                                   accz]};
                                   */
}

/**
 * Encode the acceleration as a magnitude.
 * @return {Array} The encoded acceleration [ x, y, z ].
 */
function encodeAcceleration(acc) {
  let encodedAcceleration = { x: INVALID_ACCELERATION_CODE,
                              y: INVALID_ACCELERATION_CODE,
                              z: INVALID_ACCELERATION_CODE };

  if(ENABLE_ACCELEROMETER) {
    let acceleration = acc;
    for(let axis in acceleration) {
      let magnitude = acceleration[axis] / ACCELERATION_UNITS_PER_G;
      let encodedMagnitude = Math.min(MAX_ACCELERATION_MAGNITUDE,
                                      Math.round(MAX_ACCELERATION_MAGNITUDE *
                                                 (Math.abs(magnitude) /
                                                 MAX_ACCELERATION_TO_ENCODE)));
      if(magnitude < 0) {
        encodedMagnitude = 0x3f - encodedMagnitude;
      }
      encodedAcceleration[axis] = encodedMagnitude;
    }
  }
  // need to look at these values to see how we could scale it....
  return encodedAcceleration;
}

/**
 * Encode the battery percentage.
 * @return {Number} The battery percentage.
 */
function encodeBatteryPercentage() {
  let voltage = NRF.getBattery();
  
  if(voltage <= MIN_BATTERY_VOLTAGE) {
    return 0x00;
  }
  if(voltage >= MAX_BATTERY_VOLTAGE) {
    return 0x3f;
  }

  return Math.round(0x3f * (voltage - MIN_BATTERY_VOLTAGE) /
         (MAX_BATTERY_VOLTAGE - MIN_BATTERY_VOLTAGE));
}

  
function sendAcceleration(){
  queue.addToQueue("accel", accelPriority, accelDurationMS, "replace", 
    function(){
      return accelPackage;
    }, 
    function(item){
      let advertisingOptions = {
        interval: item.interval,
        showName: false,
        manufacturer: DIRACT_MANUFACTURER_ID
      };

      advertisingOptions.manufacturerData = compileAccelerationData(item);
      console.log("sending accel", advertisingOptions);
      NRF.setAdvertising({}, advertisingOptions);         // Start advertising    
    }
  );
}

/*
encode the acceleration data into a packege for setAdvertising
*/
function compileAccelerationData(item){
  let encodedBattery = encodeBatteryPercentage();  
  let sensorData = []
  sensorData[0] = ((item.data.x << 2) & 0xfc) |
                  ((item.data.y >> 4) & 0x3f);
  sensorData[1] = ((item.data.y << 4) & 0xf0) |
                  ((item.data.z >> 2) & 0x0f);
  sensorData[2] = ((item.data.z << 6) & 0xc0) |
                  (encodedBattery & 0x3f);  
  
  let data = [
    DIRACT_PROXIMITY_FRAME, DIRACT_DEFAULT_COUNT_LENGTH,
    instanceId[0], instanceId[1], instanceId[2], instanceId[3],
    sensorData[0], sensorData[1], sensorData[2]
  ];   
  return data;  
}

/**
 * Create an instance ID from the least-significant 2-bytes of the advAddress.
 * @return {Uint8Array} The automatically-generated instance ID.
 */
function autoInstanceId() {
  let address = NRF.getAddress();

  return new Uint8Array([ 0x00, 0x00, parseInt(address.substring(12, 14), 16),
                          parseInt(address.substring(15, 17), 16) ]);
}
/***********************************************
 * END ACCELERATION AND BATTERY
 ***********************************************/



/***********************************************
 * UTILITY CLASSES
 ***********************************************/


/***********************************************
 * DynScale CLASS
 ***********************************************/
// Class DynScale
// this class is for scaling an input in an unknown range to a known output range
// over time it assumes the lowest input received is the input minimum, 
// and the highest value received is the input maximum. 
// it then scales the input accordingly
class dynScale{

  // in the constructor, specify a starting input min and max, 
  // or false for inmin and inmax to have it take the first input value as min and max
  // outmin and outmax is the output range
  constructor(inmin, inmax, outmin, outmax){
    this.inmin = inmin;
    this.inmax = inmax;
    this.outmin = outmin;
    this.outmax = outmax;
  }
  
  // scale
  // this method takes a value and returns a scaled value.
  // if value is outside the range of inmin and inmax, 
  // it expands the range to include it
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
/***********************************************
 * END DynScale CLASS
 ***********************************************/
/***********************************************
 * END UTILITY CLASSES
 ***********************************************/




// get things going.
startup();
