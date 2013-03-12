var Q = require('q');
var get = Q.nfbind(require('request').get);

module.exports = checkStatus;

//Check that github etc. is online and if not, throw an error with `name === 'GitHubStatus'`
function checkStatus() {
  return get('https://status.github.com/api/status.json')
    .spread(function (res) {
      try {
        var status = JSON.parse(res.body.toString()).status;
      } catch (ex) {
        return true; //assume it's just the status site that's not working
      }
      if (status === 'good') return true;
      var err = new Error('GitHub status is ' + status);
      err.name = 'GitHubStatus';
      throw err;
    })
}