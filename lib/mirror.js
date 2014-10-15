/*
switch to this watcher library
- https://github.com/bevry/watchr -

-- MULTIPLE FILE TRANSFER IS CROSSING STREAMS --
--- closure isn't being setup correctly.
---- good news is it seems that the stream events are firing in the
---- correct order

-- copying large file into sync dir causes multiple watcher events
--- which causes us to sync the same file multiple times.
*/

//profile

var fs = require('fs'), //filesystem
  watcher = require('node-watch'), //filesystem watcher
  path = require('path'), //directory path helper
  through = require('through'), //stream module that allows us to do this
  mkdirp = require('mkdirp'), //a directory creator module
  randomstring = require("randomstring"), //a random string generator
  color = require('ansi-color').set, //allows us to send colored text to the terminal
  speedometer = require('speedometer'), //measures stream transfer speeds
  utils = require('./utils.js'), //our custom utilities module
  crypto = require('crypto'),
  StreamBouncer = require('stream-bouncer'),
  Differ = require('../../fs-dif/lib/fs-dif');

var Mirror = function(key) {

  //var writer = utils.console_out_multi();

  // Let's measure how fast we can read from the sockets
  var speed = speedometer();

  //the mirror syncs data with other mirrors that have the same key
  //it's the handshaking mechanism
  this.key = key;

  //local file syncing feature
  //map a dropbox folder to an external drive? functionality like that
  this.syncLocalFolders = function(slave, master) {

    var fsDif = new Differ({
      dirToWatch: master,
      debugOutput: false,
      directoryFilter: ['!*modules'],
      ignoreDotFiles: true
    });

    var fileCreated = function(filename, master, slave) {

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
        if (fs.existsSync(savePath)) {
          console.log('fileCreated: slave already contains file...');
          return;
        }
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
        var tr = through(onData);

        //savefile pipes to through with pipes to the new savepath
        readstream.pipe(tr).pipe(fs.createWriteStream(savePath));

        //console.log('copying ' + shortname + ' to ' + savePath);

      }
    };

    var fileChanged = function(filename, master, slave) {

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
          //console.log('file synced');
          readstream.destroy();
        });

        //create an new through instance
        //new instance required for new streams
        //this contains an empty onEnd callback
        var tr = through(onData);

        //savefile pipes to through with pipes to the new savepath
        readstream.pipe(tr).pipe(fs.createWriteStream(savePath));

        console.log('fileChanged: copying ' + shortname + ' to ' + savePath);

      }
    };

    var fileRemoved = function(filename, master, slave) {
      var slaveFileName = slave + '/' + utils.pathDif(filename, master);

      if (fs.existsSync(slaveFileName)) {

        fs.unlink(slaveFileName, function(err, result) {
          if (err)
            console.error(err);
          else {
            console.log('fileRemoved: removed ' + slaveFileName);
          }
        });
      }
    };

    var fileRenamed = function(oldName, newName, master, slave) {

      var savePathOld = slave + '/' + utils.pathDif(oldName, master);

      if (fs.existsSync(savePathOld)) {

        //generate the save path wrt our slave directory
        var savePathNew = slave + '/' + utils.pathDif(newName, master);

        mkdirp.sync(path.dirname(savePathNew));

        fs.rename(savePathOld, savePathNew, function(err) {
          if (err)
            console.error(err);
          else {
            console.log('fileRenamed: ' + path.basename(savePathOld) + ' renamed to ' + path.basename(savePathNew));
          }
        });
      } else {
        //if the old file didn't exist on the slave machine, then send the file
        fileCreated(newName, master, slave);
      }
    };

    var fileMoved = function(oldDirName, newName, master, slave) {

      var savePathOld = slave + '/' + utils.pathDif(oldDirName, master);

      if (fs.existsSync(savePathOld)) {

        //generate the save path wrt our slave directory
        var savePathNew = slave + '/' + utils.pathDif(newName, master);

        mkdirp.sync(path.dirname(savePathNew));

        fs.rename(savePathOld, savePathNew, function(err) {
          if (err)
            console.error(err);
          else {
            console.log('fileMoved: ' + path.basename(savePathOld) + ' moved to ' + path.basename(savePathNew));
          }
        });
      } else {
        //if the old file didn't exist on the slave machine, then send the file
        fileCreated(newName, master, slave);
      }
    };
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

    fsDif.on('ready', function() {

      console.log('fsDif ready to rock');

      fsDif.beginWatch();

      fsDif.on('exists', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('exists: ', data.fileName);
        fileCreated(data.fileName, master, slave);
      });

      fsDif.on('created', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('created', data);
        fileCreated(data.fileName, master, slave);
      });

      fsDif.on('changed', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('changed: ', data.fileName);
        fileChanged(data.fileName, master, slave);
      });

      fsDif.on('renamed', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('renamed: ', data.fileName);
        fileRenamed(data.old, data.fileName, master, slave);
      });

      fsDif.on('moved', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('moved: ', data.fileName);
        fileMoved(data.old, data.fileName, master, slave);
      });

      fsDif.on('removed', function(err, data) {
        if (err) {
          console.error(err);
          return;
        }
        console.log('removed: ', data.fileName);
        fileRemoved(data.fileName, master, slave);
      });

    });
  };

  //setup watcher on folder and write new file data to socket
  //this is called once in a program run
  //WRITES data to socket
  this.createWriteStream = function(monitorDir, socket) {

    bouncer = new StreamBouncer({
      streamsPerTick: 2,
      poll: 1000,
      throttle: true,
      speed: 2 * 1024 * 1024
    });

    //attach some error handlers
    //without them, streams will throw exceptions
    bouncer.on('error', function(err) {
      console.log('error sending file: %s', err);
    });

    //listen for stream finished event
    bouncer.on('close', function(str) {
      utils.printPretty(path.basename(str.path) + ' sent', 'magenta', true);
    });

    bouncer.on('start', function(str) {
      utils.printPretty('syncing ' + path.basename(str.path), 'magenta', true);
    });

    //unique key needed for linking with other users
    //user defined currently
    //this var is global to the other functions within createWriteStream
    //because we need two functions to read it
    var sessionkey = this.key;
    var checksum;

    //create a closure to encapsolate everything a stream needs
    //to packetize and send its data to the socket
    var createZone = function(fileInfo) {

      //we need to calculate the total amount of data
      //that we streamed, so we need a counter
      var buff = 0;

      //checksum generator
      //works with streams
      var hash = crypto.createHash('md5');

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
        // function scoped global variables accessible by all nested functions inside!
        //the below function will be able to modify
        //the above variables and those changes will persist
        //to all the other calls of the below function!
        //the returned function is going to get called whenever data
        //send across the stream, so it's gonna fire often.
        return function(data) {

          //process.nextTick(function(){
          var state = 'send';
          if (beginning) {

            state = 'begin';
            beginning = false;
            //console.log('\n\n\nWriteSocket begin\n\n\n');

            //if we're here, we need to send the fileKey to the other clients
            //socket events are ordered (supposed to be), so we can get away with this
            socket.emit('beginSend', {
              dataId: fileKey,
              key: info.key,
              buffer: data,
              state: state,
              filename: info.filename,
              totalSize: info.totalSize
            });
          }

          hash.update(data);
          buff += data.length;
          var bytesPerSecond = speed(data.length);
          //  utils.console_out(utils.bytes(bytesPerSecond) + '/s', false);
          var colored = color(utils.bytes(bytesPerSecond) + '/s ' + utils.bytes(buff) + '/' + utils.bytes(info.totalSize) + ' received', 'blue');
          utils.console_out(colored);
          //console.log('\n\n\nWriteSocket send\n\n\n');
          //send the packet to the clients
          //using the private filekey channel!
          //we could probably make the filekey a file hash
          //INTO THE INTERNETS!!
          socket.emit(fileKey, {
            dataId: fileKey,
            key: info.key,
            buffer: data,
            state: state,
            filename: info.filename,
            totalSize: info.totalSize
          });
          //});
        };
      };


      //the onEnd callback for through
      var onEnd = function(fileInfo, fileKey) {

        var info = fileInfo;

        //same deal, give us access to info
        //in the function below
        return function() {

          //process.nextTick(function(){
          //  console.log('\n\nWriteSocket end\n\n');
          var checksum = hash.digest('hex');
          console.log('%s checksum = %s', info.filename, checksum);
          //send an end event on our unique channel
          socket.emit(fileKey, {
            dataId: fileKey,
            key: info.key,
            buffer: null,
            state: 'end',
            checksum: checksum,
            filename: info.filename,
            totalSize: info.totalSize
          });

          //  utils.printPretty(path.basename(info.filename) + ' sent', 'magenta', true);
          buff = 0;
          //  })

        };

      };

      //return an instance of through with our closures
      return through(onFile(fileInfo, randomStr), onEnd(fileInfo, randomStr));
    };


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
          filename: utils.pathDif(monitorDir, filename),
          totalSize: fs.statSync(filename).size,
          key: sessionkey
        };

        //create a new through instance
        //we are calling the function with our *this* and an arg
        //this is similiar to .bind(this)
        //but works if you want to bind on the function call
        var tr = createZone.call(this, fileInfo);

        //create a readstream of the modified file
        var readstream = fs.createReadStream(filename);

        //push our streams into the bouncer to handle
        //stream coordination and throttling
        bouncer.push({
          source: readstream,
          destination: tr
        });

        //begin reading the file contents and pipe the
        //data to the through instance
        //readstream.pipe(tg.throttle()).pipe(tr);

        //utils.printPretty('syncing ' + filename, 'magenta', true);
        //}
      }

    });
  };

  //READS data from socket
  //this function has all code related to in
  //contained within it
  //createReadStream is only called once within the program
  this.createReadStream = function(monitorDir, socket) {

    //global stream counter to everything within this closure
    var streamsRunning = 0;

    //create an empty file to pipe the socket data into
    var getStream = function(data, dirname, hash) {

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

      //attach error event just in case
      readStream.on('error', function(err) {
        utils.console_out(err);
        readStream.destroy();
      });

      //listen for stream finished event
      readStream.on('close', function() {
        --streamsRunning; //stream is done
        //utils.console_out(streamsRunning + ' streams running');
        readStream.destroy();
        readStream.removeAllListeners();

        //disconnect from our private socket channel
        socket.removeAllListeners(data.dataId);
      });
      //do some awesome logging!
      utils.printPretty('syncing ' + data.filename, 'green', false);
      utils.printPretty('saving to ' + color(savePath, 'green'), 'white', false);

      //return the file write stream
      //called readStream because its reading from socket
      return readStream;
    };

    //through module onData callback wrapper
    var onSocketData = function(fileInfo, dir) {

      //the function returned is going to be called a lot, so we want
      //to have some variables we can use while its executing
      var readStream = null;

      var hash = crypto.createHash('md5');

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
            readStream = getStream(data, dir, hash);
            //console.log('ReadSocket begin');
            readStream.write(data.buffer);
            hash.update(data.buffer);

            break;

          case 'send':
            {
              //client is still sending data so write it
              //if the data is null, the stream will close
              //so we don't have to check it
              //console.log('ReadSocket send');
              readStream.write(data.buffer);

              hash.update(data.buffer);
              buff += data.buffer.length;
              var per = buff / fileInfo.totalSize;

              var bytesPerSecond = speed(data.buffer.length);

              var colored = color(utils.bytes(bytesPerSecond) + '/s ' + utils.bytes(buff) + '/' + utils.bytes(fileInfo.totalSize) + ' received', 'green');

              //writer.write(colored, data.dataId);
              utils.console_out(colored, false);

              break;

            }
          case 'end':

            var checksum = hash.digest('hex');
            //console.log('ReadSocket end');
            readStream.close();
            if (data.checksum != checksum)
              utils.printPretty(data.filename + ' checksum check failed :(', 'red', false);
            else
              utils.printPretty(data.filename + ' synced', 'green', false);
            break;
        }
      };

    };

    //listen for the beginSend event from the client
    socket.on('beginSend', function(data) {
      //console.log('beginSend Event');
      //client with our key wants to send us a file
      //on the data.dataId channel
      //data.dataId is just a random string that we can
      //assign the socket to listen for events on
      //when we receive an event,
      //fire the event RETURNED BY onSocketData
      socket.on(data.dataId, onSocketData(data, monitorDir));
    });
  };
};

//export our function so we can import it elsewhere
module.exports = Mirror;
