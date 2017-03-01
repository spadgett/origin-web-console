'use strict';

// TODO: Rename controller when old overview is removed.
angular.module('openshiftConsole').controller('NewOverviewController', OverviewController);

function OverviewController($scope,
                            $filter,
                            $routeParams,
                            AlertMessageService,
                            AppsService,
                            BuildsService,
                            Constants,
                            DataService,
                            DeploymentsService,
                            ImageStreamResolver,
                            KeywordService,
                            LabelFilter,
                            LabelsService,
                            Logger,
                            MetricsService,
                            Navigate,
                            ProjectsService,
                            ResourceAlertsService,
                            RoutesService) {
  var overview = this;
  var limitWatches = $filter('isIE')() || $filter('isEdge')();
  var DEFAULT_POLL_INTERVAL = 60 * 1000; // milliseconds

  $scope.projectName = $routeParams.project;

  // Filters used by this controller.
  var annotation = $filter('annotation');
  var buildConfigForBuild = $filter('buildConfigForBuild');
  var deploymentIsInProgress = $filter('deploymentIsInProgress');
  var imageObjectRef = $filter('imageObjectRef');
  var isJenkinsPipelineStrategy = $filter('isJenkinsPipelineStrategy');
  var isNewerResource = $filter('isNewerResource');
  var label = $filter('label');
  var orderObjectsByDate = $filter('orderObjectsByDate');
  var getPodTemplate = $filter('podTemplate');

  var imageStreams;
  var labelSuggestions = {};
  var mostRecentByDC = {};

  // `overview.state` tracks common state that is shared by overview and
  // `overview-list-row`. This avoids having to the same values as attributes
  // again and again for different types, but lets us update these maps in one
  // place as needed from watch callbacks here in the overview controller.
  //
  // NOTE: Do not change or remove properties without updating overview-list-row.
  var state = overview.state = {
    alerts: {},
    builds: {},
    clusterQuotas: {},
    imageStreamImageRefByDockerReference: {},
    imagesByDockerReference: {},
    limitRanges: {},
    notificationsByObjectUID: {},
    pipelinesForDC: {},
    podsByOwnerUID: {},
    quotas: {},
    routesByService: {},
    servicesByObjectUID: {},
    // Set to true below when metrics are available.
    showMetrics: false
  };

  AlertMessageService.getAlerts().forEach(function(alert) {
    state.alerts[alert.name] = alert.data;
  });
  AlertMessageService.clearAlerts();

  overview.renderOptions = {
    showGetStarted: false,
    showLoading: true
  };

  overview.filterByOptions = [{
    id: 'name',
    label: 'Name'
  }, {
    id: 'label',
    label: 'Label'
  }];
  overview.filterBy = 'name';

  overview.viewByOptions = [{
    id: 'app',
    label: 'Application'
  }, {
    id: 'resource',
    label: 'Resource'
  }, {
    id: 'pipeline',
    label: 'Pipeline'
  }];

  // Track view-by state in localStorage.
  var viewByKey = $routeParams.project + '/view-by';
  overview.viewBy = localStorage.getItem(viewByKey) || 'app';
  $scope.$watch(function() {
    return overview.viewBy;
  },function(value){
    localStorage.setItem(viewByKey, value);
  });

  // Check if a metrics URL has been configured for overview metrics.
  // TODO: Let users disable metrics through a constant?
  MetricsService.isAvailable(true).then(function(available) {
    state.showMetrics = available;
  });

  // Show a page-level alert when we fail to connect to Hawkular metrics.
  $scope.$on('metrics-connection-failed', function(e, data) {
    var hidden = AlertMessageService.isAlertPermanentlyHidden('metrics-connection-failed');
    if (hidden || state.alerts['metrics-connection-failed']) {
      return;
    }

    state.alerts['metrics-connection-failed'] = {
      type: 'warning',
      message: 'An error occurred getting metrics.',
      links: [{
        href: data.url,
        label: 'Open Metrics URL',
        target: '_blank'
      }, {
        href: '',
        label: "Don't Show Me Again",
        onClick: function() {
          // Hide the alert on future page loads.
          AlertMessageService.permanentlyHideAlert('metrics-connection-failed');

          // Return true close the existing alert.
          return true;
        }
      }]
    };
  });

  // Set pod warnings for pods owned by `apiObject`, which can be a set like
  // a replication controller or replica set, or just a pod itself.
  //
  // Updates `state.notificationsByObjectUID`
  //   key: object UID
  //   value: alerts object
  var updatePodWarnings = function(apiObject) {
    var uid = _.get(apiObject, 'metadata.uid');
    if (!uid) {
      return null;
    }

    var pods;
    if (apiObject.kind === 'Pod') {
      pods = [apiObject];
    } else {
      pods = _.get(overview, ['state', 'podsByOwnerUID', uid]);
    }

    state.notificationsByObjectUID[uid] = ResourceAlertsService.getPodAlerts(pods, $routeParams.project);
  };

  // Set warnings for a deployment config, including warnings for any active
  // replication controllers and cancelled and failed deployments.
  //
  // Updates `state.notificationsByObjectUID`
  //   key: object UID
  //   value: alerts object
  var updateDeploymentConfigWarnings = function(deploymentConfig) {
    var notifications = {};
    var uid = _.get(deploymentConfig, 'metadata.uid');
    if (!uid) {
      return;
    }

    state.notificationsByObjectUID[uid] = {};
    var name = _.get(deploymentConfig, 'metadata.name');
    if (!name) {
      return;
    }

    var mostRecentRC = mostRecentByDC[name];
    notifications = ResourceAlertsService.getDeploymentStatusAlerts(deploymentConfig, mostRecentRC);

    var visibleReplicationControllers = _.get(overview, ['rcByDC', name]);
    _.each(visibleReplicationControllers, function(replicationController) {
      var uid = _.get(replicationController, 'metadata.uid');
      var rcNotifications = _.get(overview, ['state', 'notificationsByObjectUID', uid]);
      _.assign(notifications, rcNotifications);
    });

    state.notificationsByObjectUID[uid] = notifications;
  };

  // Update warnings for all deployment configs.
  var updateAllDeploymentConfigWarnings = function() {
    _.each(overview.deploymentConfigs, updateDeploymentConfigWarnings);
  };

  // Set warnings for a Kubernetes deployment, including any active replica sets.
  //
  // Updates `state.notificationsByObjectUID`
  //   key: object UID
  //   value: alerts object
  var updateDeploymentWarnings = function(deployment) {
    var notifications = {};
    var uid = _.get(deployment, 'metadata.uid');
    if (!uid) {
      return;
    }

    state.notificationsByObjectUID[uid] = {};
    var name = _.get(deployment, 'metadata.name');
    if (!name) {
      return;
    }

    var visibleReplicaSets = _.get(overview, ['replicaSetsByDeployment', name]);
    _.each(visibleReplicaSets, function(replicaSet) {
      var uid = _.get(replicaSet, 'metadata.uid');
      var rsNotifications = _.get(overview, ['state', 'notificationsByObjectUID', uid]);
      _.assign(notifications, rsNotifications);
    });

    state.notificationsByObjectUID[uid] = notifications;
  };

  // Update warnings for all Kubernetes deployments.
  var updateAllDeploymentWarnings = function() {
    _.each(overview.deployments, updateDeploymentWarnings);
  };

  // Update warnings for all kinds.
  var updateWarnings = _.debounce(function() {
    $scope.$apply(function() {
      _.each(overview.replicationControllers, updatePodWarnings);
      _.each(overview.replicaSets, updatePodWarnings);
      _.each(overview.statefulSets, updatePodWarnings);
      _.each(overview.monopods, updatePodWarnings);
      updateAllDeploymentConfigWarnings();
      updateAllDeploymentWarnings();
    });
  }, 500);

  // Group a collection of resources by app label. Returns a map where the key
  // is the app label value and the value is an array of object, sorted by
  // `metadata.name`.
  var groupByApp = function(collection) {
    return AppsService.groupByApp(collection, 'metadata.name');
  };

  // Group each resource kind by app and update the list of app label values.
  var updateApps = function() {
    overview.filteredDCByApp = groupByApp(overview.filteredDeploymentConfigs);
    overview.filteredRCByApp = groupByApp(overview.filteredReplicationControllers);
    overview.filteredDeploymentsByApp = groupByApp(overview.filteredDeployments);
    overview.filteredReplicaSetsByApp = groupByApp(overview.filteredReplicaSets);
    overview.filteredStatefulSetsByApp = groupByApp(overview.filteredStatefulSets);
    overview.filteredMonopodsByApp = groupByApp(overview.filteredMonopods);
    overview.apps = _.union(_.keys(overview.filteredDCByApp),
                            _.keys(overview.filteredRCByApp),
                            _.keys(overview.filteredDeploymentsByApp),
                            _.keys(overview.filteredReplicaSetsByApp),
                            _.keys(overview.filteredStatefulSetsByApp),
                            _.keys(overview.filteredMonopodsByApp));

    AppsService.sortAppNames(overview.apps);
  };

  // Update the label filter suggestions for a list of objects.
  var updateLabelSuggestions = function(objects) {
    LabelFilter.addLabelSuggestionsFromResources(objects, labelSuggestions);
    LabelFilter.setLabelSuggestions(labelSuggestions);
  };

  // Get all resources that own pods (replication controllers, replica sets,
  // and stateful sets).
  var getPodOwners = function() {
    var replicationControllers = _.toArray(overview.replicationControllers);
    var replicaSets = _.toArray(overview.replicaSets);
    var statefulSets = _.toArray(overview.statefulSets);

    return replicationControllers.concat(replicaSets, statefulSets);
  };

  // Filter out monopods we know we don't want to see.
  var showMonopod = function(pod) {
    // Hide pods in the succeeded and failed phases since these are run once
    // pods that are done.
    if (pod.status.phase === 'Succeeded' ||
        pod.status.phase === 'Failed') {
      // TODO: We may want to show pods for X amount of time after they have completed.
      return false;
    }

    // Hide our deployer pods since it is obvious the deployment is happening
    // when the new deployment appears.
    if (label(pod, "openshift.io/deployer-pod-for.name")) {
      return false;
    }

    // Hide our build pods since we are already showing details for currently
    // running or recently run builds under the appropriate areas.
    if (annotation(pod, "openshift.io/build.name")) {
      return false;
    }

    // Hide Jenkins slave pods.
    if (label(pod, "jenkins") === "slave") {
      return false;
    }

    return true;
  };

  // Group all pods by owner, tracked in the `state.podsByOwnerUID` map.
  var groupPods = function() {
    var podOwners = getPodOwners();
    state.podsByOwnerUID = LabelsService.groupBySelector(overview.pods, podOwners, { key: 'metadata.uid' });
    overview.monopods = _.filter(state.podsByOwnerUID[''], showMonopod);
  };

  // Determine if a replication controller is visible, either as part of a
  // deployment config or a standalone replication controller.
  var isReplicationControllerVisible = function(replicationController) {
    if (_.get(replicationController, 'status.replicas')) {
      return true;
    }
    var dcName = annotation(replicationController, 'deploymentConfig');
    if (!dcName) {
      return true;
    }
    return deploymentIsInProgress(replicationController);
  };

  // Get the deployment config name for a replication controller by reading the
  // "openshift.io/deployment-config.name" annotation.
  var getDeploymentConfig = function(replicationController) {
    return annotation(replicationController, 'deploymentConfig');
  };

  // Group replication controllers by deployment config and filter the visible
  // replication controllers.
  var groupReplicationControllers = function() {
    // TODO: Handle deleted deployment configs and orphaned RCs.
    var vanillaRCs = [];
    overview.rcByDC = {};
    overview.activeByDC = {};
    mostRecentByDC = {};
    _.each(overview.replicationControllers, function(replicationController) {
      var dcName = getDeploymentConfig(replicationController) || '';
      if (!dcName) {
        vanillaRCs.push(replicationController);
      }

      // Keep track of  the most recent replication controller even if not
      // visible to show failed/canceled deployment notifications.
      var mostRecent = mostRecentByDC[dcName];
      if (!mostRecent || isNewerResource(replicationController, mostRecent)) {
        mostRecentByDC[dcName] = replicationController;
      }

      if (isReplicationControllerVisible(replicationController)) {
        _.set(overview.rcByDC,
              [dcName, replicationController.metadata.name],
              replicationController);
      }
    });

    // Sort the visible replication controllers.
    _.each(overview.rcByDC, function(replicationControllers, dcName) {
      var ordered = orderObjectsByDate(replicationControllers, true);
      overview.rcByDC[dcName] = ordered;
      overview.activeByDC[dcName] = _.head(ordered);
    });
    overview.vanillaRCs = _.sortBy(vanillaRCs, 'metadata.name');

    // Since the visible replication controllers for each deployment config
    // have changed, update the deployment config warnings.
    updateAllDeploymentWarnings();
  };

  // Determine if a replica set is visible, either as part of a deployment or
  // as a standalone replica set.
  var isReplicaSetVisible = function(replicaSet, deployment) {
    // If the replica set has pods, show it.
    if (_.get(replicaSet, 'status.replicas')) {
      return true;
    }

    var revision = DeploymentsService.getRevision(replicaSet);

    // If not part of a deployment, always show the replica set.
    if (!revision) {
      return true;
    }

    // If the deployment has been deleted and the replica set has no replicas, hide it.
    // Otherwise all old replica sets for a deleted deployment will be visible.
    if (!deployment) {
      return false;
    }

    // Show the replica set if it's the latest revision.
    return DeploymentsService.getRevision(deployment) === revision;
  };

  // Sort replica sets in descending order by their revision number.
  // FIXME: This needs to treat the revisions as numbers, not strings.
  var orderByRevision = function(replicaSets) {
    return _.sortByOrder(replicaSets, [ DeploymentsService.getRevision ], [ 'desc' ]);
  };

  // Group replica sets by deployment and filter the visible replica sets.
  var groupReplicaSets = function() {
    if (!overview.replicaSets || !overview.deployments) {
      return;
    }

    overview.replicaSetsByDeployment = LabelsService.groupBySelector(overview.replicaSets, overview.deployments, { matchSelector: true });
    overview.activeByDeployment = {};

    // Sort the visible replica sets.
    _.each(overview.replicaSetsByDeployment, function(replicaSets, deploymentName) {
      if (!deploymentName) {
        return;
      }

      var deployment = overview.deployments[deploymentName];
      var visibleRelicaSets = _.filter(replicaSets, function(replicaSet) {
        return isReplicaSetVisible(replicaSet, deployment);
      });
      var ordered = orderByRevision(visibleRelicaSets);
      overview.replicaSetsByDeployment[deploymentName] = ordered;
      // TODO: Need to check if this really works for failed / canceled rollouts.
      // It might need to be reworked.
      overview.activeByDeployment[deploymentName] = _.head(ordered);
      // var deploymentRevision = DeploymentsService.getRevision(deployment);
      // overview.activeByDeployment[deploymentName] = _.find(replicaSets, function(replicaSet) {
      //   return DeploymentsService.getRevision(replicaSet) === deploymentRevision;
      // });
    });
    overview.vanillaReplicaSets = _.sortBy(overview.replicaSetsByDeployment[''], 'metadata.name');

    // FIXME: update deployment warnings?
  };

  // Find the services that direct traffic to each API object.
  //
  // Updates `state.servicesByObjectUID`
  //   key: object UID
  //   value: array of sorted services
  var selectorsByService = {};
  var updateServices = function(objects) {
    if (!objects || !overview.services) {
      return;
    }

    _.each(objects, function(object) {
      var services = [];
      var uid = _.get(object, 'metadata.uid');
      var podTemplate = getPodTemplate(object) || { metadata: { labels: {} } };
      _.each(selectorsByService, function(selector, serviceName) {
        if (selector.matches(podTemplate)) {
          services.push(overview.services[serviceName]);
        }
      });
      // TODO: Remove deleted objects from the map?
      state.servicesByObjectUID[uid] = _.sortBy(services, 'metadata.name');
    });
  };

  // Update the list of services for all API objects.
  //
  // Updates `state.servicesByObjectUID`
  //   key: object UID
  //   value: array of sorted services
  var groupServices = function() {
    if (!overview.services) {
      return;
    }

    selectorsByService = _.mapValues(overview.services, function(service) {
      return new LabelSelector(service.spec.selector);
    });

    var toUpdate = [
      overview.deploymentConfigs,
      overview.vanillaRCs,
      overview.deployments,
      overview.vanillaReplicaSets,
      overview.statefulSets,
      overview.monopods
    ];
    _.each(toUpdate, updateServices);
  };

  // Group routes by the services they route to (either as a primary service or
  // alternate backend).
  //
  // Updates `state.routesByService`
  //   key: service name
  //   value: array of routes, sorted by RoutesService.sortRoutesByScore
  //
  // TODO: Move to a service.
  var groupRoutes = function() {
    state.routesByService = {};
    var addToService = function(route, serviceName) {
      state.routesByService[serviceName] = state.routesByService[serviceName] || [];
      state.routesByService[serviceName].push(route);
    };

    _.each(overview.routes, function(route) {
      addToService(route, route.spec.to.name);
      var alternateBackends = _.get(route, 'spec.alternateBackends', []);
      _.each(alternateBackends, function(alternateBackend) {
        if (alternateBackend.kind !== 'Service') {
          return;
        }

        addToService(route, alternateBackend.name);
      });
    });

    _.mapValues(state.routesByService, RoutesService.sortRoutesByScore);
  };

  // Group HPAs by the object they scale.
  //
  // Updates `state.hpaByResource`
  //   key: hpaByResource[kind][name]
  //   value: array of HPA objects
  //
  // TODO: Move to a service.
  var groupHPAs = function() {
    state.hpaByResource = {};
    _.each(overview.horizontalPodAutoscalers, function(hpa) {
      var name = hpa.spec.scaleRef.name, kind = hpa.spec.scaleRef.kind;
      if (!name || !kind) {
        return;
      }

      // TODO: Handle groups and subresources in hpa.spec.scaleRef
      // var groupVersion = APIService.parseGroupVersion(hpa.spec.scaleRef.apiVersion) || {};
      // var group = groupVersion.group || '';
      // if (!_.has(hpaByResource, [group, kind, name])) {
      //   _.set(hpaByResource, [group, kind, name], []);
      // }
      // hpaByResource[group][kind][name].push(hpa);

      if (!_.has(state.hpaByResource, [kind, name])) {
        _.set(state.hpaByResource, [kind, name], []);
      }
      state.hpaByResource[kind][name].push(hpa);
    });
  };

  // Adds a recent pipeline build to the following maps:
  //
  // `overview.recentPipelinesByBC`
  //   key: build config name
  //   value: array of pipeline builds
  //
  // `overview.recentPipelinesByDC`
  //   key: deployment config name
  //   value: array of pipeline builds
  var groupPipelineByDC = function(build) {
    var bcName = buildConfigForBuild(build);
    var buildConfig = overview.buildConfigs[bcName];
    if (!buildConfig) {
      return;
    }

    overview.recentPipelinesByBC[bcName] = overview.recentPipelinesByBC[bcName] || [];
    overview.recentPipelinesByBC[bcName].push(build);

    // Index running pipelines by DC name.
    var dcNames = BuildsService.usesDeploymentConfigs(buildConfig);
    _.each(dcNames, function(dcName) {
      overview.recentPipelinesByDC[dcName] = overview.recentPipelinesByDC[dcName] || [];
      overview.recentPipelinesByDC[dcName].push(build);
    });
  };

  // Group build configs by their output image. This lets us match them to
  // deployment config image change triggers.
  var buildConfigsByOutputImage = {};
  var groupBuildConfigsByOutputImage = function() {
    buildConfigsByOutputImage = {};
    _.each(overview.buildConfigs, function(buildConfig) {
      var outputImage = _.get(buildConfig, 'spec.output.to');
      var ref = imageObjectRef(outputImage, buildConfig.metadata.namespace);
      buildConfigsByOutputImage[ref] = buildConfigsByOutputImage[ref] || [];
      buildConfigsByOutputImage[ref].push(buildConfig);
    });
  };

  // Find all recent builds for `deploymentConfig` from each of `buildConfigs`.
  //
  // Updates `state.recentBuildsByDeploymentConfig`
  //   key: deployment config name
  //   value: array of builds, sorted in descending order by creation date
  var updateRecentBuildsForDC = function(deploymentConfig, buildConfigs) {
    var builds = [];
    _.each(buildConfigs, function(buildConfig) {
      var recentForConfig = _.get(state, ['recentBuildsByBuildConfig', buildConfig.metadata.name], []);
      builds = builds.concat(recentForConfig);
    });

    builds = orderObjectsByDate(builds, true);
    _.set(state, ['recentBuildsByDeploymentConfig', deploymentConfig.metadata.name], builds);
  };

  // Find the build configs that relate to each deployment config.
  //
  // Find build configs that use the pipeline strategy and have a
  // "pipeline.alpha.openshift.io/uses" annotation pointing to a deployment
  // config.
  //
  // Updates `state.pipelinesForDC`
  //   key: deployment config name
  //   value: array of pipeline build configs
  //          TODO: sort by name?
  //
  // Find build configs with an output image that matches the deployment config
  // image change trigger.
  //
  // Updates `state.buildConfigsByObjectUID`
  //   key: deployment config UID
  //   value: array of build configs, sorted by name
  var groupBuildConfigsByDeploymentConfig = function() {
    // Group pipelines.
    overview.dcByPipeline = {};
    state.pipelinesForDC = {};
    _.each(overview.buildConfigs, function(buildConfig) {
      if (!isJenkinsPipelineStrategy(buildConfig)) {
        return;
      }

      // TODO: Handle other types.
      var dcNames = BuildsService.usesDeploymentConfigs(buildConfig);
      _.set(overview, ['dcByPipeline', buildConfig.metadata.name], dcNames);
      _.each(dcNames, function(dcName) {
        state.pipelinesForDC[dcName] = state.pipelinesForDC[dcName] || [];
        state.pipelinesForDC[dcName].push(buildConfig);
      });
    });

    // Group other build configs.
    state.buildConfigsByObjectUID = {};
    _.each(overview.deploymentConfigs, function(deploymentConfig) {
      var buildConfigs = [];
      var triggers = _.get(deploymentConfig, 'spec.triggers');
      _.each(triggers, function(trigger) {
        var from = _.get(trigger, 'imageChangeParams.from');
        if (!from) {
          return;
        }

        var ref = imageObjectRef(from, deploymentConfig.metadata.namespace);
        var buildConfigsForRef = buildConfigsByOutputImage[ref];
        if (!_.isEmpty(buildConfigsForRef)) {
          buildConfigs = buildConfigs.concat(buildConfigsForRef);
        }
      });

      buildConfigs = _.sortBy(buildConfigs, 'metadata.name');
      _.set(state, ['buildConfigsByObjectUID', deploymentConfig.metadata.uid], buildConfigs);
      updateRecentBuildsForDC(deploymentConfig, buildConfigs);
    });
  };

  var groupRecentBuildsByDeploymentConfig = function() {
    _.each(overview.deploymentConfigs, function(deploymentConfig) {
      var buildConfigs = _.get(state, ['buildConfigsByObjectUID', deploymentConfig.metadata.uid], []);
      updateRecentBuildsForDC(deploymentConfig, buildConfigs);
    });
  };

  var groupBuilds = function() {
    if(!state.builds || !overview.buildConfigs) {
      return;
    }
    // reset these maps
    overview.recentPipelinesByBC = {};
    overview.recentPipelinesByDC = {};
    state.recentBuildsByBuildConfig = {};
    _.each(BuildsService.interestingBuilds(state.builds), function(build) {
      var bcName = buildConfigForBuild(build);
      if(isJenkinsPipelineStrategy(build)) {
        groupPipelineByDC(build);
      } else {
        state.recentBuildsByBuildConfig[bcName] = state.recentBuildsByBuildConfig[bcName] || [];
        state.recentBuildsByBuildConfig[bcName].push(build);
      }
    });
  };

  var size = function() {
    return _.size(overview.deploymentConfigs) +
           _.size(overview.vanillaRCs) +
           _.size(overview.deployments) +
           _.size(overview.vanillaReplicaSets) +
           _.size(overview.statefulSets) +
           _.size(overview.monopods);
  };

  var filteredSize = function() {
    return _.size(overview.filteredDeploymentConfigs) +
           _.size(overview.filteredReplicationControllers) +
           _.size(overview.filteredDeployments) +
           _.size(overview.filteredReplicaSets) +
           _.size(overview.filteredStatefulSets) +
           _.size(overview.filteredMonopods);
  };

  // Show the "Get Started" message if the project is empty.
  var updateShowGetStarted = function() {
    overview.size = size();
    overview.filteredSize = filteredSize();

    // Check if there is any data visible in the overview.
    var projectEmpty = overview.size === 0;

    // Check if we've loaded the top-level items we show on the overview.
    var loaded = overview.deploymentConfigs &&
                 overview.replicationControllers &&
                 overview.deployments &&
                 overview.replicaSets &&
                 overview.statefulSets &&
                 overview.pods;

    state.expandAll = loaded && overview.size === 1;

    overview.renderOptions.showGetStarted = loaded && projectEmpty;
    overview.renderOptions.showLoading = !loaded && projectEmpty;

    overview.everythingFiltered = !projectEmpty && !overview.filteredSize;
  };

  var updateQuotaWarnings = function() {
    ResourceAlertsService.setGenericQuotaWarning(state.quotas,
                                                 state.clusterQuotaData,
                                                 $routeParams.project,
                                                 state.alerts);
  };

  var filterByLabel = function(items) {
    return LabelFilter.getLabelSelector().select(items);
  };

  var filterByName = function(items) {
    return KeywordService.filterForKeywords(items,
                                            ['metadata.name', 'metadata.labels.app'],
                                            state.filterKeywords);
  };

  var filterItems = function(items) {
    switch (overview.filterBy) {
    case 'label':
      return filterByLabel(items);
    case 'name':
      return filterByName(items);
    }

    return items;
  };

  var isFilterActive = function() {
    switch (overview.filterBy) {
    case 'label':
      return !LabelFilter.getLabelSelector().isEmpty();
    case 'name':
      return !_.isEmpty(state.filterKeywords);
    }
  };

  var updateFilter = function() {
    overview.filteredDeploymentConfigs = filterItems(overview.deploymentConfigs);
    overview.filteredReplicationControllers = filterItems(overview.vanillaRCs);
    overview.filteredDeployments = filterItems(overview.deployments);
    overview.filteredReplicaSets = filterItems(overview.vanillaReplicaSets);
    overview.filteredStatefulSets = filterItems(overview.statefulSets);
    overview.filteredMonopods = filterItems(overview.monopods);
    updateApps();

    overview.filterActive = isFilterActive();
    updateShowGetStarted();
  };

  overview.clearFilter = function() {
    LabelFilter.getLabelSelector().clearConjuncts();
    overview.filterText = '';
  };

  $scope.$watch(function() {
    return overview.filterText;
  }, _.debounce(function(text, previous) {
    if (text === previous) {
      return;
    }
    state.filterKeywords = KeywordService.generateKeywords(text);
    $scope.$apply(updateFilter);
  }, 50, { maxWait: 250 }));

  $scope.$watch(function() {
    return overview.filterBy;
  }, updateFilter);

  LabelFilter.onActiveFiltersChanged(function() {
    $scope.$apply(updateFilter);
  });

  // Return the same empty array each time to avoid triggering
  // $scope.$watch updates. Otherwise, digest loop errors occur.
  var NO_HPA = [];
  overview.getHPA = function(object) {
    if (!overview.horizontalPodAutoscalers) {
      return null;
    }

    // TODO: Handle groups and subresources
    var kind = _.get(object, 'kind'),
        name = _.get(object, 'metadata.name');
        // groupVersion = APIService.parseGroupVersion(object.apiVersion) || {},
        // group = groupVersion.group || '';
    return _.get(overview.hpaByResource, [kind, name], NO_HPA);
  };

  var watches = [];
  ProjectsService.get($routeParams.project).then(_.spread(function(project, context) {
    $scope.project = project;
    overview.projectContext = context;

    var updateReferencedImageStreams = function() {
      if (!overview.pods) {
        return;
      }

      ImageStreamResolver.fetchReferencedImageStreamImages(overview.pods,
                                                           state.imagesByDockerReference,
                                                           state.imageStreamImageRefByDockerReference,
                                                           context);
    };

    watches.push(DataService.watch("pods", context, function(podsData) {
      overview.pods = podsData.by("metadata.name");
      groupPods();
      updateReferencedImageStreams();
      updateWarnings();
      updateLabelSuggestions(overview.pods);
      updateServices(overview.monopods);
      updateFilter();
      _.each(overview.monopods, updatePodWarnings);
      Logger.log("pods (subscribe)", overview.pods);
    }));

    watches.push(DataService.watch("services", context, function(serviceData) {
      overview.services = serviceData.by("metadata.name");
      groupServices();
      Logger.log("services (subscribe)", overview.services);
    }, {poll: limitWatches, pollInterval: DEFAULT_POLL_INTERVAL}));

    watches.push(DataService.watch("builds", context, function(buildData) {
      state.builds = buildData.by("metadata.name");
      groupBuilds();
      Logger.log("builds (subscribe)", state.builds);
    }));

    watches.push(DataService.watch("buildConfigs", context, function(buildConfigData) {
      overview.buildConfigs = buildConfigData.by("metadata.name");
      groupBuildConfigsByOutputImage();
      groupBuildConfigsByDeploymentConfig();
      groupBuilds();
      Logger.log("buildconfigs (subscribe)", overview.buildConfigs);
    }, {poll: limitWatches, pollInterval: DEFAULT_POLL_INTERVAL}));

    watches.push(DataService.watch("routes", context, function(routesData) {
      overview.routes = routesData.by("metadata.name");
      groupRoutes();
      Logger.log("routes (subscribe)", overview.routes);
    }, {poll: limitWatches, pollInterval: DEFAULT_POLL_INTERVAL}));

    watches.push(DataService.watch("replicationcontrollers", context, function(rcData) {
      overview.replicationControllers = rcData.by("metadata.name");
      groupPods();
      groupReplicationControllers();
      updateLabelSuggestions(overview.replicationControllers);
      updateServices(overview.vanillaRCs);
      updateFilter();
      _.each(overview.replicationControllers, updatePodWarnings);
      Logger.log("replicationcontrollers (subscribe)", overview.replicationControllers);
    }));

    watches.push(DataService.watch("deploymentconfigs", context, function(dcData) {
      overview.deploymentConfigs = dcData.by("metadata.name");
      updateLabelSuggestions(overview.deploymentConfigs);
      updateServices(overview.deploymentConfigs);
      updateAllDeploymentWarnings();
      updateFilter();
      groupBuildConfigsByDeploymentConfig();
      groupRecentBuildsByDeploymentConfig();
      Logger.log("deploymentconfigs (subscribe)", overview.deploymentConfigs);
    }));

    watches.push(DataService.watch({
      group: "extensions",
      resource: "replicasets"
    }, context, function(replicaSetData) {
      overview.replicaSets = replicaSetData.by('metadata.name');
      groupPods();
      groupReplicaSets();
      updateServices(overview.vanillaReplicaSets);
      updateLabelSuggestions(overview.replicaSets);
      updateFilter();
      _.each(overview.replicaSets, updatePodWarnings);
      Logger.log("replicasets (subscribe)", overview.replicaSets);
    }));

    watches.push(DataService.watch({
      group: "apps",
      resource: "statefulsets"
    }, context, function(statefulSetData) {
      overview.statefulSets = statefulSetData.by('metadata.name');
      groupPods();
      updateServices(overview.monopods);
      updateLabelSuggestions(overview.statefulSets);
      updateFilter();
      Logger.log("statefulsets (subscribe)", overview.statefulSets);
    }, {poll: limitWatches, pollInterval: DEFAULT_POLL_INTERVAL}));

    watches.push(DataService.watch({
      group: "extensions",
      resource: "deployments"
    }, context, function(deploymentData) {
      overview.deployments = deploymentData.by('metadata.name');
      groupReplicaSets();
      updateServices(overview.deployments);
      updateLabelSuggestions(overview.deployments);
      updateFilter();
      Logger.log("deployments (subscribe)", overview.deployments);
    }));

    watches.push(DataService.watch({
      group: "extensions",
      resource: "horizontalpodautoscalers"
    }, context, function(hpaData) {
      overview.horizontalPodAutoscalers = hpaData.by("metadata.name");
      groupHPAs();
      Logger.log("autoscalers (subscribe)", overview.horizontalPodAutoscalers);
    }, {poll: limitWatches, pollInterval: 60 * 1000}));

    // Always poll quotas instead of watching, its not worth the overhead of maintaining websocket connections
    watches.push(DataService.watch('resourcequotas', context, function(quotaData) {
      state.quotas = quotaData.by("metadata.name");
      updateQuotaWarnings();
    }, {poll: true, pollInterval: 60 * 1000}));

    watches.push(DataService.watch('appliedclusterresourcequotas', context, function(clusterQuotaData) {
      state.clusterQuotas = clusterQuotaData.by("metadata.name");
      updateQuotaWarnings();
    }, {poll: true, pollInterval: 60 * 1000}));

    // List limit ranges in this project to determine if there is a default
    // CPU request for autoscaling.
    DataService.list("limitranges", context, function(response) {
      state.limitRanges = response.by("metadata.name");
    });

    watches.push(DataService.watch("imagestreams", context, function(imageStreamData) {
      imageStreams = imageStreamData.by("metadata.name");
      ImageStreamResolver.buildDockerRefMapForImageStreams(imageStreams,
                                                           state.imageStreamImageRefByDockerReference);
      updateReferencedImageStreams();
      Logger.log("imagestreams (subscribe)", imageStreams);
    }, {poll: limitWatches, pollInterval: 60 * 1000}));

    DataService.get("templates", Constants.SAMPLE_PIPELINE_TEMPLATE.name, {namespace: Constants.SAMPLE_PIPELINE_TEMPLATE.namespace}, { errorNotification: false }).then(
      function(template) {
        overview.samplePipelineURL = Navigate.createFromTemplateURL(template, $scope.projectName);
      });

    $scope.$on('$destroy', function(){
      DataService.unwatchAll(watches);
    });
  }));
}
