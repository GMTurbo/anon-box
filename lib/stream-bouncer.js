// i want to have this
// var queue = new Stream-Bouncer({count: 5, poll: 250, ...})
// but i want to be able to call
// queue.push({source: fs.createReadStream('blah'), destination: fs.createWriteStream('blahout')});

//for ...
// queue.push({...})

var through = require('through'),
  EventEmitter = require('events').EventEmitter;



//we want to setup events so we can propogate them
util.inherits(StreamBouncer, EventEmitter);

var StreamBouncer = function(option) {

  var self = this;

  options = options || {
    count: 5
  };

  var queue = [];

  function push(streamContainer) {
    if(streamContainer.source && streamContainer.destination)
      queue.push(streamContainer);
    else{
      self.emit('error', {error})
      throw Error("streamContainer must be an object with source and destination keys");
    }
  }

  function run() {

    //we need to keep the destination and handle the piping of
    //each stream in the list internally.
    //so to start, we need to pipe the first stream to the destination
    //we then need to allow the event loop to continue on, so no foreach or for
    //more like a spice then a function call
    //but we'll try the naive approach first

  }

  return {
    push: push
  };
};
