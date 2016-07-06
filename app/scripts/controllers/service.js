'use strict';

/**
 * @ngdoc function
 * @name openshiftConsole.controller:ServiceController
 * @description
 * Controller of the openshiftConsole
 */
angular.module('openshiftConsole')
  .controller('ServiceController', function ($scope,
                                             $filter,
                                             $routeParams,
                                             $q,
                                             $uibModal,
                                             DataService,
                                             ProjectsService,
                                             ServicesService) {
    $scope.projectName = $routeParams.project;
    $scope.service = null;
    $scope.alerts = {};
    $scope.renderOptions = $scope.renderOptions || {};
    $scope.renderOptions.hideFilterWidget = true;
    $scope.breadcrumbs = [
      {
        title: "Services",
        link: "project/" + $routeParams.project + "/browse/services"
      },
      {
        title: $routeParams.service
      }
    ];

    var watches = [];

    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        $scope.project = project;
        $scope.projectContext = context;

        $scope.canLink = function() {
          if (!$scope.services || !$scope.dependentServices) {
            return false;
          }

          return _.size($scope.services) > (_.size($scope.dependentServices) + 1);
        };

        DataService.get("services", $routeParams.service, context).then(
          // success
          function(service) {
            $scope.loaded = true;
            $scope.service = service;

            // If we found the item successfully, watch for changes on it
            watches.push(DataService.watchObject("services", $routeParams.service, context, function(service, action) {
              if (action === "DELETED") {
                $scope.alerts["deleted"] = {
                  type: "warning",
                  message: "This service has been deleted."
                };
              }
              $scope.service = service;
              $scope.dependentServices = ServicesService.getDependentServices(service);
            }));
          },
          // failure
          function(e) {
            $scope.loaded = true;
            $scope.alerts["load"] = {
              type: "error",
              message: "The service details could not be loaded.",
              details: "Reason: " + $filter('getErrorDetails')(e)
            };
          }
        );

        watches.push(DataService.watch("routes", context, function(routes) {
          $scope.routesForService = [];
          angular.forEach(routes.by("metadata.name"), function(route) {
            if (route.spec.to.kind === "Service" &&
                route.spec.to.name === $routeParams.service) {
              $scope.routesForService.push(route);
            }
          });

          Logger.log("routes (subscribe)", $scope.routesByService);
        }));

        // List services for linking.
        DataService.list("services", context, function(serviceData) {
          $scope.services = serviceData.by('metadata.name');
        }, function(result) {
          $scope.alerts["load"] = {
            type: "services-list-error",
            message: "An error occurred getting the list of services.",
            details: "Reason: " + $filter('getErrorDetails')(result)
          };
        });

        $scope.$on('$destroy', function(){
          DataService.unwatchAll(watches);
        });

        $scope.linkService = function() {
          var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'views/modals/link-service.html',
            controller: 'LinkServiceModalController',
            scope: $scope
          });
          modalInstance.result.then(function(child) {
            ServicesService.linkService($scope.service, child).then(
              // success
              _.noop,
              // failure
              function(result) {
                $scope.alerts = $scope.alerts || {};
                $scope.alerts["link-service"] = {
                  type: "error",
                  message: "Could not link services.",
                  details: $filter('getErrorDetails')(result)
                };
              }
            );
          });
        };

        $scope.removeLink = function(service) {
            var modalInstance = $uibModal.open({
              animation: true,
              templateUrl: 'views/modals/confirm.html',
              controller: 'ConfirmModalController',
              resolve: {
                message: function() {
                  return "Remove link to service " + service + "?";
                },
                details: function() {
                  return "The services will no longer be grouped together on the overview.";
                },
                buttonText: function() {
                  return "Remove Link";
                },
                buttonClass: function() {
                  return "btn-danger";
                }
              }
            });

            modalInstance.result.then(function() {
              ServicesService.removeServiceLink($scope.service, service).then(
                // success
                _.noop,
                // failure
                function(result) {
                  $scope.alerts = $scope.alerts || {};
                  $scope.alerts["remove-service-link"] = {
                    type: "error",
                    message: "Could not remove service link.",
                    details: $filter('getErrorDetails')(result)
                  };
                }
              );
            });
        };
    }));
  });
