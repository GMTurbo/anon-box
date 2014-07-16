
//generic utility functions

var path = require('path')

module.exports = {
  getBgColor: function() {

        var colors = ['red_bg', 'blue_bg', 'cyan_bg', 'magenta_bg', 'green_bg'];

        var roller = -1;

        return (function() {
            var color = colors[roller];
            if (++roller > colors.length - 1)
                roller = 0;
            return color;
        }());
  },
  console_out: function(msg, overwrite) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      if (process.platform === 'win32') {
          //console.log('\033[2J');
      }
      process.stdout.write(msg);
  },
  bytes: function(size) {
      if (!size) return '0 B';
      var i = Math.floor(Math.log(size) / Math.log(1024));
      return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
  },
  printPretty: function(message, clr, override) {
      console_out(color(message, clr ? clr : getBgColor()), override);
  },
  pathDif: function(path1, path2) {
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

  }
};