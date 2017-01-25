'use strict';

angular.module('openshiftConsole').component('overviewListRow', {
  controller: OverviewListRow,
  controllerAs: 'row',
  bindings: {
    apiObject: '<',
    current: '<',
    // Previous deployment (if a deployment is in progress)
    previous: '<',
    state: '<',
    // TODO: Move into `state` object?
    recentPipelines: '<',
    hpa: '<'
  },
  templateUrl: 'views/overview/_list-row.html'
});

function OverviewListRow($filter,
                         $uibModal,
                         BuildsService,
                         DeploymentsService,
                         Navigate) {
  var row = this;
  var deploymentIsInProgress = $filter('deploymentIsInProgress');

  var updateTriggers = function(apiObject) {
    var triggers = _.get(apiObject, 'spec.triggers', []);
    if (_.isEmpty(triggers)) {
      return;
    }

    row.imageChangeTriggers = _.filter(triggers, function(trigger) {
      return trigger.type === 'ImageChange' && _.get(trigger, 'imageChangeParams.automatic');
    });
  };

  var updateCurrent = function(apiObject) {
    if (!apiObject ||
        row.current ||
        apiObject.kind === 'DeploymentConfig' ||
        apiObject.kind === 'Deployment') {
      return;
    }

    // For anything that's not a deployment or deployment config, "current" is the object itself.
    row.current = apiObject;
  };

  var updateAPIObject = function(apiObject) {
    updateCurrent(apiObject);
    updateTriggers(apiObject);
  };

  row.$onChanges = function(changes) {
    if (changes.apiObject) {
      updateAPIObject(changes.apiObject.currentValue);
    }
  };

  var expandedKey = function(apiObject) {
    var uid = _.get(apiObject, 'metadata.uid');
    if (!uid) {
      return null;
    }

    return 'overview/expand/' + uid;
  };

  row.toggleExpand = function(e) {
    if ($(e.target).closest("a").length > 0) {
      return;
    }

    var key = expandedKey(row.apiObject);
    if (!key) {
      return;
    }

    var previouslyExpanded = sessionStorage.getItem(key) === 'true';
    sessionStorage.setItem(key, previouslyExpanded ? 'false' : 'true');
  };

  row.isExpanded = function() {
    var key = expandedKey(row.apiObject);
    if (!key) {
      return false;
    }

    var item = sessionStorage.getItem(key);
    if (!item && row.state.expandAll) {
      return true;
    }

    return item === 'true';
  };

  row.getPods = function(owner) {
    var uid = _.get(owner, 'metadata.uid');
    return _.get(row, ['state', 'podsByOwnerUID', uid]);
  };

  row.getNotifications = function() {
    var uid = _.get(row, 'current.metadata.uid');
    return _.get(row, ['state', 'notificationsByObjectUID', uid]);
  };

  // Return the same empty array each time. Otherwise, digest loop errors occur.
  var NO_HPA = [];
  var getHPA = function(object) {
    if (!row.state.hpaByResource) {
      return null;
    }

    var kind = _.get(object, 'kind');
    var name = _.get(object, 'metadata.name');

    // TODO: Handle groups and subresources
    // var groupVersion = APIService.parseGroupVersion(object.apiVersion) || {};
    // var group = groupVersion.group || '';

    return _.get(row.state.hpaByResource, [kind, name], NO_HPA);
  };

  row.getHPA = function() {
    var hpa = getHPA(row.apiObject);
    if (!row.current || !_.isEmpty(hpa)) {
      return hpa;
    }

    return getHPA(row.current);
  };

  row.isScalable = function() {
    if (!_.isEmpty(row.hpa)) {
      return false;
    }

    // FIXME: More to check.
    return !row.isDeploymentInProgress();
  };

  row.isDeploymentInProgress = function() {
    if (row.current && row.previous) {
      return true;
    }

    return deploymentIsInProgress(row.current);
  };

  row.startPipeline = function(pipeline) {
    BuildsService
      .startBuild(pipeline.metadata.name, { namespace: pipeline.metadata.namespace })
      .then(_.noop, function(result) {
        row.state.alerts["start-pipeline"] = {
          type: "error",
          message: "An error occurred while starting the pipeline.",
          details: $filter('getErrorDetails')(result)
        };
      });
  };

  row.startDeployment = function() {
    DeploymentsService.startLatestDeployment(row.apiObject, {
      namespace: row.apiObject.metadata.namespace
    }, { alerts: row.state.alerts });
  };

  row.cancelDeployment = function() {
    var replicationController = row.current;
    if (!replicationController) {
      return;
    }

    var rcName = replicationController.metadata.name;
    var latestVersion = _.get(row, 'apiObject.status.latestVersion');
    var modalInstance = $uibModal.open({
      animation: true,
      templateUrl: 'views/modals/confirm.html',
      controller: 'ConfirmModalController',
      resolve: {
        modalConfig: function() {
          return {
            message: "Cancel deployment " + rcName + "?",
            details: latestVersion ? ("This will attempt to stop the in-progress deployment and rollback to the previous deployment, #" + latestVersion + ". It may take some time to complete.") :
                                      "This will attempt to stop the in-progress deployment and may take some time to complete.",
            okButtonText: "Yes, cancel",
            okButtonClass: "btn-danger",
            cancelButtonText: "No, don't cancel"
          };
        }
      }
    });

    modalInstance.result.then(function() {
      if (replicationController.metadata.uid !== row.current.metadata.uid) {
        row.state.alerts["cancel-deployment"] = {
          type: "error",
          message: "Deployment " + rcName + " no longer latest."
        };
        return;
      }

      // Make sure we have the latest resource version of the replication controller.
      replicationController = row.current;

      // Make sure it's still running.
      if (!deploymentIsInProgress(replicationController)) {
        row.state.alerts["cancel-deployment"] = {
          type: "error",
          message: "Deployment " + rcName + " is no longer in progress."
        };
        return;
      }

      DeploymentsService.cancelRunningDeployment(replicationController, {
        namespace: replicationController.metadata.namespace
      }, { alerts: row.state.alerts });
    });
  };

  row.urlForImageChangeTrigger = function(imageChangeTrigger) {
    var imageStreamName = $filter('stripTag')(_.get(imageChangeTrigger, 'imageChangeParams.from.name'));
    var deploymentConfigNamespace = _.get(row, 'apiObject.metadata.namespace');
    var imageStreamNamespace = _.get(imageChangeTrigger, 'imageChangeParams.from.namespace', deploymentConfigNamespace);
    return Navigate.resourceURL(imageStreamName, 'ImageStream', imageStreamNamespace);
  };
}
