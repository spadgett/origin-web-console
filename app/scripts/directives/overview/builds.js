'use strict';

angular.module('openshiftConsole').component('overviewBuilds', {
  controllerAs: 'overviewBuilds',
  bindings: {
    buildConfigs: '<',
    recentBuildsByBuildConfig: '<',
    context: '<'
  },
  templateUrl: 'views/overview/_builds.html'
});
