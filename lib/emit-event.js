var Q = require('q');
var aws = require('aws2js');

module.exports = function (access, secret, region, topic) {
  var sns = aws.load('sns', access, secret);
  var request = Q.nfbind(sns.request.bind(sns));

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
  return emit;
};