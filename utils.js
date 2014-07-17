//generic utility functions

var path = require('path'), // directory helper
    color = require('ansi-color').set, //terminal colorer



function clearLog(message) {
    utils.console_out(message);
}
//export an object with all our functions
var utils = {

    //get a random color from a rolling list of them
    getBgColor: function() {

        //color coincide with supported colors in the ansi-color module
        var colors = ['red_bg', 'blue_bg', 'cyan_bg', 'magenta_bg', 'green_bg'];

        var roller = -1;

        //return the output of a function that increments roller
        //the syntax below is just us creating a function and executing it immediately
        return (function() {
            var color = colors[roller];
            if (++roller > colors.length - 1)
                roller = 0;
            return color;
        }());
    },

    //special console.log
    //it overwrites the previous line so we can display speeds and stuff
    console_out: function(msg, overwrite) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        if (process.platform === 'win32') {
            //console.log('\033[2J');
        }
        process.stdout.write(msg);
    },

    //return human readable representation of file sizes
    //I didn't write this
    bytes: function(size) {
        if (!size) return '0 B';
        var i = Math.floor(Math.log(size) / Math.log(1024));
        return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
    },

    //print pretty text to terminal
    printPretty: function(message, clr, override) {
        this.console_out(color(message, clr ? clr : getBgColor()), override);
    },

    //not working :(
    console_out_multi: function(){
      var streams = {};

      return {

        write: function(msg, streamID){

              streams[streamID] = msg;
              // process.stdout.clearLine();
              // process.stdout.cursorTo(0);
              // if (process.platform === 'win32') {
              //     //console.log('\033[2J');
              // }
              var toScreen='';
              for(var stream in streams){
                toScreen += streams[stream];
              }
              clearLog(toScreen)

        },

        remove: function(streamID){
          delete streams[streamID];
        }

      }
    },
    //ex:
    // c:/gabe/is/awesome/and/cool
    // c:/gabe/is/awesome/
    // returns /and/cool/
    pathDif: function(path1, path2) {

        var p1 = path1.split(path.sep),
            p2 = path2.split(path.sep);

        //removes any empty elements in the array returned from split
        p1 = p1.filter(function(n) {
            return (n !== '');
        });
        p2 = p2.filter(function(n) {
            return (n !== '');
        });

        var offset = p1.length - p2.length;

        if (offset <= 0) //p2.length > p1.length so offset p1.length into p2 and splice rest
            return '/' + p2.splice(p1.length, Math.abs(offset)).join('/');
        else //p1.length > p2.length so offset p2.length into p1 and splice
            return '/' + p1.splice(p2.length, offset).join('/');

    }
};

module.exports = utils;
