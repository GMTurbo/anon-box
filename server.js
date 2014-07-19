//server for ANON_DIR

//needs to have a object with the unique keys sent from the clients

//****************** OBJS *******************


var uid2sock = {
  //uniq ID : session
};

// var session = function(id){
//     this.id: id,
//     this.socks: {} // {socket1.id: socket1, socket2.id:socket2}
// };

//****************** SERVER HTTP && socks ****************

var pjson = require('./package.json')

var socketio = require('socket.io');
var io = socketio.listen(pjson.port);

io.sockets.on('connection', function(socket) {

  //outgoing
  socket.emit('requestKey', {});

  //.forEach isn't optimized in V8, so we'll go with the faster version.
  var forwardEvent = function(event, data) {

    uid2sock[data.key].forEach(function(sock) {
      if (sock.id != socket.id)
        sock.emit(event, data);
    })

  }

  socket.on('beginSend', function(data) {


    forwardEvent('beginSend', data);

    socket.on(data.dataId, function(data) {
      forwardEvent(data.dataId, data);
    });

  });

  socket.on('endSend', function(data) {

    forwardEvent('endSend', data);
    socket.removeAllListeners(data.dataId);

  });

  socket.on('fileDataWrite', function(data) {
    //console.log('fileDataWrite event');
    //data should have a unique id and 3 states [begin, sending, end]

    forwardEvent("fileDataRead", data);
  });

  //should return a relative filename wrt to the
  //synced file structure
  //ex: /beep/boop.png
  socket.on('fileSynced', function(data) {

  });

  //incoming
  socket.on('newKey', function(data) {
    //console.log('newKey event');
    if (uid2sock[data.key] !== undefined)
      uid2sock[data.key].push(socket);
    else {
      uid2sock[data.key] = [];
      uid2sock[data.key].push(socket);
    }

    socket.emit('ready', {});

  })

  //incoming
  socket.on('getUserCount', function() {

  });

  //incoming
  socket.on('disconnect', function() {

  });

});

console.log('server listening at ' + pjson.server + ":" + pjson.port)
