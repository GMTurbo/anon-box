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


// LIGHT WEIGHT CLIENT MODULE
// the client has to setup the socket connection before we can do our thing
// the user will select the runmode of the program here as well
var socketio = require('socket.io-client'), //socket module (magic)
    args = require('minimist')(process.argv.slice(2));

var pjson = require('./package.json'), //import the package.json file
    color = require('ansi-color').set;

var fs = require('fs'),
    through = require('through'),
    path = require('path');

//the magic module
var Mirror = require('./mirror');

//show some help info user gives invalid input or uses -h
var showHelp = function() {
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
}

// used -h on cli
if (args.h) {
    showHelp();
    return; //<-- exits the program
}

//IMPORTANT
//the reason we have to wrap our modes in functions is because we
//cannot use return except to exit the program
//by using functions, we can set the mode of our function
// and it will continue running and listening for input

//run program in local mode
var localMode = function() {

    console.log('\nsyncing ' + color(args.s, 'green') + ' to ' + color(args.m, 'blue'));

    var mirror = new Mirror();

    mirror.syncLocalFolders(args.s, args.m);

};


//run the program in network mode
var networkMode = function() {

    //pjson value found in package.json file, but we allow users to override
    var port = args.port || pjson.port;
    var server = args.server || pjson.server;

    //create socket connection string
    var fullServer = server + ':' + port;

    console.log(color('connecting to ' + fullServer, 'blue_bg'));

    //create a new socket that will connect to our server
    var socket = socketio.connect(fullServer);

    //socket has connected but needs to complete hanshake before
    socket.on('connect', function(data) {
        console.log(color('server found...', 'cyan_bg'));
    });

    //socket has complete handshake and ready to transmit
    socket.on('ready', function() {

        console.log(color('successfully connected :)', 'cyan_bg'));

        //create a new instance of our mirror.js module
        var mirror = new Mirror(args.key);

        //create stream handler depending on mode
        //duplex mode is not working yet
        if (args.slave /*|| args.duplex*/ )
            mirror.createReadStream(args.dir, socket);
        if (args.master /*|| args.duplex*/ )
            mirror.createWriteStream(args.dir, socket);
    })

    //listen for the request key event from server
    socket.on('requestKey', function(data) {

        //if server request key,
        //send it a response
        socket.emit('newKey', {
            key: args.key
        });
    });

    //handle socket disconnect
    socket.on('disconnect', function(data) {
        console.log(color('disconnected :(', 'red_bg'));
    });

    //handle socket error
    socket.on('error', function(data) {
        console.dir(data);
    });
};


//determins the run mode from user input
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
        showHelp();
        return;

}
