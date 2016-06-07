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
    $scope.renderOptions = $scope.renderOptions || {};
    $scope.renderOptions.showGetStarted = false;
    
    var watches = [];
    var routes, services, deploymentConfigs, deployments, pods, buildConfigs, builds, horizontalPodAutoscalers, hpaByDC, hpaByRC;

    var isJenkinsPipelineStrategy = $filter('isJenkinsPipelineStrategy');
    var annotation = $filter('annotation');
    var label = $filter('label');
    var hashSize = $filter('hashSize');

    var groupRoutes = function() {
      $scope.routesByService = RoutesService.groupByService(routes);
    };

    var groupDeploymentConfigs = function() {
      if (!services || !deploymentConfigs) {
        return;
      }

      $scope.deploymentConfigsByService = DeploymentsService.groupByService(deploymentConfigs, services);
    };

    var groupDeploymentsByDC = function() {
      if (!deployments) {
        return;
      }
      
      $scope.deploymentsByDeploymentConfig = DeploymentsService.groupByDeploymentConfig(deployments);
    };

    var groupDeployments = function() {
      if (!services || !deployments) {
        return;
      }

      $scope.deploymentsByService = DeploymentsService.groupByService(deployments, services);
      groupDeploymentsByDC();
      // Only the most recent in progress or complete deployment for a given
      // deployment config is scalable in the overview.
      var scalableDeploymentByConfig = {};
      _.each($scope.deploymentsByDeploymentConfig, function(deployments, dcName) {
        scalableDeploymentByConfig[dcName] = DeploymentsService.getActiveDeployment(deployments);
      });
      $scope.scalableDeploymentByConfig = scalableDeploymentByConfig;
    };

    var groupHPAs = function() {
      hpaByDC = {};
      hpaByRC = {};
      angular.forEach(horizontalPodAutoscalers, function(hpa) {
        var name = hpa.spec.scaleRef.name, kind = hpa.spec.scaleRef.kind;
        if (!name || !kind) {
          return;
        }

        switch (kind) {
        case "DeploymentConfig":
          hpaByDC[name] = hpaByDC[name] || [];
          hpaByDC[name].push(hpa);
          break;
        case "ReplicationController":
          hpaByRC[name] = hpaByRC[name] || [];
          hpaByRC[name].push(hpa);
          break;
        default:
          Logger.warn("Unexpected HPA scaleRef kind", kind);
        }
      });
      $scope.hpaByDC = hpaByDC;
      $scope.hpaByRC = hpaByRC;
    };

    // Filter out monopods we know we don't want to see
    var showMonopod = function(pod) {
      // Hide pods in the Succeeded, Terminated, and Failed phases since these
      // are run once pods that are done.
      if (pod.status.phase === 'Succeeded' ||
          pod.status.phase === 'Terminated' ||
          pod.status.phase === 'Failed') {
        // TODO we may want to show pods for X amount of time after they have completed
        return false;
      }

      // Hide our deployer pods since it is obvious the deployment is
      // happening when the new deployment appears.
      if (label(pod, "openshift.io/deployer-pod-for.name")) {
        return false;
      }

      // Hide our build pods since we are already showing details for
      // currently running or recently run builds under the appropriate
      // areas.
      if (annotation(pod, "openshift.io/build.name")) {
        return false;
      }

      return true;
    };

    var groupPods = function() {
      if (!pods || !deployments) {
        return;
      }

      $scope.podsByDeployment = PodsService.groupByReplicationController(pods, deployments);
      $scope.monopodsByService = PodsService.groupByService($scope.podsByDeployment[''], services, showMonopod);
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

    var updateRouteWarnings = function() {
      if (!services || !routes) {
        return;
      }

      $scope.routeWarningsByService = {};
      _.each(services, function(service) {
        _.each($scope.routesByService[service.metadata.name], function(route) {
          var warnings = RoutesService.getRouteWarnings(route, service);
          _.set($scope, ['routeWarningsByService', service.metadata.name, route.metadata.name], warnings);
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

      // Find matching pipeline builds for each deployment.
      // _.each(deployments, function(rc) {
      //   var jenkinsBuildURI = annotation(rc, 'openshift.io/jenkins-build-uri');
      //   if (!jenkinsBuildURI) {
      //     return;
      //   }

      //   // Normalize the URI to match the annotation from the Jenkins sync plugin.
      //   // substring(1) to remove leading slash
      //   jenkinsBuildURI = URI(jenkinsBuildURI).path().substring(1);
      //   $scope.pipelinesByDeployment[rc.metadata.name] = pipelinesByJenkinsURI[jenkinsBuildURI];
      // });
    };
       
    // Show the "Get Started" message if the project is empty.
    // TODO copied from old overview, do we want to adust this at all based on our new grouping logic?
    var updateShowGetStarted = function() {
      var projectEmpty =
        hashSize(services) === 0 &&
        hashSize(pods) === 0 &&
        hashSize(deployments) === 0 &&
        hashSize(deploymentConfigs) === 0 &&
        hashSize(builds) === 0;

      $scope.renderOptions.showGetStarted = projectEmpty;
    };
       
    ProjectsService
      .get($routeParams.project)
      .then(_.spread(function(project, context) {
        $scope.project = project;

        watches.push(DataService.watch("pods", context, function(podsData) {
          pods = podsData.by("metadata.name");
          groupPods();
          updateShowGetStarted();
          Logger.log("pods", pods);
        }));

        watches.push(DataService.watch("services", context, function(serviceData) {
          $scope.services = services = serviceData.by("metadata.name");
          groupServices();
          groupPods();
          groupDeploymentConfigs();
          groupDeployments();
          updateRouteWarnings();
          updateShowGetStarted();
          Logger.log("services (list)", services);
        }));

        watches.push(DataService.watch("builds", context, function(buildData) {
          builds = buildData.by("metadata.name");
          groupPipelines();
          updateShowGetStarted();
          Logger.log("builds (list)", builds);
        }));

        watches.push(DataService.watch("buildConfigs", context, function(buildConfigData) {
          buildConfigs = buildConfigData.by("metadata.name");
          groupPipelines();
          Logger.log("builds (list)", builds);
        }));

        watches.push(DataService.watch("routes", context, function(routesData) {
          routes = routesData.by("metadata.name");
          groupRoutes();
          updateRouteWarnings();
          Logger.log("routes (subscribe)", $scope.routesByService);
        }));

        // Sets up subscription for deployments
        watches.push(DataService.watch("replicationcontrollers", context, function(rcData) {
          deployments = rcData.by("metadata.name");
          groupDeployments();
          groupPods();
          groupPipelines();
          updateShowGetStarted();
          Logger.log("replicationcontrollers (subscribe)", deployments);
        }));

        // Sets up subscription for deploymentConfigs, associates builds to triggers on deploymentConfigs
        watches.push(DataService.watch("deploymentconfigs", context, function(dcData) {
          deploymentConfigs = dcData.by("metadata.name");
          groupDeploymentConfigs();
          updateShowGetStarted();
          Logger.log("deploymentconfigs (subscribe)", $scope.deploymentConfigs);
        }));

        watches.push(DataService.watch({
          group: "extensions",
          resource: "horizontalpodautoscalers"
        }, context, function(hpaData) {
          horizontalPodAutoscalers = hpaData.by("metadata.name"); 
          groupHPAs();
        }));

        // List limit ranges in this project to determine if there is a default
        // CPU request for autoscaling.
        DataService.list("limitranges", context, function(response) {
          $scope.limitRanges = response.by("metadata.name");
        });

        $scope.$on('$destroy', function(){
          DataService.unwatchAll(watches);
        });
      }));
  });
