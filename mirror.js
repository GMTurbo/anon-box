var fs = require('fs'),
    watcher = require('node-watch'),
    path = require('path'),
    args = require('minimist')(process.argv.slice(2)),
    through = require('through'),
    mkdirp = require('mkdirp'),
    randomstring = require("randomstring"),
    color = require('ansi-color').set,
    speedometer = require('speedometer');


/*
  - stream closure issue (some files aren't finishing completely)
  - provide a max depth to the monitor so we don't recusively watch everything
  -
*/

var Mirror = function(key) {

    // Let's measure how fast we can read from /dev/urandom
    var speed = speedometer();

    var getBgColor = function() {

        var colors = ['red_bg', 'blue_bg', 'cyan_bg', 'magenta_bg', 'green_bg'];

        var roller = -1;

        return (function() {
            var color = colors[roller];
            if (++roller > colors.length - 1)
                roller = 0;
            return color;
        }());
    };

    var console_out = function(msg, overwrite) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        if (process.platform === 'win32') {
            //console.log('\033[2J');
        }
        //if(overwrite)
          process.stdout.write(msg);
       // else
         // console.log(msg);
        //rl.prompt(true);
    };
    var bytes = function(size) {
        if (!size) return '0 B';
        var i = Math.floor(Math.log(size) / Math.log(1024));
        return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
    };
    var printPretty = function(message, clr, override) {
        console_out(color(message, clr ? clr : getBgColor()), override);
    };

    var pathDif = function(path1, path2) {

        var p1 = path1.split(path.sep);
        var p2 = path2.split(path.sep);
        p1 = p1.filter(function(n) {
            return (n !== '');
        });
        p2 = p2.filter(function(n) {
            return (n !== '');
        });
        //var lng = (p1.length >= p2.length) ? p1.length : p2.length;

        var offset = p1.length - p2.length;

        if (offset <= 0) //p2.length > p1.length so offset p1.length into p2 and splice rest
            return '/' + p2.splice(p1.length, Math.abs(offset)).join('/');
        else //p1.length > p2.length so offset p2.length into p1 and splice
            return '/' + p1.splice(p2.length, offset).join('/');

    };

    this.key = key;

    var self = this;

    // this.watch = function(to, from){
    //
    //   if(!to && !from) { console.log('need some args :/'); return;}
    //
    //   watcher(args.from, function(filename){
    //
    //     var shortname = path.basename(filename);
    //     if(!fs.lstatSync(filename).isFile()){
    //       fs.createReadStream(filename)
    //         .pipe(fs.createWriteStream(args.to + '/' + shortname));
    //       console.log('copying ' + shortname + ' to ' + args.to);
    //     }
    //
    //   });
    // };

    //setup watcher on folder and write new file data to socket
    this.createWriteStream = function(monitorDir, socket) {
        //thr is through object that we will pipe the readstream to
        var buff = 0;
        var randomStr = "randomkey";

        var onFile = function(setupInfo) {

            var info = setupInfo;
            var beginning = true;
            var uid = this.key;

            randomStr = randomstring.generate(7);

            return function(data) {

                if (beginning) {

                    info.state = 'begin';
                    beginning = false;
                    socket.emit('beginSend', {
                        dataId: randomStr,
                        key: uid,
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

                if(data.buffer){
                  var bytesPerSecond = speed(data.buffer.length);
                  console_out(bytes(bytesPerSecond) + '/s', true);
                }

                socket.emit(randomStr, {
                    dataId: randomStr,
                    key: uid,
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

        var onEnd = function(fileInfo) {

            var info = fileInfo;
            var uid = this.key;

            return function() {

                socket.emit(randomStr, {
                    dataId: randomStr,
                    key: uid,
                    buffer: null,
                    state: 'end',
                    filename: info.filename,
                    totalSize: info.totalSize
                });

                socket.emit('endSend', {
                    dataId: randomStr,
                    key: uid,
                    buffer: null,
                    state: 'end',
                    filename: info.filename,
                    totalSize: info.totalSize
                });
                printPretty(path.basename(info.filename) + ' sent', 'magenta', true);
                buff = 0;
            };
            //     socket.emit('fileSynced', {filename: data.filename});
        }.bind(this);

        //watch our filesystem
        watcher(monitorDir, function(filename) {

            var shortname = path.basename(filename);

            if (!fs.existsSync(filename)) return;

            if (fs.lstatSync(filename).isFile()) {

                //if (shortname !== path.basename(self.currentlySyncing)) {
                    var fileInfo = {
                        state: 'begin',
                        filename: pathDif(args.dir, filename),
                        totalSize: fs.statSync(filename)["size"]
                    };

                    var tr = through(onFile(fileInfo), onEnd(fileInfo));

                    fs.createReadStream(filename)
                        .pipe(tr);

                    printPretty('syncing ' + filename, 'magenta', true);
                //}
            }

        });
    }

    //reading from socket
    this.createReadStream = function(monitorDir, socket) {

        var onData = function(totalSize) {

            var readStream = null;
            var once = true;
            var buff = 0;

            return function(data) {
                if (once) {
                    printPretty('receiving data', 'green', true);
                    once = false;
                }



                switch (data.state) {

                    case 'begin':

                        readStream = getStream(data);

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

                            if(data.buffer){
                              buff += data.buffer.length;
                              var per = buff/totalSize;

                              var bytesPerSecond = speed(data.buffer.length);

                              var colored = color(bytes(bytesPerSecond) + '/s '
                              + bytes(buff)
                              + '/' + bytes(totalSize) + ' received)', 'green');

                              console_out(colored, true);

                            }

                            if (!data.buffer) {
                                // str.close();
                                buff = 0;
                                readStream.close();
                                printPretty('file received sending', 'green_bg', false);
                            }
                            break;

                        }
                    case 'end':
                        //str.close();
                        readStream.close();
                        printPretty(data.filename + ' synced', 'green_bg');

                        break;
                }
            };

        };

        socket.on('beginSend', function(data) {
            socket.on(data.dataId, onData(data.totalSize));
        });

        socket.on('endSend', function(data) {
            //readStream.close();
            //console.log('file received');
            socket.removeAllListeners(data.dataId);
        });

        //socket.on('fileDataRead', onData());
    }

    var getStream = function(data) {

        //there is a bug here, need to create the new file directory,
        //not overwrite the old one.

        var basename = data.filename;
        var savePath = path.join(args.dir, basename);

        if (!fs.existsSync(savePath)) {

            mkdirp.sync(path.dirname(savePath));

        }

        var readStream = fs.createWriteStream(savePath, {});
        readStream.on('error', function(err) {
            console_out(err);
            readStream.destroy();
        });

        readStream.on('close', function() {
            //console_out('file.stream stream closed');
            readStream.destroy();
            readStream.removeAllListeners();

        });

        printPretty('syncing ' + data.filename, 'green', false);
        printPretty('saving to ' + color(savePath, 'green_bg'), 'white', false);

        return readStream;
    }
};

module.exports = Mirror;
