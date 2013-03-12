var config;
try { config = require('../config.json'); } catch (ex) {}
var access = process.env.WORKER_ACCESS || config.access;
var secret = process.env.WORKER_SECRET || config.secret;
var topic = process.env.WORKER_NOTIFICATION_TOPIC || config['notification-topic'];

var Q = require('q');
var sns = require('aws2js').load('sns', access, secret);
var request = Q.nfbind(sns.request.bind(sns));

module.exports = emit;
//returns Promise(messageID)
function emit(name, user, repo, data) {
  data = data || {};
  data.user = user;
  data.repo = repo;
  return request('Publish', {
    Subject: name,
    Message: JSON.stringify(data),
    TopicArn: topic
  }).get('PublishResult').get('MessageId');
}