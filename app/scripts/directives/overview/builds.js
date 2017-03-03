'use strict';

angular.module('openshiftConsole').component('overviewBuilds', {
  controllerAs: 'overviewBuilds',
  bindings: {
    buildConfigs: '<',
    recentBuildsByBuildConfig: '<'
  },
  templateUrl: 'views/overview/_builds.html'
});
