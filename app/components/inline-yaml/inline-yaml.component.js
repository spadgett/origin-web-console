'use strict';

(function() {
  angular.module('openshiftConsole')
    .component('inlineYaml', {
      bindings: {
        resource: '<',
      },
      templateUrl: 'components/inline-yaml/inline-yaml.html',
      controller: [
        '$filter',
        '$scope',
        'APIService',
        'DataService',
        'NotificationsService',
        InlineYamlController
      ]
    });

  function InlineYamlController($filter,
                                $scope,
                                APIService,
                                DataService,
                                NotificationsService) {
    var ctrl = this;
    var humanizeKind = $filter('humanizeKind');

    ctrl.$onChanges = function(changes) {
      if (changes.resource) {
        if (ctrl.modified && !ctrl.updatingNow) {
          ctrl.conflict = true;
        } else {
          ctrl.updatedResource = angular.copy(changes.resource.currentValue);
          ctrl.resourceGroupVersion = APIService.objectToResourceGroupVersion(changes.resource.currentValue);
        }
      }
    };

    $scope.$watch('$ctrl.updatedResource', function(updated, previous) {
      ctrl.modified = !_.isEqual(updated, previous);
    });

    ctrl.save = function() {
      var original = ctrl.resource;
      var updated = ctrl.updatedResource;
      if (updated.kind !== original.kind) {
        ctrl.error = {
          message: 'Cannot change resource kind (original: ' + original.kind + ', modified: ' + (updated.kind || '<unspecified>') + ').'
        };
        return;
      }

      var groupVersion = APIService.objectToResourceGroupVersion(ctrl.resource);
      var updatedGroupVersion = APIService.objectToResourceGroupVersion(updated);
      if (!updatedGroupVersion) {
        ctrl.error = { message: APIService.invalidObjectKindOrVersion(updated) };
        return;
      }
      if (updatedGroupVersion.group !== groupVersion.group) {
        ctrl.error = { message: 'Cannot change resource group (original: ' + (groupVersion.group || '<none>') + ', modified: ' + (updatedGroupVersion.group || '<none>') + ').' };
        return;
      }
      if (!APIService.apiInfo(updatedGroupVersion)) {
        ctrl.error = { message: APIService.unsupportedObjectKindOrVersion(updated) };
        return;
      }

      ctrl.updatingNow = true;
      DataService.update(groupVersion, original.metadata.name, updated, {
        namespace: original.metadata.namespace
      }).then(function success(response) {
        var editedResourceVersion = _.get(updated, 'metadata.resourceVersion');
        var newResourceVersion = _.get(response, 'metadata.resourceVersion');
        if (newResourceVersion === editedResourceVersion) {
          ctrl.alerts['no-changes-applied'] = {
            type: "warning",
            message: "No changes were applied to " + humanizeKind(original.kind) + " " + original.metadata.name + ".",
            details: "Make sure any new fields you may have added are supported API fields."
          };
          ctrl.updatingNow = false;
          return;
        }
        NotificationsService.addNotification({
                                             type: "success",
                                             message: humanizeKind(original.kind, true) + " " + original.metadata.name + " was successfully updated."
        });
      }, function failure(result) {
        ctrl.error = {
          message: $filter('getErrorDetails')(result)
        };
      }).finally(function() {
        ctrl.updatingNow = false;
      });
    };

    ctrl.reload = function() {
      ctrl.updatedResource = angular.copy(ctrl.resource);
      ctrl.conflict = false;
    };
  }
})();
