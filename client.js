
/*

 ********TODO***********
 - ensure files are sent completely and events fire in the correct order
 - preserve directory structure
 - figure out how to duplex the data
 - hashing?
 - get directory structure
 - encryption?
 - compression?

*/


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

if(!args.key){ console.log('--key arg required :/'); return;}

console.log(color('connecting to ' + fullServer, 'blue_bg'))

var socket = socketio.connect(fullServer);

socket.on('connect', function(data) {
    console.log(color('successfully connected :)', 'cyan_bg'));
});

socket.on('ready', function(){
  var mirror = new Mirror(args.key);
  if(args.slave || args.duplex)
    mirror.createReadStream(args.dir, socket);
  if(args.master || args.duplex)
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
