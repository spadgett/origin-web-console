'use strict';

/**
 * @ngdoc function
 * @name openshiftConsole.controller:OverviewController
 * @description
 * # OverviewController
 * Controller of the openshiftConsole
 */
angular.module('openshiftConsole')
  .controller('OverviewController',
              function ($filter,
                        $routeParams,
                        $scope,
                        DataService,
                        DeploymentsService,
                        Logger,
                        PodsService,
                        ProjectsService,
                        RoutesService) {
    $scope.projectName = $routeParams.project;
    var watches = [];
    var services, deploymentConfigs, deployments, pods, buildConfigs, builds;

    var isJenkinsPipelineStrategy = $filter('isJenkinsPipelineStrategy');
    var annotation = $filter('annotation');

    var groupDeploymentConfigs = function() {
      if (!services || !deploymentConfigs) {
        return;
      }

      $scope.deploymentConfigsByService = DeploymentsService.groupByService(deploymentConfigs, services);
    };

    var groupReplicationControllers = function() {
      if (!services || !deployments) {
        return;
      }

      $scope.deploymentsByService = DeploymentsService.groupByService(deployments, services);
    };

    var groupPods = function() {
      if (!pods || !deployments) {
        return;
      }

      $scope.podsByDeployment = PodsService.groupByReplicationController(pods, deployments);
    };

    // Set of child services in this project.
    var childServices = {};
    $scope.isChildService = function(service) {
      return !!childServices[service.metadata.name];
    };

    var addChildService = function(parentName, childName) {
      var child = services[childName];
      childServices[childName] = child;
      $scope.childServicesByParent[parentName] = $scope.childServicesByParent[parentName] || [];
      $scope.childServicesByParent[parentName].push(child);
    };

    var groupServices = function() {
      childServices = {};
      $scope.childServicesByParent = {};
      _.each(services, function(service, serviceName) {
        var dependencies, dependentServices;
        try {
          // Find dependent services in this project. Example annotation:
          //   "service.alpha.openshift.io/dependencies": "[{\"name\": \"database\", \"namespace\": \"\", \"kind\": \"service\"}]"
          // Default kind if missing is Service and default namespace is this namespace.
          dependencies = JSON.parse(annotation(service, 'service.alpha.openshift.io/dependencies'));
        } catch(e) {
          Logger.warn('Could not pase "service.alpha.openshift.io/dependencies" annotation', e);
          return;
        }

        dependentServices = _.filter(dependencies, function(dependency) {
          var kind = _.get(dependency, 'metadata.kind') || 'Service',
              namespace = _.get(dependency, 'metadata.namespace') || $scope.projectName;
          return _.has(dependency, 'metadata.name') && kind === 'Service' && namespace === $scope.projectName;
        });

        // Add each child service to our dependency map.
        _.each(dependentServices, function(dependency) {
          addChildService(serviceName, dependency.metadata.name);
        });
      });
    };

    var isIncompleteBuild = $filter('isIncompleteBuild');
    var buildConfigForBuild = $filter('buildConfigForBuild');
    var groupPipelines = function() {
      if (!builds) {
        return;
      }

      var pipelinesByJenkinsURI = {};
      $scope.pipelinesByDeployment = {};
      $scope.runningPipelinesByDC = {};

      _.each(builds, function(build) {
        var jenkinsURI, bc, dc;
        if (!isJenkinsPipelineStrategy(build)) {
          return;
        }

        // Index pipelines by Jenkins URI first so we can find them quickly later.
        jenkinsURI = annotation(build, 'openshift.io/jenkins-build-uri');
        if (jenkinsURI) {
          pipelinesByJenkinsURI[jenkinsURI] = build;
        }

        // Index running pipelines by DC so that we can show them before a deployment has started.
        if (buildConfigs && isIncompleteBuild(build)) {
          bc = buildConfigs[buildConfigForBuild(build)];
          dc = annotation(bc, 'openshift.io/deployment-config') || '';
          $scope.runningPipelinesByDC[dc] = $scope.runningPipelinesByDC[dc] || [];
          $scope.runningPipelinesByDC[dc].push(build);
        }
      });

      // TODO: Update with real property when available, rather than temp annotation.
      // Find matching pipeline builds for each deployment.
      _.each(deployments, function(rc) {
        var jenkinsBuildURI = annotation(rc, 'openshift.io/jenkins-build-uri');
        if (!jenkinsBuildURI) {
          return;
        }

        // Normalize the URI to match the annotation from the Jenkins sync plugin.
        // substring(1) to remove leading slash
        jenkinsBuildURI = URI(jenkinsBuildURI).path().substring(1);
        $scope.pipelinesByDeployment[rc.metadata.name] = pipelinesByJenkinsURI[jenkinsBuildURI];

        // FIXME: Handle this more cleanly. Just remove the item from the
        // running array for now since we show it in the view with the
        // deployment.
        var runningPipelines = $scope.runningPipelinesByDC[annotation(rc, 'deploymentConfig')];
        _.remove(runningPipelines, function(pipeline) {
          return annotation(pipeline, 'openshift.io/jenkins-build-uri') === jenkinsBuildURI;
        });
      });
    };

    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        $scope.project = project;

        watches.push(DataService.watch("pods", context, function(podsData) {
          pods = podsData.by("metadata.name");
          groupPods();
          Logger.log("pods", pods);
        }));

        watches.push(DataService.watch("services", context, function(serviceData) {
          $scope.services = services = serviceData.by("metadata.name");
          groupServices();
          Logger.log("services (list)", services);
        }));

        watches.push(DataService.watch("builds", context, function(buildData) {
          builds = buildData.by("metadata.name");
          groupPipelines();
          Logger.log("builds (list)", builds);
        }));

        watches.push(DataService.watch("buildConfigs", context, function(buildConfigData) {
          buildConfigs = buildConfigData.by("metadata.name");
          groupPipelines();
          Logger.log("builds (list)", builds);
        }));

        watches.push(DataService.watch("routes", context, function(routesData) {
          var routes = routesData.by("metadata.name");
          $scope.routesByService = RoutesService.groupByService(routes);
          Logger.log("routes (subscribe)", $scope.routesByService);
        }));

        // Sets up subscription for deployments
        watches.push(DataService.watch("replicationcontrollers", context, function(rcData) {
          deployments = rcData.by("metadata.name");
          groupReplicationControllers();
          groupPods();
          groupPipelines();
          Logger.log("replicationcontrollers (subscribe)", deployments);
        }));

        // Sets up subscription for deploymentConfigs, associates builds to triggers on deploymentConfigs
        watches.push(DataService.watch("deploymentconfigs", context, function(dcData) {
          deploymentConfigs = dcData.by("metadata.name");
          groupDeploymentConfigs();
          Logger.log("deploymentconfigs (subscribe)", $scope.deploymentConfigs);
        }));

        $scope.$on('$destroy', function(){
          DataService.unwatchAll(watches);
        });
      }));
  });
