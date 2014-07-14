
var fs = require('fs'),
    watcher = require('node-watch'),
    path = require('path'),
    args = require('minimist')(process.argv.slice(2)),
    through = require('through'),
    mkdirp = require('mkdirp'),
    randomstring = require("randomstring");

var Mirror = function(key){

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
  this.createWriteStream = function(monitorDir, socket){
    //thr is through object that we will pipe the readstream to
    var buff = 0;
    var randomStr = "randomkey";

    var onFile = function(setupInfo){

      var info = setupInfo;
      var beginning = true;
      var uid = this.key;

      randomStr = randomstring.generate(7);

      self.currentlySyncing = info.filename;

      return function(data){

        if(beginning){

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

        }else{

          if(data) info.state = 'sending';
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

        console.log('sending ' +
         info.filename +
         " " +
         ((buff/info.totalSize).toPrecision(3) * 100) +
         "%");
      };
    }.bind(this);

    var onEnd = function(fileInfo){

      var info = fileInfo;
      var uid = this.key;

      //self.currentlySyncing = null;
      return function(){
        // socket.emit('endSend', {
        //   dataId: randomStr,
        //   key: uid,
        //   buffer: null,
        //   state: 'end',
        //   filename: info.filename,
        //   totalSize: info.totalSize
        // });
        console.log( path.basename(info.filename) + ' sent');
        buff = 0;
      };
 //     socket.emit('fileSynced', {filename: data.filename});
    }.bind(this);

    //watch our filesystem
    watcher(monitorDir, function(filename){

      var shortname = path.basename(filename);

      if(!fs.existsSync(filename)) return;

      if(fs.lstatSync(filename).isFile()){

        console.dir([shortname, path.basename(self.currentlySyncing)]);

        if(shortname !== path.basename(self.currentlySyncing)){
          var fileInfo = {
            state: 'begin',
            filename: filename,
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
  this.createReadStream = function(monitorDir, socket){

    var onData = function(){

      var readStream = null;

      return function(data){

            console.log('receiving data');

            switch(data.state){

              case 'begin':

                readStream = getStream(data);
                readStream.write(data.buffer);
                break;

              case 'sending': {

                if(readStream)
                  readStream.write(data.buffer);
                else
                  console.log("we have a problem with mirror.js -> createReadStream onData")

                if(!data.buffer){
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

    socket.on('beginSend', function(data){
      socket.on(data.dataId, onData());
    });

    socket.on('endSend', function(data){
      socket.removeAllListeners(data.dataId);
    });

    //socket.on('fileDataRead', onData());
  }

  var getStream = function(data){

    if (!fs.existsSync(data.filename)) {

      mkdirp.sync(path.dirname(data.filename));

    }

    var readStream = fs.createWriteStream(data.filename, {});
    readStream.on('error', function(err) {
        console.log(err);
        readStream.destroy();
    });

    readStream.on('close', function() {
      //console.log('file.stream stream closed');
     readStream.destroy();
     readStream.removeAllListeners();

    });

    return readStream;
  }
};

module.exports = Mirror;
