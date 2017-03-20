/*
 * This is an empty extensions script file. Extensions scripts are loaded by
 * the Web Console when set in assetConfig in master-config.yaml. For example,
 *
 * assetConfig:
 *  extensionScripts:
 *   - "/home/vagrant/extensions/java/js/javaLink.js"
 *   - "/home/vagrant/extensions/extension2/js/ext2.js"
 *
 * You can modify this file to test extensions in a development environment.
 */
angular.module('openshiftConsole')
  .run(function($rootScope, $compile, $routeParams, $timeout) {
    $rootScope.$on('$viewContentLoaded', function() {
      if ($routeParams.view === 'chromeless') {
        $timeout(function() {
          $('.navbar').css('margin-top', '0');
        });
        return;
      }
      $('.top-header').before($compile('<div id="custom-header" class="custom-header"></div>')($rootScope));
    });
  })
  .directive('customHeader', function() {
    return {
      restrict: 'C',
      template: '<div>Hello World</div>'
    };
  });
