'use strict';

angular.module("openshiftConsole")
  .factory("ResourceAlertsService",
           function($filter,
                    AlertMessageService,
                    Navigate,
                    QuotaService) {
    var getGroupedPodWarnings = $filter('groupedPodWarnings');

    var alertHiddenKey = function(alertID, namespace) {
      return 'hide/alert/' + namespace + '/' + alertID;
    };

    var isAlertHidden = function(alertID, namespace) {
      var key = alertHiddenKey(alertID, namespace);
      return localStorage.getItem(key) === 'true';
    };

    var hideAlert = function(alertID, namespace) {
      var key = alertHiddenKey(alertID, namespace);
      localStorage.setItem(key, 'true');
    };

    var getPodAlerts = function(pods, namespace) {
      if (_.isEmpty(pods)) {
        return {};
      }

      var alerts = {};
      var groupedPodWarnings = getGroupedPodWarnings(pods);
      _.each(groupedPodWarnings, function(podWarnings, groupID) {
        var warning = _.head(podWarnings);
        if (!warning) {
          return;
        }

        var alertID = "pod_warning" + groupID;
        var alert = {
          type: warning.severity || 'warning',
          message: warning.message
        };

        // Handle certain warnings specially.
        switch (warning.reason) {
          case "NonZeroExit":
            // Add a View Log link for crashing containers.
            var podLink = Navigate.resourceURL(warning.pod, "Pod", namespace);
            var logLink = URI(podLink).addSearch({ tab: "logs", container: warning.container }).toString();
            alert.links = [{
              href: logLink,
              label: "View Log"
            }];
            break;

          case "NonZeroExitTerminatingPod":
            // Allow users to permanently dismiss the non-zero exit code message for terminating pods.
            if (isAlertHidden(alertID, namespace)) {
              return;
            }

            alert.links = [{
              href: "",
              label: "Don't Show Me Again",
              onClick: function() {
                // Hide the alert on future page loads.
                hideAlert(alertID, namespace);

                // Return true close the existing alert.
                return true;
              }
            }];
            break;
        }

        alerts[alertID] = alert;
      });

      return alerts;
    };

    var setGenericQuotaWarning = function(quotas, clusterQuotas, projectName, alerts) {
      var isHidden = AlertMessageService.isAlertPermanentlyHidden("overview-quota-limit-reached", projectName);
      if (!isHidden && QuotaService.isAnyQuotaExceeded(quotas, clusterQuotas)) {
        if (alerts['quotaExceeded']) {
          // Don't recreate the alert or it will reset the temporary hidden state
          return;
        }

        alerts['quotaExceeded'] = {
          type: 'warning',
          message: 'Quota limit has been reached.',
          links: [{
            href: Navigate.quotaURL(),
            label: "View Quota"
          },{
            href: "",
            label: "Don't Show Me Again",
            onClick: function() {
              // Hide the alert on future page loads.
              AlertMessageService.permanentlyHideAlert("overview-quota-limit-reached", projectName);

              // Return true close the existing alert.
              return true;
            }
          }]
        };
      }
      else {
        delete alerts['quotaExceeded'];
      }
    };

    return {
      getPodAlerts: getPodAlerts,
      setGenericQuotaWarning: setGenericQuotaWarning
    };
  });

