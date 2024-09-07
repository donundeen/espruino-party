# espruino-party
Code for espruino devices

# What's in here:

## puck_report_everything

Here we are working on code to report as many sensor values as possible from the puck, as BLE values readable by Pareto Anywhere (as dynamb and/or GATT properties). 

We are also working on a BLEQueue library, which handles the fact that the Puck can only broadcast one or two BLE properties as a time, so messages need to get lined up to send in sequence, or interrupt each other as necessary.

localdevtest.js : just little tests to load into the pusk and confirm it's working

puck_report_everything.js : the main project file

bleQ.js : the BLEQueue class as a module that can be used in esqpruino devices


## Webtesting

Sometimes it faster to test some things in the browser, when that makes sense. In particular the development of the BLEQueue library

Code that works here gets ported into the Puck

