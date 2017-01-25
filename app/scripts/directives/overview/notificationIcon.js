'use strict';

angular.module('openshiftConsole').component('notificationIcon', {
  controller: NotificationIcon,
  controllerAs: 'notification',
  bindings: {
    alerts: '<'
  },
  templateUrl: 'views/overview/_notification-icon.html'
});

function NotificationIcon($scope) {
  var notification = this;
  notification.$onChanges = _.debounce(function() {
    $scope.$apply(function() {
      var byType = _.groupBy(notification.alerts, 'type');
      notification.byType = _.mapValues(byType, function(alerts) {
        return _.map(alerts, function(alert) {
          return _.escape(alert.message);
        }).join('<br>');
      });
    });
  }, 200);
}
