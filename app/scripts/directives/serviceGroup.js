'use strict';

angular.module('openshiftConsole')
  .directive('serviceGroup', function($uibModal, RoutesService, ServicesService) {
    return {
      restrict: 'E',
      scope: {
        service: '=',
        services: '=',
        childServices: '=',
        routes: '=',
        routeWarnings: '=',
        deploymentConfigsByService: '=',
        deploymentsByService: '=',
        recentPipelinesByDc: '=',
        pipelinesByDeployment: '=',
        podsByDeployment: '=',
        hpaByDc: '=',
        hpaByRc: '=',
        scalableDeploymentByConfig: '=',
        monopodsByService: '='
      },
      templateUrl: '/views/service-group.html',
      link: function($scope) {
        $scope.collapse = false;
        $scope.toggleCollapse = function() {
          $scope.collapse = !$scope.collapse;
        };

        $scope.linkService = function() {
          var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modals/link-service.html',
            controller: 'LinkServiceModalController',
            scope: $scope
          });
          modalInstance.result.then(function(child) {
            // TODO: Handle errors!
            ServicesService.linkService($scope.service, child);
          });
        };

        $scope.$watch('service.metadata.labels.app', function(appName) {
          $scope.appName = appName;
        });

        $scope.$watch('routes', function(routes) {
          var displayRoute;
          _.each(routes, function(candidate) {
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
