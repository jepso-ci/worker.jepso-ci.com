var Q = require('q');
var sqs = require('simple-queue-service');
var aws = require('aws-sdk');

var join = require('path').join;
var runJob = require('jepso-job-runner');

var express = require('express');
var app = express();
var server = module.exports = require('http').createServer(app);

//load configuration
var config;
try { config = require('./config.json'); } catch (ex) {}
var access = process.env.WORKER_ACCESS || config.access;
var secret = process.env.WORKER_SECRET || config.secret;
var region = process.env.WORKER_REGION || (config && config.region);
var queueName = process.env.WORKER_QUEUE || config.queue;
var reposTableName = process.env.WORKER_REPOS_TABLE || config['repos-table'];
var s3BucketName = process.env.WORKER_S3_BUCKET || config['S3-bucket'];
var topic = process.env.WORKER_SNS_TOPIC || config['notification-topic'];

var sauceID = process.env.WORKER_SAUCE || config.sauce;
var sauceKey = process.env.WORKER_SAUCE_KEY || config['sauce-key'];
var sauceParallelization = process.env.WORKER_SAUCE_PARALLELIZATION || config['sauce-parallelization'] || 3;

var checkStatus = require('./lib/check-status');
var emit = require('./lib/emit-event')(access, secret, region, topic);
var markComplete = require('./lib/mark-build-complete')(access, secret, region, reposTableName);
var s3FS = require('./lib/s3-fs')({
  bucket: s3BucketName,
  key: access,
  secret: secret,
  region: region
});

var throttle = require('throat')(sauceParallelization);
function sauce(fn) {
  return throttle(function () {
    return fn(sauceID, sauceKey);
  })
}

var queue = sqs(access, secret, region).createQueue(queueName, {visibilityTimeout: '10 minutes'});

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
  console.warn('begin: ' + user + '/' + repo + '/' + tag);
  return Q(runJob({
    sauce: sauce,
    commit: {user: user, repo: repo, tag: tag},
    buildCreatedTime: Date.now(),
    fileSystem: s3FS(user + '/' + repo + '/' + buildID)
  }, function (name, user, repo, data) {
    //keep from message timeing out
    return Q(message.extendTimeout('10 minutes'))
      .then(function () {
        return emit(name, user, repo, data);
      });
  }))
  .then(function () {
    return markComplete(user, repo, buildID);
  })
  .then(function () {
    console.warn('end: ' + user + '/' + repo + '/' + tag);
  })
}

server.listen(3001);