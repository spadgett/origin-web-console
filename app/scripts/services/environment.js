'use strict';

angular.module("openshiftConsole")
  .factory("EnvironmentService",
           function($filter,
                    EditorUtils,
                    keyValueEditorUtils) {
    var altTextForValueFrom = $filter('altTextForValueFrom');
    var getContainers = function(set) {
      return _.get(set, 'spec.template.spec.containers', []);
    };

    return {
      // Make sure there is an `env` property for each container and add in alt
      // text for any value from entries.
      // Note: This modifies object. It should only be called on a copy.
      normalize: function(object) {
        var containers = getContainers(object);
        _.each(containers, function(container) {
          container.env = container.env || [];
          // check valueFrom attribs and set an alt text for display if present
          _.each(container.env, altTextForValueFrom);
        });
      },

      // Call `keyValueEditorUtils.compactEntries` on the env for each container.
      // Note: This modifies object. It should only be called on a copy.
      compact: function(object) {
        var containers = getContainers(object);
        _.each(containers, function(container) {
          container.env = keyValueEditorUtils.compactEntries(container.env);
        });
      },

      // Copy and normalize the environment for editing using the key value editor.
      // Convenience method since these operations are usually done together.
      copyAndNormalize: function(object) {
        var copy = angular.copy(object);
        this.normalize(copy);
        return copy;
      },

      // Compare the current and previous versions of an object to see if any
      // of the environment variables have changed.
      isEnvironmentEqual: function(left, right) {
        return EditorUtils.containerPropertiesEqual(left, right, ['env']);
      },

      // Returns a copy of `target` with any environment variable edits from
      // `source`. Assumes `source` and `target` have the same containers in
      // their pod templates.
      mergeEdits: function(source, target) {
        return EditorUtils.mergeContainerEdits(source, target, ['env']);
      }
    };
  });
