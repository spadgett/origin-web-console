'use strict';

angular.module('openshiftConsole')
  .directive('serviceGroupNotifications', function($filter, Navigate) {
    return {
      restrict: 'E',
      scope: {
        service: '=',
        childServices: '=',
        deploymentConfigsByService: '=',
        deploymentsByService: '=',
        podsByDeployment: '='
      },
      templateUrl: '/views/directives/service-group-notifications.html',
      link: function($scope) {
        var hasHealthChecks = $filter('hasHealthChecks');
        var alerts = $scope.alerts = {};
        // TODO needs to be cleaned up
        $scope.$watchGroup(['service', 'childServices', 'deploymentConfigsByService'], function() {
          var svcs = ($scope.childServices || []).concat([$scope.service]);
          _.each(svcs, function(svc) {
            // Get notifications for DCs in this service group
            if ($scope.deploymentConfigsByService) {
              _.each($scope.deploymentConfigsByService[svc.metadata.name], function(dc) {
                if (!hasHealthChecks(dc.spec.template)) {
                  alerts["health_checks" + dc.metadata.uid] = {
                    type: "info",
                    message: dc.metadata.name + " has containers without health checks, which ensure your application is running correctly.",
                    links: [{
                      href: Navigate.healthCheckURL(dc.metadata.namespace, "DeploymentConfig", dc.metadata.name),
                      label: "Add health checks"
                    }]
                  };
                }
              });
            }
          });
        });
      }
    };
  });
