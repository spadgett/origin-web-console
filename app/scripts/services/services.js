'use strict';

angular.module("openshiftConsole")
  .factory("ServicesService", function($filter) {
    var annotation = $filter('annotation');
    return {
      // Returns an array of service names that are dependencies in the same namespace as ervice.
      getDependentServices: function(service) {
        var serviceNamespace,
            dependencies,
            dependenciesAnnotation = annotation(service, 'service.alpha.openshift.io/dependencies');
        if (!dependenciesAnnotation) {
          return [];
        }

        serviceNamespace = _.get(service, 'metadata.namespace');
        try {
          // Find dependent services. Example annotation:
          //   "service.alpha.openshift.io/dependencies": "[{\"name\": \"database\", \"namespace\": \"\", \"kind\": \"service\"}]"
          // Default kind if missing is Service and default namespace is this namespace.
          dependencies = JSON.parse(dependenciesAnnotation);
        } catch(e) {
          Logger.warn('Could not pase "service.alpha.openshift.io/dependencies" annotation', e);
          return [];
        }

        var isDependentService = function(dependency) {
          if (!dependency.name) {
            return false;
          }

          if (dependency.kind && dependency.kind !== 'Service') {
            return false;
          }

          if (dependency.namespace && dependency.namespace !== serviceNamespace) {
            return false;
          }

          return true;
        };

        return _.chain(dependencies)
                .filter(isDependentService)
                .map(function(dependency) {
                  return dependency.name;
                })
                .value();
      }
    };
  });
