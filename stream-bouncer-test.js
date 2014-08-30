var fs = require('fs');
var StreamBouncer = require('./lib/stream-bouncer');

var sb = new StreamBouncer();

for (var i = 1; i < 5; i += 1) {
  sb.push({
    source: fs.createReadStream('~/Desktop/anonbox-target/master/' + i + '.jpg'),
    destination: fs.createWriteStream('~/Desktop/anonbox-target/slave/' + i + '.jpg'),
  });

}

for (var j = 1; j < 6; j += 1) {
  sb.push({
    source: fs.createReadStream('~/Desktop/anonbox-target/master/' + j + '.jpg'),
    destination: fs.createWriteStream('~/Desktop/anonbox-target/slave/' + j * 2 + '.jpg')
  });
}
