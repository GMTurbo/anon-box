var fs = require('fs'),
    watcher = require('node-watch'),
    path = require('path'),
    args = require('minimist')(process.argv.slice(2)),
    through = require('through'),
    mkdirp = require('mkdirp'),
    randomstring = require("randomstring");

var Mirror = function(key) {

    var pathDif = function(path1, path2){
  
      var p1 = path1.split(path.sep);
      var p2 = path2.split(path.sep);
      p1 = p1.filter(function(n){ return (n != '');  });
      p2 = p2.filter(function(n){ return (n != '');  });
      //var lng = (p1.length >= p2.length) ? p1.length : p2.length;
      
      var offset = p1.length - p2.length;
      
      if(offset <= 0) //p2.length > p1.length so offset p1.length into p2 and splice rest
        return '/' + p2.splice(p1.length, Math.abs(offset)).join('/');
      else //p1.length > p2.length so offset p2.length into p1 and splice
        return '/' + p1.splice(p2.length, offset).join('/');
      
    };

    this.key = key;

    this.currentlySyncing = null;

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

            self.currentlySyncing = info.filename;

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

            //self.currentlySyncing = null;
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
                console.log(path.basename(info.filename) + ' sent');
                buff = 0;
            };
            //     socket.emit('fileSynced', {filename: data.filename});
        }.bind(this);

        //watch our filesystem
        watcher(monitorDir, function(filename) {

            var shortname = path.basename(filename);

            if (!fs.existsSync(filename)) return;

            if (fs.lstatSync(filename).isFile()) {

                //console.dir([shortname, path.basename(self.currentlySyncing)]);

                if (shortname !== path.basename(self.currentlySyncing)) {
                    var fileInfo = {
                        state: 'begin',
                        filename: pathDif(args.dir, filename),
                        totalSize: fs.statSync(filename)["size"]
                    };

                    var tr = through(onFile(fileInfo), onEnd(fileInfo));

                    fs.createReadStream(filename)
                        .pipe(tr);

                    console.log('syncing ' + filename);
                }
            }

        });
    }

    //reading from socket
    this.createReadStream = function(monitorDir, socket) {

        var onData = function() {

            var readStream = null;
            var once = true;
            return function(data) {
                if(once){
                  console.log('receiving data');
                  once = false;
                }
                switch (data.state) {

                    case 'begin':

                        readStream = getStream(data);
                        readStream.write(data.buffer);
                        break;

                    case 'sending':
                        {

                            if (readStream)
                                readStream.write(data.buffer);
                            else
                                console.log("we have a problem with mirror.js -> createReadStream onData")

                            if (!data.buffer) {
                                readStream.close();
                                console.log('file received');
                            }
                            break;

                        }
                    case 'end':
                        readStream.close();
                        console.log('file received');

                        break;
                }
            };

        };

        socket.on('beginSend', function(data) {
            socket.on(data.dataId, onData());
        });

        socket.on('endSend', function(data) {
            //readStream.close();
            console.log('file received');
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
            console.log(err);
            readStream.destroy();
        });

        readStream.on('close', function() {
            //console.log('file.stream stream closed');
            readStream.destroy();
            readStream.removeAllListeners();

        });
        
        console.log('syncing ' + data.filename);
        console.log('saving to ' + savePath);
        
        return readStream;
    }
};

module.exports = Mirror;
