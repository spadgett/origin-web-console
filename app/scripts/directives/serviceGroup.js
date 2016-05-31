'use strict';

angular.module('openshiftConsole')
  .directive('serviceGroup', function(RoutesService) {
    return {
      restrict: 'E',
      scope: {
        service: '=',
        childServices: '=',
        routes: '=',
        routeWarnings: '=',
        deploymentConfigsByService: '=',
        deploymentsByService: '=',
        recentPipelines: '=',
        pipelinesByDeployment: '=',
        podsByDeployment: '=',
        hpaByDc: '=',
        hpaByRc: '=',
        scalableDeploymentByConfig: '='
      },
      templateUrl: '/views/service-group.html',
      link: function($scope) {
        $scope.$watch('routes', function() {
          var displayRoute;
          _.each($scope.routes, function(candidate) {
            if (!displayRoute) {
              displayRoute = candidate;
              return;
            }

            // Is candidate better than the current display route?
            displayRoute = RoutesService.getPreferredDisplayRoute(displayRoute, candidate);
          });

          $scope.displayRoute = displayRoute;
        });
      }
    };
  });
