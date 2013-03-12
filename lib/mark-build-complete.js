var Q = require('q');
var aws = require('aws-sdk');

module.exports = function (access, secret, region, reposTableName) {
  aws.config.update({accessKeyId: access, secretAccessKey: secret});
  aws.config.update({region: region || 'us-east-1'});

  var db = new aws.DynamoDB({sslEnabled: true}).client;
  var updateItem = Q.nfbind(db.updateItem.bind(db));
  db.createTable({
    TableName: reposTableName,
    KeySchema: {
      HashKeyElement: { AttributeName: 'user', AttributeType: 'S'},
      RangeKeyElement: { AttributeName: 'repo', AttributeType: 'S'}
    },
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  }, function (err) {
    //ignore if table already exists
    //requires care when changing schema
    if (err.name === 'AWS:ResourceInUseException') return;
    throw err;
  });

  function complete(user, repo, buildID) {
    return updateItem({
        TableName: reposTableName,
        Key: {
          HashKeyElement: { S: user },
          RangeKeyElement: { S: repo }
        },
        Expected: {
          currentBuild: {Value: {N: '' + buildID}}
        },
        AttributeUpdates: {
          latestBuild: {Value: {N: '' + buildID} }
        }
      })
      .then(function(){}, function (err) {
        if (err.error.code === 'ConditionalCheckFailedException')
          return null;
        else
          throw (err.error && err.error.message) ? new Error(err.error.message) : err;
      })
      .thenResolve(null);
  }

  return complete;
};