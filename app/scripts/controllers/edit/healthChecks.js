'use strict';

/**
 * @ngdoc function
 * @name openshiftConsole.controller:EditHealthChecksController
 * @description
 * # EditHealthChecksController
 * Controller of the openshiftConsole
 */
angular.module('openshiftConsole')
  .controller('EditHealthChecksController',
              function ($filter,
                        $location,
                        $routeParams,
                        $scope,
                        APIService,
                        AlertMessageService,
                        AuthorizationService,
                        BreadcrumbsService,
                        DataService,
                        EditorUtils,
                        Navigate,
                        ProjectsService) {
    if (!$routeParams.kind || !$routeParams.name) {
      Navigate.toErrorPage("Kind or name parameter missing.");
      return;
    }

    $scope.forms = {};
    var supportedKinds = [
      'Deployment',
      'DeploymentConfig',
      'ReplicaSet',
      'ReplicationController'
    ];

    if (!_.includes(supportedKinds, $routeParams.kind)) {
      Navigate.toErrorPage("Health checks are not supported for kind " + $routeParams.kind + ".");
      return;
    }

    $scope.name = $routeParams.name;
    $scope.resourceURL = Navigate.resourceURL($scope.name, $routeParams.kind, $routeParams.project);
    $scope.alerts = {};
    $scope.renderOptions = {
      hideFilterWidget: true
    };

    $scope.breadcrumbs = BreadcrumbsService.getBreadcrumbs({
      name: $routeParams.name,
      kind: $routeParams.kind,
      namespace: $routeParams.project,
      subpage: 'Edit Health Checks',
      includeProject: true
    });

    // Map of removed probes so that removing and adding back a probe remembers what was previously set.
    $scope.previousProbes = {};

    var getErrorDetails = $filter('getErrorDetails');

    var displayError = function(errorMessage, errorDetails) {
      $scope.alerts['add-health-check'] = {
        type: "error",
        message: errorMessage,
        details: errorDetails
      };
    };

    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        var displayName = $filter('humanizeKind')($routeParams.kind) + ' "' + $scope.name + '"';
        var resourceGroupVersion = {
          resource: APIService.kindToResource($routeParams.kind),
          group: $routeParams.group
        };

        if (!AuthorizationService.canI(resourceGroupVersion, 'update', $routeParams.project)) {
          Navigate.toErrorPage('You do not have authority to update ' + displayName + '.', 'access_denied');
          return;
        }

        DataService.get(resourceGroupVersion, $scope.name, context).then(
          function(original) {
            var watches = [];

            // Modify a copy of the object.
            $scope.object = angular.copy(original);
            $scope.breadcrumbs = BreadcrumbsService.getBreadcrumbs({
              object: $scope.object,
              project: project,
              subpage: 'Edit Health Checks',
              includeProject: true
            });

            $scope.containers = _.get($scope.object, 'spec.template.spec.containers');

            $scope.addProbe = function(container, probe) {
              // Restore the previous values if set.
              container[probe] = _.get($scope.previousProbes, [container.name, probe], {});
              $scope.form.$setDirty();
            };

            $scope.removeProbe = function(container, probe) {
              // Remember previous values if the probe is added back.
              _.set($scope.previousProbes, [container.name, probe], container[probe]);
              delete container[probe];
              $scope.form.$setDirty();
            };

            $scope.save = function() {
              $scope.disableInputs = true;
              DataService.update(APIService.kindToResource($routeParams.kind),
                                 $scope.name,
                                 $scope.object,
                                 context).then(
                function() {
                  AlertMessageService.addAlert({
                    name: $scope.name,
                    data: {
                      type: "success",
                      message: displayName + " was updated."
                    }
                  });
                  $location.url($scope.resourceURL);
                },
                function(result) {
                  $scope.disableInputs = false;
                  displayError(displayName + ' could not be updated.', getErrorDetails(result));
                });
            };

            var previousConflict = false, deleted = false;
            $scope.saveDisabled = function() {
              return _.get($scope, 'forms.healthCheckForm.$pristine') ||
                     _.get($scope, 'forms.healthCheckForm.$invalid') ||
                     $scope.disableInputs ||
                     previousConflict ||
                     deleted;
            };

            var latest;
            var healthCheckProperties = ['readinessProbe', 'livenessProbe'];
            watches.push(DataService.watch(resourceGroupVersion, $scope.name, context, function(updated, action) {
              latest = updated;

              if (action === 'DELETED') {
                deleted = true;
                $scope.alerts.deleted = {
                  type: "warning",
                  message: displayName + " has been deleted."
                };
                return;
              }

              if (previousConflict) {
                return;
              }

              // Merge updates into the updated object if there are no conflicts.
              if (EditorUtils.containerPropertiesEqual(original, latest, healthCheckProperties)) {
                $scope.object = EditorUtils.mergeContainerEdits($scope.object, latest, healthCheckProperties);
                original = latest;
                return;
              }

              // Otherwise display an error about conflicts.
              previousConflict = true;
              $scope.alerts.conflict = {
                type: 'warning',
                message: 'The health checks for ' + displayName + ' have been updated in the background. Saving your changes may create a conflict or cause loss of data.',
                links: [{
                  label: 'Reload Health Checks',
                  onClick: function() {
                    $scope.object = angular.copy(latest);
                    original = latest;
                    previousConflict = false;
                    if ($scope.forms.healthCheckForm) {
                      $scope.forms.healthCheckForm.$setPristine();
                    }

                    // Hide the alert.
                    return true;
                  }
                }]
              };
            }));

            $scope.$on('$destroy', function(){
              DataService.unwatchAll(watches);
            });
          },
          function(result) {
            displayError(displayName + ' could not be loaded.', getErrorDetails(result));
          }
        );
    }));
  });

