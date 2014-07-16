/*

 ********TODO***********
 - ensure files are sent completely and events fire in the correct order
 + preserve directory structure
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

//the magic module
var Mirror = require('./mirror');

if (args.h) {
    console.log('\n\ninput commands/n' +
        '--key {key} --> REQUIRED! random key to share\n' +
        '--master {directory} --> the master directory that is being watched\n' +
        '--slave {directory} --> the slave directory to be fill\n' +
        '--local --> run in local mode [REQUIRES -m {dir} for master and -s {dir} for slave flags]\n\n' +
        'NETWORK MODE\n' +
        'node client.js --dir ~/Downloads/sync --key gabe --master //broadcast a folder\n' +
        'node client.js --dir ~/Downloads/sync --key gabe --slave //fill a folder\n\n' +
        'LOCAL MODE\n' +
        'node client.js --local -m ~/Downloads/master -s ~/Downloads/slave --key gabe //broadcast a folder\n');
    return;
}

var localMode = function() {

    console.log('\nsyncing ' + color(args.s, 'green') + ' to ' + color(args.m, 'blue'));
    var mirror = new Mirror();

    mirror.syncFolders(args.s, args.m);

};


var networkMode = function() {
    var port = args.port || pjson.port;
    var server = args.server || pjson.server;
    var fullServer = server + ':' + port;

    console.log(color('connecting to ' + fullServer, 'blue_bg'))

    var socket = socketio.connect(fullServer);

    socket.on('connect', function(data) {
        console.log(color('successfully connected :)', 'cyan_bg'));
    });

    socket.on('ready', function() {
        var mirror = new Mirror(args.key);
        if (args.slave || args.duplex)
            mirror.createReadStream(args.dir, socket);
        if (args.master || args.duplex)
            mirror.createWriteStream(args.dir, socket);
    })

    socket.on('requestKey', function(data) {
        socket.emit('newKey', {
            key: args.key
        });
    });

    socket.on('disconnect', function(data) {
        console.log(color('disconnected :(', 'red_bg'));
    });

    socket.on('error', function(data) {
        console.dir(data);
    });
};


var runMode = (function(inputArgs) {

    if (!inputArgs.key)
        return -1;

    if (inputArgs.local && inputArgs.m && inputArgs.s) {
        return 0;
    } else if (inputArgs.dir && (inputArgs.master || inputArgs.slave)) {
        return 1;
    }

    return -1;

})(args);

switch (runMode) {

    case 0:
        localMode.call(this);
        break;

    case 1:
        networkMode.call(this);
        break;

    default:
        console.log('wrong input arguments :( -h for help');
        return;

}
