'use strict';

angular.module('openshiftConsole')
  .directive('overviewService', function($filter, Navigate, RoutesService, DeploymentsService) {
    return {
      restrict: 'E',
      scope: {
        service: '=',
        routes: '=',
        routeWarnings: '=',
        deploymentConfigs: '=',
        deployments: '=',
        replicationControllers: '=',
        recentPipelines: '=',
        pipelinesByDeployment: '=',
        podsByDeployment: '=',
        hpaByDc: '=',
        hpaByRc: '=',
        scalableDeploymentByConfig: '='
      },
      templateUrl: '/views/_overview-service.html',
      link: function($scope) {
        var annotation = $filter('annotation');
        var isRecentDeployment = $filter('isRecentDeployment');

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

        // FIXME: Too much common code with topology.js
        $scope.isDeploymentVisible = function(deployment) {
          if (_.get(deployment, 'status.replicas')) {
            return true;
          }

          var dcName = annotation(deployment, 'deploymentConfig');
          if (!dcName) {
            return true;
          }

          // Wait for deployment configs to load.
          if (!$scope.deploymentConfigs) {
            return false;
          }

          // If the deployment config has been deleted and the deployment has no replicas, hide it.
          // Otherwise all old deployments for a deleted deployment config will be visible.
          var dc = $scope.deploymentConfigs[dcName];
          if (!dc) {
            return false;
          }

          return isRecentDeployment(deployment, dc);
        };

        $scope.viewPodsForDeployment = function(deployment) {
          if (_.isEmpty($scope.podsByDeployment[deployment.metadata.name])) {
            return;
          }

          Navigate.toPodsForDeployment(deployment);
        };
        

        $scope.getHPA = function(rcName, dcName) {
          var hpaByDC = $scope.hpaByDc;
          var hpaByRC = $scope.hpaByRc;
          // Return `null` if the HPAs haven't been loaded.
          if (!hpaByDC || !hpaByRC) {
            return null;
          }

          // Set missing values to an empty array if the HPAs have loaded. We
          // want to use the same empty array for subsequent requests to avoid
          // triggering watch callbacks in overview-deployment.
          if (dcName) {
            hpaByDC[dcName] = hpaByDC[dcName] || [];
            return hpaByDC[dcName];
          }

          hpaByRC[rcName] = hpaByRC[rcName] || [];
          return hpaByRC[rcName];
        };        
        
        $scope.isScalableDeployment = DeploymentsService.isScalable;
      }
    };
  });
