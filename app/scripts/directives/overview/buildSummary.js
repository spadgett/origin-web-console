'use strict';

angular.module('openshiftConsole').component('buildSummary', {
  controller: BuildSummary,
  controllerAs: 'buildSummary',
  bindings: {
    builds: '<',
    buildLabel: '@'
  },
  templateUrl: 'views/overview/_build-summary.html'
});

function BuildSummary($scope) {
  var buildSummary = this;

  buildSummary.interestingPhases = ['New', 'Pending', 'Running', 'Error'];
  var isInteresting = function(build) {
    var phase = _.get(build, 'status.phase');
    return _.includes(buildSummary.interestingPhases, phase);
  };

  buildSummary.$onChanges = _.debounce(function() {
    $scope.$apply(function() {
      buildSummary.countByPhase = _.countBy(buildSummary.builds, 'status.phase');
      buildSummary.show = _.some(buildSummary.builds, isInteresting);
    });
  }, 200);
}
