// i want to have this
// var queue = new Stream-Bouncer({count: 5, poll: 250, ...})
// but i want to be able to call
// queue.push({source: fs.createReadStream('blah'), destination: fs.createWriteStream('blahout')});

//for ...
// queue.push({...})
//
var through = require('through'),
  EventEmitter = require('events').EventEmitter,
  _ = require('lodash');

var util = require('util');

var StreamBouncer = function(options) {
  options = options || {};
  _.extend(options, {count: 5, poll: 250});

  var self = this;

  options.poll = options.poll || 250;

  var queue = [];

  function push(streamContainer) {
    if(streamContainer.source && streamContainer.destination) {
      queue.push(streamContainer);
      _run();
    } else {
      _emit('error', {error: 'push needs a source and destination'});
    }
  }

  function _emit(name, data) {
    self.emit(name, data);
  }

  function _run() {
    var foo;


    setTimeout(function() {
      foo = queue.splice(0, options.count);
      _.each(foo, function(el) {

        el.source.on('error', function(err) {
          _emit('error', err);
          this.destroy();
          this.removeAllListeners();
        });

        el.source.on('close', function() {
          _emit('close');
          this.destroy();
          this.removeAllListeners();
        });

        el.source.pipe(el.destination);
      });
    }, options.poll);
  }

  return {
    push: push
  };
};

//we want to setup events so we can propogate them
util.inherits(StreamBouncer, EventEmitter);

module.exports = StreamBouncer;
