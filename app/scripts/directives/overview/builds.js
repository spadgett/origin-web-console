'use strict';

angular.module('openshiftConsole').component('overviewBuilds', {
  controllerAs: 'overviewBuilds',
  bindings: {
    buildConfigs: '<',
    recentBuildsByBuildConfig: '<',
    context: '<',
    showLog: '<'
  },
  templateUrl: 'views/overview/_builds.html'
});
