// i want to have this
// var queue = new Stream-Bouncer({count: 5, poll: 250, ...})
// but i want to be able to call
// queue.push({source: fs.createReadStream('blah'), destination: fs.createWriteStream('blahout')});

//for ...
// queue.push({...})

var through = require('through'),
  EventEmitter = require('events').EventEmitter,
  _ = require('lodash');



//we want to setup events so we can propogate them
util.inherits(StreamBouncer, EventEmitter);

var StreamBouncer = function(options) {
  _.extend(options, {count: 5, poll: 250});

  options.poll = options.poll || 250;

  var queue = [];

  function push(streamContainer) {
    if(streamContainer.source && streamContainer.destination) {
      queue.push(streamContainer);
      _run();
    } else {
      _.bind(this.emit('error', {error: 'push needs a source and destination'}), this);
    }
  }

  function _run() {
    var foo;

    setTimeout(function() {
      foo = queue.splice(0, options.count);
      _.each(foo, function(el) {

        el.source.on('error', function(err) {
          this.emit('error', err);
          el.source.destroy();
          el.source.removeAllListeners();
        });

        el.source.on('close', function() {
          this.emit('close');
          el.source.destroy();
          el.source.removeAllListeners();
        });

        el.source.pipe(el.destination);
      });
    }, options.poll);
  }

  return {
    push: push
  };
};
