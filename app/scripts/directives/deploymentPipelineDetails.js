"use strict";

angular.module('openshiftConsole')
  .directive('deploymentPipelineDetails', function() {
    return {
      restrict: 'E',
      scope: {
        deployment: '='
      },
      templateUrl: 'views/directives/deployment-pipeline-details.html'
    };
  });