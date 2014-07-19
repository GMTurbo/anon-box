/*
  switch to this watcher library
  - https://github.com/bevry/watchr -

  -- MULTIPLE FILE TRANSFER IS CROSSING STREAMS --
  --- closure isn't being setup correctly.
  ---- good news is it seems that the stream events are firing in the
  ---- correct order
*/


var fs = require('fs'), //filesystem
    watcher = require('node-watch'), //filesystem watcher
    path = require('path'), //directory path helper
    args = require('minimist')(process.argv.slice(2)), //input argument handler
    through = require('through'), //stream module that allows us to do this
    mkdirp = require('mkdirp'), //a directory creator module
    randomstring = require("randomstring"), //a random string generator
    color = require('ansi-color').set, //allows us to send colored text to the terminal
    speedometer = require('speedometer'), //measures stream transfer speeds
    utils = require('./utils.js'); //our custom utilities module


/*
  in order to synchronize the master and slave we need to know a few things
    1. file creation
    2. file deletion
    3. file rename
    4. file move

  the problem is renaming and moving fire unlink/delete then create events, making it our
  job to determine if a file has been renamed or removed.

  we can generate file hashes incrementally during a file stream to improve performance.
  http://blog.tompawlak.org/calculate-checksum-hash-nodejs-javascript

  To determine this, I propose we create an object that maps partial file paths (ex: '/slave/dir1/img.png')
  to file hashes.  File hashes are independent of the file name so we should be able to handle moving of file

  Renaming can be determined by listening for a removal event, followed immediately by a creation event.
  So we can h
*/

