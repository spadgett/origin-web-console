'use strict';

angular.module("openshiftConsole")
  .factory("ServicesService", function($filter) {
    var annotation = $filter('annotation');
    return {
      getDependentServices: function(service) {
        var dependencies, serviceNamespace = _.get(service, 'metadata.namespace');
        try {
          // Find dependent services. Example annotation:
          //   "service.alpha.openshift.io/dependencies": "[{\"name\": \"database\", \"namespace\": \"\", \"kind\": \"service\"}]"
          // Default kind if missing is Service and default namespace is this namespace.
          dependencies = JSON.parse(annotation(service, 'service.alpha.openshift.io/dependencies'));
        } catch(e) {
          Logger.warn('Could not pase "service.alpha.openshift.io/dependencies" annotation', e);
          return null;
        }

        return _.filter(dependencies, function(dependency) {
          var kind = _.get(dependency, 'metadata.kind') || 'Service',
              namespace = _.get(dependency, 'metadata.namespace') || serviceNamespace;
          return _.has(dependency, 'metadata.name') && kind === 'Service' && namespace === serviceNamespace;
        });
      }
    };
  });
