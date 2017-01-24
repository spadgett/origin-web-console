'use strict';

angular.module("openshiftConsole")
  .factory("EditorUtils", function() {
    var getContainers = function(set) {
      return _.get(set, 'spec.template.spec.containers', []);
    };

    return {
      // Compare two versions of an object to see if each of `properties` is
      // equal for all containers in the respective pod templates.
      containerPropertiesEqual: function(left, right, properties) {
        var leftContainers = getContainers(left);
        var rightContainers = getContainers(right);
        if (leftContainers.length !== rightContainers.length) {
          return false;
        }

        var i, j, leftValue, rightValue;
        for (i = 0; i < leftContainers.length; i++) {
          // If a container name has changed, consider it a conflict.
          if (leftContainers[i].name !== rightContainers[i].name) {
            return false;
          }

          // Check if any of the variable names or values are different.
          for (j = 0; j < properties.length; j++) {
            leftValue = _.get(leftContainers[i], properties[j]);
            rightValue = _.get(rightContainers[i], properties[j]);
            if (!_.isEqual(leftValue, rightValue)) {
              return false;
            }
          }
        }

        return true;
      },

      // Returns a copy of `target` with any container edits to `properties`
      // from `source`. Assumes `source` and `target` have the same containers
      // in their pod templates.
      mergeContainerEdits: function(source, target, properties) {
        var i, j, sourceValue;
        var copy = angular.copy(target);
        var sourceContainers = getContainers(source);
        var targetContainers = getContainers(copy);
        for (i = 0; i < targetContainers.length; i++) {
          for (j = 0; j < properties.length; j++) {
            sourceValue = _.get(sourceContainers[i], properties[j]);
            _.set(targetContainers[i], properties[j], sourceValue);
          }
        }

        return copy;
      }
    };
  });

