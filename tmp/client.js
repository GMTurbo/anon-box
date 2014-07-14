var socketio = require('socket.io-client'),
    args = require('minimist')(process.argv.slice(2));

var pjson = require('./package.json'),
    color = require('ansi-color').set;

var fs = require('fs'),
    through = require('through'),
    path = require('path');

var Mirror = require('./mirror');

if(!(args.dir || args.d)){
  console.log('you need to provide a monitor directoy --dir "{dir}"')
}

var port = args.port || pjson.port;
var server = args.server || pjson.server;
var fullServer = server + ':' + port;

console.log(color('connecting to ' + fullServer, 'blue_bg'))

var socket = socketio.connect(fullServer);

socket.on('connect', function(data) {
    console.log(color('successfully connected :)', 'cyan_bg'));
});

socket.on('ready', function(){
  var mirror = new Mirror(args.key);
  mirror.createReadStream(args.dir, socket);
  mirror.createWriteStream(args.dir, socket);
})

socket.on('requestKey', function(data){
  socket.emit('newKey', {key: args.key});
});

socket.on('disconnect', function(data){
   console.log(color('disconnected :(','red_bg'));
});

socket.on('error', function(data){
  console.dir(data);
});
