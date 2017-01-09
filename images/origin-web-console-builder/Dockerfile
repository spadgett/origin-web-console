# Adds some additional dependencies to the nodejs S2I builder so that the console integration tests
# can be run against any openshift console (server must have auth set to AllowAllPasswordIdentityProvider)
FROM centos/httpd-24-centos7

# Install inotify-tools, which lets us watch for extension file changes.
RUN yum install -y --setopt=tsflags=nodocs inotify-tools && yum clean all

USER 1001
