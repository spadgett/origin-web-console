'use strict';

angular.module('openshiftConsole').component('metricsSummary', {
  controller: MetricsSummary,
  controllerAs: 'metricsSummary',
  bindings: {
    pods: '<',
    // Take in the list of containers rather than reading from the pod spec
    // in case pods is empty.
    containers: '<',
  },
  templateUrl: 'views/overview/_metrics-summary.html'
});

function MetricsSummary($interval,
                        ConversionService,
                        MetricsCharts,
                        MetricsService) {
  var metricsSummary = this;

  // TODO: Move to MetricsCharts ?
  // Should we display the current usage as GiB when showing compact metrics?
  var displayAsGiB = function(usageInMiB) {
    return usageInMiB >= 1024;
  };

  metricsSummary.metrics = [{
    label: 'Memory',
    convert: ConversionService.bytesToMiB,
    formatUsage: function(value) {
      if (displayAsGiB(value)) {
        value = value / 1024;
      }
      return MetricsCharts.formatUsage(value);
    },
    usageUnits: function(value) {
      return displayAsGiB(value) ? 'GiB' : 'MiB';
    },
    datasets: [ 'memory/usage' ],
    type: 'pod_container'
  }, {
    label: "CPU",
    convert: ConversionService.millicoresToCores,
    formatUsage: MetricsCharts.formatUsage,
    usageUnits: function() {
      return 'cores';
    },
    datasets: [ 'cpu/usage_rate' ],
    type: 'pod_container'
  }, {
    label: "Network",
    units: "KiB/s",
    convert: ConversionService.bytesToKiB,
    formatUsage: MetricsCharts.formatUsage,
    usageUnits: function() {
      return 'KiB/s';
    },
    datasets: [ 'network/tx_rate', 'network/rx_rate' ],
    type: 'pod',
  }];

  var getConfig = function() {
    var pod = _.find(metricsSummary.pods, 'metadata.namespace');
    if (!pod) {
      return null;
    }

    var config = {
      pods: metricsSummary.pods,
      containerName: _.head(pod.spec.containers).name,
      namespace: pod.metadata.namespace,
      start: '-1mn',
      bucketDuration: '1mn'
    };

    return config;
  };

  var isNil = function(point) {
    return point.value === null || point.value === undefined;
  };

  var calculateUsage = function(metric, data) {
    var total = null;
    var hasData = {};
    _.each(metric.datasets, function(descriptor) {
      _.each(data[descriptor], function(podData, podName) {
        var point = _.last(podData);
        if (isNil(point)) {
          return;
        }

        hasData[podName] = true;
        var value = metric.convert(point.value);
        total = (total || 0) + value;
      });
    });

    if (total === null) {
      delete metric.currentUsage;
    } else {
      metric.currentUsage = total / _.size(hasData);
    }
  };

  var processData = function(data) {
    _.each(metricsSummary.metrics, function(metric) {
      calculateUsage(metric, data);
    });
  };

  var metricsFailed = function() {
    metricsSummary.error = true;
  };

  var update = function() {
    if (metricsSummary.error) {
      return;
    }

    var config = getConfig();
    if (!config) {
      return;
    }

    MetricsService.getPodMetrics(config).then(processData, metricsFailed);
  };

  var intervalPromise;
  metricsSummary.$onInit = function() {
    intervalPromise = $interval(update, MetricsCharts.getDefaultUpdateInterval(), false);
    update();
  };

  metricsSummary.$onDestroy = function() {
    if (intervalPromise) {
      $interval.cancel(intervalPromise);
      intervalPromise = null;
    }
  };
}
