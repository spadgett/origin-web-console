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
      notification.countByType = _.countBy(notification.alerts, 'type');
    });
  }, 200);
}
