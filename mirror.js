/*
  switch to this watcher library
  - https://github.com/bevry/watchr -

  -- MULTIPLE FILE TRANSFER IS CROSSING STREAMS --
  --- closure isn't being setup correctly.
  ---- good news is it seems that the stream events are firing in the
  ---- correct order
*/


var fs = require('fs'),
    watcher = require('node-watch'),
    path = require('path'),
    args = require('minimist')(process.argv.slice(2)),
    through = require('through'),
    mkdirp = require('mkdirp'),
    randomstring = require("randomstring"),
    color = require('ansi-color').set,
    speedometer = require('speedometer'),
    utils = require('./utils.js');



var Mirror = function(key) {

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
    this.syncFolders = function(slave, master) {

        //
        if (!slave && !master) {
            console.log('need some args :/');
            return;
        }

        var onData = function(buffer) {

            var bytesPerSecond = speed(buffer.length);
            var colored = color(utils.bytes(bytesPerSecond) + '/s', 'green');
            utils.console_out(colored);
            this.queue(buffer);
        };
        // Listen for events emitted by streamspeed on the given stream.
        // ss.on('speed', function(speed, avgSpeed) {
        //   utils.console_out('Reading at', speed, 'bytes per second');
        // });

        watcher(master, function(filename) {

            var shortname = path.basename(filename);

            var isFile;
            try {
                stat = fs.statSync(filename);
                isFile = stat.isFile()
            } catch (e) {
                return;
            }

            if (isFile) {

                var savePath = slave + '/' + utils.pathDif(filename, master);

                mkdirp.sync(path.dirname(savePath));

                // ss.add(rs);
                var readstream = fs.createReadStream(filename);

                readstream.on('close', function() {
                    console.log('file synced');
                    readstream.destroy();
                });

                var tr = through(onData, function() {});

                readstream.pipe(tr).pipe(fs.createWriteStream(savePath));

                console.log('copying ' + shortname + ' to ' + savePath);

            }

        });
    };

    //setup watcher on folder and write new file data to socket
    this.createWriteStream = function(monitorDir, socket) {

        var sessionkey = this.key;

        var createZone = function(fileInfo){

          //thr is through object that we will pipe the readstream to
          var buff = 0;

          //generate a random string for the data connection event
          var randomStr = randomstring.generate();

          var onFile = function(setupInfo, fileKey) {

              var info = setupInfo;
              var beginning = true;

              return function(data) {

                  if (beginning) {

                      info.state = 'begin';
                      beginning = false;
                      socket.emit('beginSend', {
                          dataId: fileKey,
                          key: info.key,
                          buffer: data,
                          state: info.state,
                          filename: info.filename,
                          totalSize: info.totalSize
                      });

                  } else {

                      if (data) info.state = 'sending';
                      else info.state = 'end';

                  }

                  buff += data.length || 0;

                  if (data.buffer) {
                      var bytesPerSecond = speed(data.buffer.length);
                      utils.console_out(bytes(bytesPerSecond) + '/s', true);
                  }

                  socket.emit(fileKey, {
                      dataId: fileKey,
                      key: info.key,
                      buffer: data,
                      state: info.state,
                      filename: info.filename,
                      totalSize: info.totalSize
                  });

                  // console.log('sending ' +
                  //     info.filename +
                  //     " " +
                  //     ((buff / info.totalSize).toPrecision(3) * 100) +
                  //     "%");
              };
          }.bind(this);

          var onEnd = function(fileInfo, fileKey) {

              var info = fileInfo;

              return function() {

                  socket.emit(fileKey, {
                      dataId: fileKey,
                      key: info.key,
                      buffer: null,
                      state: 'end',
                      filename: info.filename,
                      totalSize: info.totalSize
                  });

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
              //     socket.emit('fileSynced', {filename: data.filename});
          }.bind(this);

          return through(onFile(fileInfo, randomStr), onEnd(fileInfo, randomStr));
        }


        //watch our filesystem
        watcher(monitorDir, function(filename) {

            var shortname = path.basename(filename);

            if (!fs.existsSync(filename)) return;

            if (fs.lstatSync(filename).isFile()) {

                //if (shortname !== path.basename(self.currentlySyncing)) {
                var fileInfo = {
                    state: 'begin',
                    filename: utils.pathDif(args.dir, filename),
                    totalSize: fs.statSync(filename)["size"],
                    key: sessionkey
                };

                var tr = createZone.call(this, fileInfo);

                var readstream = fs.createReadStream(filename);

                readstream.on('error', function(err){
                  console.log('error sending file: %s', err);
                  readstream.destroy();
                  readstream.removeAllListeners();
                });

                readstream.on('close', function(data){
                  console.log('destroying readstream');
                  readstream.destroy();
                  readstream.removeAllListeners();
                });

                readstream.pipe(tr);

                utils.printPretty('syncing ' + filename, 'magenta', true);
                //}
            }

        });
    }

    var streamsRunning = 0;
    //reading from socket
    this.createReadStream = function(monitorDir, socket) {

        var getStream = function(data, dirname) {

            var partialPath = data.filename;
            var savePath = path.join(dirname, partialPath);

            if (!fs.existsSync(savePath)) {

                mkdirp.sync(path.dirname(savePath));

            }

            var readStream = fs.createWriteStream(savePath, {});

            utils.printPretty('syncing ' + data.filename, 'green', false);
            utils.printPretty('saving to ' + color(savePath, 'green_bg'), 'white', false);

            return readStream;
        };

        var onData = function(fileInfo, dir) {

            var readStream = null;
            var once = true;
            var buff = 0;
            ++streamsRunning;

            return function(data) {
                if (once) {
                    utils.printPretty('receiving data', 'green', true);
                    once = false;
                }

                switch (data.state) {

                    case 'begin':

                        readStream = getStream(data, dir);

                        readStream.on('error', function(err) {
                            utils.console_out(err);
                            readStream.destroy();
                        });

                        readStream.on('close', function() {
                            --streamsRunning;
                            utils.console_out(streamsRunning + ' streams running');
                            readStream.destroy();
                            readStream.removeAllListeners();
                            socket.removeAllListeners(data.dataId);

                        });

                        if (data.buffer) {
                            readStream.write(data.buffer);
                            // readStream.write(data.buffer);
                        }
                        break;

                    case 'sending':
                        {
                            readStream.write(data.buffer);
                            // if (readStream)
                            //     readStream.write(data.buffer);
                            // else
                            //     console.log("we have a problem with mirror.js -> createReadStream onData")

                            if (data.buffer) {
                                buff += data.buffer.length;
                                var per = buff / fileInfo.totalSize;

                                var bytesPerSecond = speed(data.buffer.length);

                                var colored = color(utils.bytes(bytesPerSecond) + '/s ' + utils.bytes(buff) + '/' + utils.bytes(fileInfo.totalSize) + ' received', 'green');

                                utils.console_out(colored, true);

                            }

                            if (!data.buffer) {
                                // str.close();
                                buff = 0;
                                readStream.close();
                                utils.printPretty('file received sending', 'green_bg', false);
                            }
                            break;

                        }
                    case 'end':
                        //str.close();
                        readStream.close();
                        utils.printPretty(data.filename + ' synced', 'green_bg');

                        break;
                }
            };

        };

        socket.on('beginSend', function(data) {
            socket.on(data.dataId, new onData(data, args.dir));
        });

        // socket.on('endSend', function(data) {
        //     socket.removeAllListeners(data.dataId);
        // });
    };
};

module.exports = Mirror;
