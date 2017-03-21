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
    // Wait for the view content to load before adding the custom header.
    $rootScope.$on('$viewContentLoaded', function() {
      // Don't show the header for chromeless logs.
      if ($routeParams.view === 'chromeless') {
        $timeout(function() {
          $('.navbar').css('margin-top', '0');
        });
        return;
      }

      // Add the custom header above the top header element.
      var scope = $rootScope.$new();
      $('.top-header').before($compile('<div id="custom-header" class="custom-header navbar-default" role="navigation"></div>')(scope));
    });
  })
  .directive('customHeader', function() {
    return {
      restrict: 'C',
      template: '<div>Custom Header</div>'
    };
  });
