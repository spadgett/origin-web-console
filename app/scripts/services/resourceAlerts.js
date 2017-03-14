'use strict';

angular.module("openshiftConsole")
  .factory("ResourceAlertsService",
           function($filter,
                    AlertMessageService,
                    Navigate,
                    QuotaService) {
    var annotation = $filter('annotation');
    var deploymentStatus = $filter('deploymentStatus');
    var getGroupedPodWarnings = $filter('groupedPodWarnings');

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
          case "Looping":
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
            if (AlertMessageService.isAlertPermanentlyHidden(alertID, namespace)) {
              return;
            }

            alert.links = [{
              href: "",
              label: "Don't Show Me Again",
              onClick: function() {
                // Hide the alert on future page loads.
                AlertMessageService.permanentlyHideAlert(alertID, namespace);

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

    var getDeploymentStatusAlerts = function(deploymentConfig, mostRecentRC) {
      if (!deploymentConfig || !mostRecentRC) {
        return {};
      }

      var alerts = {};
      var dcName = _.get(deploymentConfig, 'metadata.name');

      // Show messages about cancelled or failed deployments.
      var logLink;
      var status = deploymentStatus(mostRecentRC);
      var version = annotation(mostRecentRC, 'deploymentVersion');
      var displayName = version ? (dcName + ' #' + version) : mostRecentRC.metadata.name;
      var rcLink = Navigate.resourceURL(mostRecentRC);
      switch (status) {
      case 'Cancelled':
        alerts[mostRecentRC.metadata.uid + '-cancelled'] = {
          type: 'info',
          message: 'Deployment ' + displayName + ' was cancelled.',
          // TODO: Add back start deployment link from previous overview (see serviceGroupNotifications.js)
          links: [{
            href: rcLink,
            label: 'View Deployment'
          }]
        };
        break;
      case 'Failed':
        logLink = URI(rcLink).addSearch({ tab: "logs" }).toString();
        alerts[mostRecentRC.metadata.uid + '-failed'] = {
          type: 'error',
          message: 'Deployment ' + displayName + ' failed.',
          reason: annotation(mostRecentRC, 'openshift.io/deployment.status-reason'),
          links: [{
            href: logLink,
            label: 'View Log'
          }, {
            // Show all events since the event might not be on the replication controller itself.
            href: 'project/' + mostRecentRC.metadata.namespace + '/browse/events',
            label: 'View Events'
          }]
        };
        break;
      }

      return alerts;
    };

    return {
      getPodAlerts: getPodAlerts,
      setGenericQuotaWarning: setGenericQuotaWarning,
      getDeploymentStatusAlerts: getDeploymentStatusAlerts
    };
  });

