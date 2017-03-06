'use strict';

angular.module('openshiftConsole').component('miniLog', {
  controllerAs: 'miniLog',
  controller: MiniLogController,
  bindings: {
    apiObject: '<',
    numLines: '<',
    context: '<'
  },
  templateUrl: 'views/overview/_mini-log.html'
});

function MiniLogController($scope, $filter, APIService, DataService) {
  var miniLog = this;

  var name, logSubresource, streamer;
  var annotation = $filter('annotation');
  var numLines = miniLog.numLines || 7;
  var buffer = [];
  miniLog.lines = [];

  var update = _.throttle(function() {
    $scope.$evalAsync(function() {
      miniLog.lines = buffer;
    });
  }, 200);

  var onMessage = function(msg) {
    if (!msg) {
      return;
    }

    if (buffer.length >= numLines) {
      buffer = _.drop(buffer);
    }
    buffer.push(msg);
    update();
  };

  var stopStreaming = function() {
    if (!streamer) {
      return;
    }

    streamer.stop();
    streamer = null;
  };

  var startStreaming = function() {
    var options = {
      follow: true,
      tailLines: numLines
    };

    streamer = DataService.createStream(logSubresource, name, miniLog.context, options);
    streamer.start();
    streamer.onMessage(onMessage);
    streamer.onClose(function() {
      streamer = null;
    });
  };

  miniLog.$onInit = function() {
    if (miniLog.apiObject.kind === "ReplicationController") {
      logSubresource = "deploymentconfigs/log";
      name = annotation(miniLog.apiObject, 'deploymentConfig');
    }
    else {
      logSubresource = APIService.kindToResource(miniLog.apiObject.kind) + "/log";
      name = miniLog.apiObject.metadata.name;
    }

    startStreaming();
  };

  miniLog.$onDestroy = function() {
    stopStreaming();
  };
}
