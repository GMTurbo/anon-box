
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

io.sockets.on('connection', function(socket){

  //outgoing
  socket.emit('requestKey', {});

  // socket.on('fileDataRead', function(data){
  //   console.log('fileDataRead event');
  //   //data should have a unique id and 3 states [begin, sending, end]
  //   uid2sock[data.key].forEach(function(sock){
  //     if(sock.id !== socket.id)
  //       sock.emit("fileDataRead", data);
  //   });

  // });

  socket.on('beginSend', function(data){

    uid2sock[data.key].forEach(function(sock){
      if(sock.id !== socket.id)
        sock.emit('beginSend', data);
    });

    socket.on(data.dataId, function(data){
      uid2sock[data.key].forEach(function(sock){
        if(sock.id !== socket.id)
          sock.emit(data.dataId, data);
      });
    });

  });

  socket.on('endSend', function(data){

    uid2sock[data.key].forEach(function(sock){
      if(sock.id !== socket.id)
        sock.emit('endSend', data);
    });

    socket.removeAllListeners(data.dataId);

  });

  socket.on('fileDataWrite', function(data){
    //console.log('fileDataWrite event');
    //data should have a unique id and 3 states [begin, sending, end]
    uid2sock[data.key].forEach(function(sock){
      if(sock.id !== socket.id)
        sock.emit("fileDataRead", data);
    });
  });

  //should return a relative filename wrt to the
  //synced file structure
  //ex: /beep/boop.png
  socket.on('fileSynced', function(data){

  });

  //incoming
  socket.on('newKey', function(data){
    //console.log('newKey event');
    if( uid2sock[data.key] !== undefined)
      uid2sock[data.key].push(socket);
    else{
      uid2sock[data.key] = [];
      uid2sock[data.key].push(socket);
    }

    socket.emit('ready', {});

  })

  //incoming
  socket.on('getUserCount', function(){

  });

  //incoming
  socket.on('disconnect', function(){

  });

});

console.log('server listening at ' + pjson.server + ":" + pjson.port)
