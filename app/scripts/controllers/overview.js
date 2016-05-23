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
                        RoutesService,
                        ServicesService) {
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
        var dependentServices = ServicesService.getDependentServices(service);
        // Add each child service to our dependency map.
        _.each(dependentServices, function(dependency) {
          addChildService(serviceName, dependency);
        });
      });
    };

    var isRecentBuild = $filter('isRecentBuild');
    var buildConfigForBuild = $filter('buildConfigForBuild');
    var groupPipelines = function() {
      if (!builds) {
        return;
      }

      var pipelinesByJenkinsURI = {};
      $scope.pipelinesByDeployment = {};
      $scope.recentPipelinesByDC = {};

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
        if (buildConfigs && isRecentBuild(build)) {
          bc = buildConfigs[buildConfigForBuild(build)];
          dc = annotation(bc, 'openshift.io/deployment-config') || '';
          $scope.recentPipelinesByDC[dc] = $scope.recentPipelinesByDC[dc] || [];
          $scope.recentPipelinesByDC[dc].push(build);
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
        // recent array for now since we show it in the view with the
        // deployment.
        var recentPipelines = $scope.recentPipelinesByDC[annotation(rc, 'deploymentConfig')];
        _.remove(recentPipelines, function(pipeline) {
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