var Mirror = function(key) {

    //var writer = utils.console_out_multi();

    // Let's measure how fast we can read from the sockets
    var speed = speedometer();

    //the mirror syncs data with other mirrors that have the same key
    //it's the handshaking mechanism
    this.key = key;

    //this is a js hack that is usually cause by a bad design
    //TODO clean up to avoid using this
    var self = this;

    //local file syncing feature
    //map a dropbox folder to an external drive? functionality like that
    this.syncLocalFolders = function(slave, master) {

        //we want to check to ensure proper args inside this function
        //just to make the function safe
        if (!slave && !master) {
            console.log('need some args :/');
            return;
        }

        //this function is required for the through module
        //through module requires an onData callback and an optional onEnd callback
        //you can name the callback functions whatever you want
        var onData = function(buffer) {

            //calculate transfer rate and then queue data
            var bytesPerSecond = speed(buffer.length);
            var colored = color(utils.bytes(bytesPerSecond) + '/s', 'green');
            utils.console_out(colored);

            //this is a through convention.  We have to queue
            //the data into this functions this to pass it through
            //the pipe
            this.queue(buffer);
        };

        //the watcher module listens for filesystem changes
        //and fires the callback when something occurs
        //This module is going to be changed as some point soon
        watcher(master, function(filename) {

            var shortname = path.basename(filename); //c:/windows/pg.exe -> pg.exe

            var isFile;

            try {
                stat = fs.statSync(filename);
                isFile = stat.isFile(); //this function throws exception on failure
            } catch (e) {
                return;
            }

            if (isFile) {

                //generate the save path wrt our slave directory
                var savePath = slave + '/' + utils.pathDif(filename, master);

                //another module
                //this will create directories as needed to save a file
                // home/gabe/repos/node/hi.jpg generate directory structure!
                mkdirp.sync(path.dirname(savePath));

                //create a stream to read the file
                var readstream = fs.createReadStream(filename);

                //attach to ensure proper disposal
                readstream.on('close', function() {
                    console.log('file synced');
                    readstream.destroy();
                });

                //create an new through instance
                //new instance required for new streams
                //this contains an empty onEnd callback
                var tr = through(onData, function() {});

                //savefile pipes to through with pipes to the new savepath
                readstream.pipe(tr).pipe(fs.createWriteStream(savePath));

                console.log('copying ' + shortname + ' to ' + savePath);

            }

        });
    };

    //setup watcher on folder and write new file data to socket
    //this is called once in a program run
    //WRITES data to socket
    this.createWriteStream = function(monitorDir, socket) {

        //unique key needed for linking with other users
        //user defined currently
        //this var is global to the other functions within createWriteStream
        //because we need two functions to read it
        var sessionkey = this.key;


        //create a closure to encapsolate everything a stream needs
        //to packetize and send its data to the socket
        var createZone = function(fileInfo) {

            //we need to calculate the total amount of data
            //that we streamed, so we need a counter
            var buff = 0;

            //generate a random string for the data connection event
            //this is another module we imported at the top of the file
            var randomStr = randomstring.generate();

            //this is another closure that encapsulates the
            //packetizing and sending of data
            //setupInfo is created when the monitor module
            //  detects file system changes in the monitored directory
            //filekey a randomly generated string that is used
            //  to create a private socket channel between clients
            var onFile = function(fileInfo, fileKey) {

                //this isn't required but done just for the name change
                var info = fileInfo;

                //this is used to catch the first packet
                //received from the fileReadstream
                var beginning = true;

                //using closure, we have just given ourselves
                //internal global variables!
                //the below function will be able to modify
                //the above variables and those changes will persist
                //to all the other calls of the below function!
                //the returned function is going to get called whenever data
                //send across the stream, so it's gonna fire often.
                return function(data) {


                    if (beginning) {


                        beginning = false;

                        //if we're here, we need to send the fileKey to the other clients
                        //socket events are ordered (supposed to be), so we can get away with this
                        socket.emit('beginSend', {
                            dataId: fileKey,
                            key: info.key,
                            buffer: data,
                            state: 'begin',
                            filename: info.filename,
                            totalSize: info.totalSize
                        });

                    } else {

                        //if data is not null, we are still transfering data
                        if (data) {
                            info.state = 'sending';
                        } else { //if data is null, the stream has finished
                            info.state = 'end';
                        }

                    }

                    //if we are still transfering, calculate the speed
                    if (data.buffer) {
                        buff += data.length
                        var bytesPerSecond = speed(data.buffer.length);
                        utils.console_out(bytes(bytesPerSecond) + '/s', true);
                    }


                    //send the packet to the clients
                    //using the private filekey channel!
                    //we could probably make the filekey a file hash
                    //INTO THE INTERNETS!!
                    socket.emit(fileKey, {
                        dataId: fileKey,
                        key: info.key,
                        buffer: data,
                        state: info.state,
                        filename: info.filename,
                        totalSize: info.totalSize
                    });
                };

                //we have to bind the internal function *this* to
                //the *this* that is 1 level outside it
                //binding allows us to do this... wait... what?
            }.bind(this);


            //the onEnd callback for through
            var onEnd = function(fileInfo, fileKey) {

                var info = fileInfo;

                //same deal, give us access to info
                //in the function below
                return function() {

                    //send an end event on our unique channel
                    socket.emit(fileKey, {
                        dataId: fileKey,
                        key: info.key,
                        buffer: null,
                        state: 'end',
                        filename: info.filename,
                        totalSize: info.totalSize
                    });

                    //send an end event on the public channel
                    socket.emit('endSend', {
                        dataId: fileKey,
                        key: info.key,
                        buffer: null,
                        state: 'end',
                        filename: info.filename,
                        totalSize: info.totalSize
                    });

                    utils.printPretty(path.basename(info.filename) + ' sent', 'magenta', true);
                    buff = 0;
                };

            }.bind(this);

            //return an instance of through with our closures
            return through(onFile(fileInfo, randomStr), onEnd(fileInfo, randomStr));
        }


        //watch our filesystem
        watcher(monitorDir, function(filename) {

            var shortname = path.basename(filename);

            //if the filename doesn't exist, it means it's being deleted
            //this module lacks special events that we can listen to
            //for different file system actions (new, delete, rename, etc.)
            if (!fs.existsSync(filename)) return;


            var isFile;

            try {
                stat = fs.statSync(filename);
                isFile = stat.isFile(); //this function through exception on failure
            } catch (e) {
                return;
            }

            if (isFile) {

                // the below function was my naive attempt to handle
                // duplex mode.  It turns out i have to give it some more though
                //      |
                //      |
                //      v
                //if (shortname !== path.basename(self.currentlySyncing)) {

                //create an object that stores important file data
                var fileInfo = {
                    state: 'begin',
                    filename: utils.pathDif(args.dir, filename),
                    totalSize: fs.statSync(filename)["size"],
                    key: sessionkey
                };

                //create a new through instance
                //we are calling the function with our *this* and an arg
                //this is similiar to .bind(this)
                //but works if you want to bind on the function call
                var tr = createZone.call(this, fileInfo);

                //create a readstream of the modified file
                var readstream = fs.createReadStream(filename);

                //attach some error handlers
                //without them, streams will throw exceptions
                readstream.on('error', function(err) {
                    console.log('error sending file: %s', err);
                    readstream.destroy();
                    readstream.removeAllListeners();
                });

                //listen for stream finished event
                readstream.on('close', function(data) {
                    console.log('destroying readstream');
                    readstream.destroy();
                    readstream.removeAllListeners();
                });

                //begin reading the file contents and pipe the
                //data to the through instance
                readstream.pipe(tr);

                utils.printPretty('syncing ' + filename, 'magenta', true);
                //}
            }

        });
    }

    //READS data from socket
    //this function has all code related to in
    //contained within it
    //createReadStream is only called once within the program
    this.createReadStream = function(monitorDir, socket) {

        //global stream counter to everything within this closure
        var streamsRunning = 0;

        //create an empty file to pipe the socket data into
        var getStream = function(data, dirname) {

            //data.filename will look like something like /cat.png or /cats/cat.png
            var partialPath = data.filename;

            //join partial path to our synced directory
            var savePath = path.join(dirname, partialPath);

            //if the savePath doesn't exist
            if (!fs.existsSync(savePath)) {

                //create it and all directories required
                mkdirp.sync(path.dirname(savePath));

            }

            //create an empty file and get its write stream
            var readStream = fs.createWriteStream(savePath, {});

            //do some awesome logging!
            utils.printPretty('syncing ' + data.filename, 'green', false);
            utils.printPretty('saving to ' + color(savePath, 'green_bg'), 'white', false);

            //return the file write stream
            //called readStream because its reading from socket
            return readStream;
        };

        //through module onData callback wrapper
        var onSocketData = function(fileInfo, dir) {

            //the function returned is going to be called a lot, so we want
            //to have some variables we can use while its executing
            var readStream = null;


            var begin = true;
            var buff = 0;
            ++streamsRunning; //we are prepping a stream so incrememt

            //if data != null, we're sending data
            //the data within the function below will be coming from a socket
            return function(data) {

                if (begin) {
                    utils.printPretty('receiving data', 'green', true);
                    begin = false;
                }

                //check the data state
                //js switch statement are not constant time lookup
                //so, i dunno
                switch (data.state) {


                    case 'begin':

                        //get a fileWriteStream pointing to our empty file
                        readStream = getStream(data, dir);

                        //attach error event just in case
                        readStream.on('error', function(err) {
                            utils.console_out(err);
                            readStream.destroy();
                        });

                        //listen for stream finished event
                        readStream.on('close', function() {
                            --streamsRunning; //stream is done
                            utils.console_out(streamsRunning + ' streams running');
                            readStream.destroy();
                            readStream.removeAllListeners();

                            //disconnect from our private socket channel
                            socket.removeAllListeners(data.dataId);


                        });

                        //if data comes with the first packet,
                        //then write it to our empty file
                        if (data.buffer) {
                            readStream.write(data.buffer);
                        }

                        break;

                    case 'sending':
                        {
                            //client is still sending data so write it
                            //if the data is null, the stream will close
                            //so we don't have to check it
                            readStream.write(data.buffer);

                            if (data.buffer) {

                                //if we're still sending data, calculate speed and display
                                buff += data.buffer.length;
                                var per = buff / fileInfo.totalSize;

                                var bytesPerSecond = speed(data.buffer.length);

                                var colored = color(utils.bytes(bytesPerSecond) + '/s ' + utils.bytes(buff) + '/' + utils.bytes(fileInfo.totalSize) + ' received', 'green');

                                //writer.write(colored, data.dataId);
                                utils.console_out(colored, true);

                            } else {
                                //buffer is null so close it down
                                buff = 0;
                                readStream.close();
                                utils.printPretty('file received sending', 'green_bg', false);
                            }
                            break;

                        }
                    case 'end':

                        readStream.close();
                        //writer.remove(data.dataId);
                        utils.printPretty(data.filename + ' synced', 'green_bg');

                        break;
                }
            };

        };

        //listen for the beginSend event from the client
        socket.on('beginSend', function(data) {
            //client with our key wants to send us a file
            //on the data.dataId channel
            //data.dataId is just a random string that we can
            //assign the socket to listen for events on
            //when we receive an event,
            //fire the event RETURNED BY onSocketData
            socket.on(data.dataId, onSocketData(data, args.dir));
        });

        //not sure if i need this or not
        // socket.on('endSend', function(data) {
        //     socket.removeAllListeners(data.dataId);
        // });
    };
};

//export our function so we can import it elsewhere
module.exports = Mirror;
