'use strict';

angular.module('openshiftConsole')
  .directive('metricsTimeRange', function(MetricsCharts) {
    return {
      restrict: 'E',
      scope: {
        timeRange: '=ngModel'
      },
      templateUrl: 'views/directives/metrics-time-range.html',
      link: function(scope) {
        scope.options = MetricsCharts.getTimeRangeOptions();
      }
    };
  });

