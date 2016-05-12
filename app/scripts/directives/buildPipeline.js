"use strict";

angular.module('openshiftConsole')
  .directive('buildPipeline', function(/* Logger */) {
    return {
      restrict: 'E',
      scope: {
        build: '=',
        showConfigName: '='
      },
      templateUrl: 'views/directives/build-pipeline.html',
      link: function($scope) {
        // Example JSON:
        //   https://github.com/jenkinsci/pipeline-stage-view-plugin/tree/master/rest-api#get-jobjob-namerun-idwfapidescribe
        // $scope.$watch('metadata.annotations["openshift.io/jenkins-status-json"]', function(value) {
        //   try {
        //     $scope.jenkinsStatus = JSON.parse(value);
        //   } catch (e) {
        //     Logger.error('Could not parse Jenkins status as JSON', value);
        //   }
        // });

	// TODO: remove before merging! -- test data
	$scope.jenkinsStatus = {
	  "_links": {
	    "self": {
	      "href": "/jenkins/job/Test%20Workflow/16/wfapi/describe"
	    },
	    "pendingInputActions": {
	      "href": "/jenkins/job/Test%20Workflow/16/wfapi/pendingInputActions"
	    }
	  },
	  "id": "2014-10-16_13-07-52",
	  "name": "#16",
	  "status": "PAUSED_PENDING_INPUT",
	  "startTimeMillis": 1413461275770,
	  "endTimeMillis": 1413461285999,
	  "durationMillis": 10229,
	  "stages": [
	    {
	      "_links": {
		"self": {
		  "href": "/jenkins/job/Test%20Workflow/16/execution/node/5/wfapi/describe"
		}
	      },
	      "id": "5",
	      "name": "Build",
	      "status": "SUCCESS",
	      "startTimeMillis": 1413461275770,
	      "durationMillis": 5228
	    },
	    {
	      "_links": {
		"self": {
		  "href": "/jenkins/job/Test%20Workflow/16/execution/node/8/wfapi/describe"
		}
	      },
	      "id": "8",
	      "name": "Test",
	      "status": "SUCCESS",
	      "startTimeMillis": 1413461280998,
	      "durationMillis": 4994
	    },
	    {
	      "_links": {
		"self": {
		  "href": "/jenkins/job/Test%20Workflow/16/execution/node/10/wfapi/describe"
		}
	      },
	      "id": "10",
	      "name": "Deploy",
	      "status": "PAUSED_PENDING_INPUT",
	      // "status": "ABORTED",
	      // "status": "NOT_EXECUTED",
	      // "status": "IN_PROGRESS",
	      "startTimeMillis": 1413461285992,
	      "durationMillis": 7
	    }
	  ]
	};
      }
    };
  })
  .directive('pipelineStatus', function() {
    return {
      restrict: 'E',
      scope: {
        status: '='
      },
      templateUrl: 'views/directives/pipeline-status.html'
    };
  });
