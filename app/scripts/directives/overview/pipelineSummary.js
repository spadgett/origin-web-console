'use strict';

angular.module('openshiftConsole').component('pipelineSummary', {
  controller: PipelineSummary,
  controllerAs: 'pipelineSummary',
  bindings: {
    pipelines: '<'
  },
  templateUrl: 'views/overview/_pipeline-summary.html'
});

function PipelineSummary($scope) {
  var pipelineSummary = this;

  pipelineSummary.interestingPhases = ['New', 'Pending', 'Running', 'Error'];
  var isInteresting = function(pipeline) {
    var phase = _.get(pipeline, 'status.phase');
    return _.includes(pipelineSummary.interestingPhases, phase);
  };

  pipelineSummary.$onChanges = _.debounce(function() {
    $scope.$apply(function() {
      pipelineSummary.countByPhase = _.countBy(pipelineSummary.pipelines, 'status.phase');
      pipelineSummary.show = _.some(pipelineSummary.pipelines, isInteresting);
    });
  }, 200);
}
