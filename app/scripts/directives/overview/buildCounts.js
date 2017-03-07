'use strict';

angular.module('openshiftConsole').component('buildCounts', {
  controller: ['$scope', BuildCounts],
  controllerAs: 'buildCounts',
  bindings: {
    builds: '<',
    label: '@'
  },
  templateUrl: 'views/overview/_build-counts.html'
});

function BuildCounts($scope) {
  var buildCounts = this;

  buildCounts.interestingPhases = ['New', 'Pending', 'Running', 'Failed', 'Error'];
  var isInteresting = function(build) {
    var phase = _.get(build, 'status.phase');
    return _.includes(buildCounts.interestingPhases, phase);
  };

  buildCounts.$onChanges = _.debounce(function() {
    $scope.$apply(function() {
      buildCounts.countByPhase = _.countBy(buildCounts.builds, 'status.phase');
      buildCounts.show = _.some(buildCounts.builds, isInteresting);
    });
  }, 200);
}
