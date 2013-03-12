var Q = require('q');
var join = require('path').join;
var unlink = Q.nfbind(require('fs').unlink);
var createWriteStream = require('fs').createWriteStream;
var mkdirp = require('mkdirp');
var guid = require('guid');
var knox = require('knox');

var cacheDir = join(__dirname, '..', 'cache');
mkdirp.sync(cacheDir);

function retry(fn, n, delay) {
  n = n || 5;
  delay = delay || 2;
  return Q(fn())
    .then(null, function (err) {
      if (n === 1) throw err;
      else return Q(null).delay(delay * 1000)
        .then(function () { return retry(fn, n - 1, delay * 2); })
    })
}

module.exports = function (config) {
  var client = knox.createClient(config);
  return function (directory) {
    var res = {};
    function resolve(path) {
      return (directory + '/' + path).replace(/\\/g, '/').replace(/\/\//g, '/').replace(/^\/?/, '/').replace(/ /g, '-');
    }
    res.get = function (path, cb) {
      return retry(function () {
        return Q.nfbind(client.getFile.bind(client))(resolve(path))
          .then(function (res) {
            if (res.statusCode === 404) return null;
            if (res.statusCode !== 200) throw new Error('Server responded with status code: ' + res.statusCode + ' for ' + path);
            return res.body;
          });
      });
    };
    res.put = function (path, content) {
      return retry(function () {
        return Q.nfbind(client.putBuffer.bind(client))(content, resolve(path))
          .then(function (res) {
            if (res.statusCode !== 200) throw new Error('Server responded with status code: ' + res.statusCode + ' for ' + path);
          });
      });
    };
    res.putStream = function (path, content) {
      var temp = guid.raw();
      var tempStrm = createWriteStream(join(cacheDir, temp));

      function cleanup() {
        return unlink(join(cacheDir, temp));
      }

      return Q.promise(function (resolve, reject) {
        content.on('error', reject);
        tempStrm.on('error', reject);
        tempStrm.on('close', resolve);
        content.pipe(tempStrm);
      }).then(function () {
        return retry(function () {
            return Q.nfbind(client.putFile.bind(client))(join(cacheDir, temp), resolve(path))
              .then(function (res) {
                if (res.statusCode !== 200) throw new Error('Server responded with status code: ' + res.statusCode + ' for ' + path);
              })
          })
          .then(function () {
            return cleanup();
          }, function (err) {
            return cleanup().then(function () {
              throw err;
            }, function () {
              throw err;
            });
          });
      });
    };
    return res;
  };
};