var Q = require('q');
var sqs = require('simple-queue-service');
var aws = require('aws-sdk');
var config;
try { config = require('./config.json'); } catch (ex) {}
var get = Q.nfbind(require('request').get);

var express = require('express');
var app = express();
var server = module.exports = require('http').createServer(app);

var access = process.env.WORKER_ACCESS || config.access;
var secret = process.env.WORKER_SECRET || config.secret;
var region = process.env.WORKER_REGION || (config && config.region);
var queueName = process.env.WORKER_QUEUE || config.queue;
var reposTableName = process.env.WORKER_REPOS_TABLE || config['repos-table'];
var s3BucketName = process.env.WORKER_S3_BUCKET || config['S3-bucket'];

var queue = sqs(access, secret, region).createQueue(queueName, {visibilityTimeout: '10 minutes'});

function checkStatus() {
  return get('https://status.github.com/api/status.json')
    .spread(function (res) {
      if (res.statusCode != 200) return true; //assume it's just the status site that's offline
      var status = JSON.parse(res.body.toString()).status;
      if (status === 'good') return true;
      var err = new Error('GitHub status is ' + status);
      err.name = 'GitHubStatus';
      throw err;
    })
}
recieveMessage();
function recieveMessage() {
  Q(queue.nextMessage())
    .then(function (message) {
      return checkStatus().thenResolve(message);
    })
    .then(function (message) {
      if (message.receiveCount > 5) return message;

      return Q(processMessage(message)).thenResolve(message);
    })
    .done(function (message) {
      message.delete();
      recieveMessage();
    }, function (err) {
      if (err.name = 'GitHubStatus') {
        console.warn(err.message);
        Q.delay(300000).done(recieveMessage);//give GitHub 5 minutes to recover
      } else {
        console.error(err.stack || err.message || err);
        Q.delay(60000).done(recieveMessage);//give the situation 1 minute to improve
      }
    })
}
function processMessage(message) {
  var user = message.body.user;
  var repo = message.body.repo;
  var tag = message.body.tag;
  var buildID = message.body.buildID;
  //todo: actually run tests
}

//todo: output helpful logs while tests are running

server.listen(3001);