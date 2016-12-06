'use strict';

angular.module('openshiftConsole')
  .directive('projectMetrics',
             function($interval,
                      $parse,
                      $timeout,
                      $q,
                      $rootScope,
                      ChartsService,
                      ConversionService,
                      MetricsCharts,
                      MetricsService) {
    return {
      restrict: 'E',
      scope: {
        project: '=',
        alerts: '=?'
      },
      templateUrl: 'views/directives/project-metrics.html',
      link: function(scope) {
        var chartByMetric = {};
        var intervalPromise;
        var updateInterval = 60 * 1000; // 60 seconds
        var numDataPoints = 30;

        // Set to true when the route changes so we don't update charts that no longer exist.
        var destroyed = false;

        scope.uniqueID = MetricsCharts.uniqueID();

        var dataByMetric = {};

        // The last data point timestamp we've gotten.
        var lastTimestamp;

        // Track when we last requested metrics. When we scroll into view, this
        // helps decide whether to update immediately or wait until the next
        // interval tick.
        var lastUpdated;

        // Metrics to display.
        scope.metrics = [{
          label: "Memory",
          units: "MiB",
          convert: ConversionService.bytesToMiB,
          descriptor: 'memory/usage',
          type: 'pod_container',
          chartID: "memory-" + scope.uniqueID
        }, {
          label: "CPU",
          units: "millicores",
          descriptor: 'cpu/usage_rate',
          type: 'pod_container',
          chartID: "cpu-" + scope.uniqueID
        }, {
          label: "Network (Sent)",
          units: "KiB/s",
          convert: ConversionService.bytesToKiB,
          descriptor: 'network/tx_rate',
          type: 'pod',
          compactLabel: "Network",
          compactDatasetLabel: "Sent",
          compactType: 'spline',
          chartID: "network-tx-" + scope.uniqueID
        }, {
          label: "Network (Received)",
          units: "KiB/s",
          convert: ConversionService.bytesToKiB,
          descriptor: 'network/rx_rate',
          type: 'pod',
          compactCombineWith: 'network/tx_rate',
          compactDatasetLabel: "Received",
          compactType: 'spline',
          chartID: "network-rx-" + scope.uniqueID
        }];

        var metricByID = _.indexBy(scope.metrics, 'descriptor');

        // Set to true when any data has been loaded (or failed to load).
        scope.loaded = false;
        scope.noData = true;

        // Track the number of consecutive failures.
        var failureCount = 0;

        // Get the URL to show in error messages.
        MetricsService.getMetricsURL().then(function(url) {
          scope.metricsURL = url;
        });

        // Relative time options.
        scope.options = {
          rangeOptions: MetricsCharts.getTimeRangeOptions()
        };
        scope.options.timeRange = _.head(scope.options.rangeOptions);
        scope.options.selectedContainer = _.head(scope.containers);

        var createSparklineConfig = function(metric) {
          var config = MetricsCharts.getDefaultSparklineConfig(metric.chartID, metric.units);
          _.set(config, 'axis.x.show', false);
          _.set(config, 'axis.y.show', false);
          _.set(config, 'legend.show', false);
          _.set(config, 'size.height', 100);

          return config;
        };

        function getChartData(newData, metric) {
          updateData(metric, newData[metric.descriptor]);

          var datasets = {};
          var metricData = dataByMetric[metric.descriptor];
          datasets[metric.descriptor] = metricData;
          var chartData = MetricsCharts.getSparklineData(datasets);
          chartData.type = 'area-spline';

          // FIXME
          var dataPoints = _.last(chartData.columns);
          if (dataPoints.length > 1) {
            metric.lastValue = _.last(dataPoints) || 0;
          }

          return chartData;
        }

        function processData(newData) {
          if (destroyed) {
            return;
          }

          // Reset the number of failures on a successful request.
          failureCount = 0;

          // Iterate over each metric.
          _.each(scope.metrics, function(metric) {
            var config;
            // Get chart data for that metric.
            var chartData = getChartData(newData, metric);
            var descriptor = metric.descriptor;

            if (!chartByMetric[descriptor]) {
              config = createSparklineConfig(metric);
              config.data = chartData;
              setTimeout(function() {
                chartByMetric[descriptor] = c3.generate(config);
              });
            } else {
              chartByMetric[descriptor].load(chartData);
            }
          });
        }

        function getStartTime() {
          return "-" + scope.options.timeRange.value + "mn";
        }

        function getTimeRangeMillis() {
          return scope.options.timeRange.value * 60 * 1000;
        }

        function getBucketDuration() {
          return Math.floor(getTimeRangeMillis() / numDataPoints) + "ms";
        }

        function getConfig() {
          var config = {
            namespace: scope.project,
            bucketDuration: getBucketDuration()
          };

          // Leave the end time off to use the server's current time as the
          // end time. This prevents an issue where the donut chart shows 0
          // for current usage if the client clock is ahead of the server
          // clock.
          if (lastTimestamp) {
            config.start = lastTimestamp;
          } else {
            config.start = getStartTime();
          }

          return config;
        }

        // If the first request for metrics fails, show an empty state error message.
        // Otherwise show an alert if more than one consecutive request fails.
        function metricsFailed(response) {
          if (destroyed) {
            return;
          }

          failureCount++;
          if (scope.noData) {
            // Show an empty state message if the first request for data fails.
            scope.metricsError = {
              status:  _.get(response, 'status', 0),
              details: _.get(response, 'data.errorMsg') ||
                       _.get(response, 'statusText') ||
                       "Status code " + _.get(response, 'status', 0)
            };
            return;
          }

          // If this is the first failure and a previous request succeeded, wait and try again.
          if (failureCount < 2) {
            return;
          }

          // Show an alert if we've failed more than once.
          // Use scope.$id in the alert ID so that it is unique on pages that
          // use the directive multiple times like monitoring.
          var alertID = 'metrics-failed-' + scope.uniqueID;
          scope.alerts[alertID] = {
            type: 'error',
            message: 'An error occurred updating metrics.',
            links: [{
              href: '',
              label: 'Retry',
              onClick: function() {
                delete scope.alerts[alertID];
                // Reset failure count to 1 to trigger a retry.
                failureCount = 1;
                update();
              }
            }]
          };
        }

        function canUpdate() {
          return !scope.metricsError && failureCount < 2;
        }

        function updateData(metric, data) {
          scope.noData = false;

          // Throw out the last data point, which is a partial bucket.
          var current = _.initial(data);
          var previous = dataByMetric[metric.descriptor];
          if (!previous) {
            dataByMetric[metric.descriptor] = current;
            return;
          }

          // Don't include more than then last `numDataPoints`
          var updated = _.takeRight(previous.concat(current), numDataPoints);
          dataByMetric[metric.descriptor] = updated;
        }

        function update() {
          if (!canUpdate()) {
            return;
          }
          lastUpdated = Date.now();
          var config = getConfig();
          MetricsService.getProjectMetrics(config).then(processData, metricsFailed).finally(function() {
            // Even on errors mark metrics as loaded to replace the
            // "Loading..." message with "No metrics to display."
            scope.loaded = true;
          });
        }

        // Updates immediately and then on options changes.
        scope.$watch('options', function() {
          // Clear the data.
          dataByMetric = {};
          lastTimestamp = null;
          delete scope.metricsError;

          update();
        }, true);
        // Also update every 30 seconds.
        intervalPromise = $interval(update, updateInterval, false);

        $rootScope.$on('metrics.charts.resize', function(){
          $timeout(function() {
            _.each(chartByMetric, function(chart) {
              chart.flush();
            });
          }, 0);
        });

        scope.$on('$destroy', function() {
          if (intervalPromise) {
            $interval.cancel(intervalPromise);
            intervalPromise = null;
          }

          angular.forEach(chartByMetric, function(chart) {
            chart.destroy();
          });
          chartByMetric = null;

          destroyed = true;
        });
      }
    };
  });

