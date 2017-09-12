'use strict';

var EC = protractor.ExpectedConditions;

var commonTeardown = function() {
  browser.executeScript('window.sessionStorage.clear();');
  browser.executeScript('window.localStorage.clear();');
};
exports.commonTeardown = commonTeardown;

exports.commonSetup = function() {
  // Want a longer browser size since the screenshot reporter only grabs the visible window
  browser.driver.manage().window().setSize(1024, 2048);
};

exports.afterAllTeardown = function() {
  commonTeardown();
  browser.driver.sleep(1000);
};

exports.login = function(loginPageAlreadyLoaded) {
  // The login page doesn't use angular, so we have to use the underlying WebDriver instance
  var driver = browser.driver;
  if (!loginPageAlreadyLoaded) {
    browser.get('/');
    browser.driver.wait(function() {
      return browser.driver.getCurrentUrl().then(function(url) {
        return /login/.test(url);
      });
    }, 3000);
  }

  // Workaround error with Firefox 53+ and sendKeys
  // https://github.com/mozilla/geckodriver/issues/659
  // TODO: We need to upgrade geckodriver, but that requires a newer Selenium
  // and bumping many other dependencies.
  browser.executeScript('document.getElementById("inputUsername").value = "e2e-user";');
  browser.executeScript('document.getElementById("inputPassword").value = "e2e-user";');
  // driver.findElement(by.name("username")).sendKeys("e2e-user");
  // driver.findElement(by.name("password")).sendKeys("e2e-user");
  driver.findElement(by.css("button[type='submit']")).click();

  driver.wait(function() {
    return driver.isElementPresent(by.css(".navbar-iconic .username"));
  }, 5000);
};

exports.clickAndGo = function(buttonText, uri) {
  var button = element(by.buttonText(buttonText));
  browser.wait(EC.elementToBeClickable(button), 2000);
  button.click().then(function() {
    return browser.getCurrentUrl().then(function(url) {
      return url.indexOf(uri) > -1;
    });
  });
};

var waitForUri = function(expectedUri) {
  let actualUrl;
  return browser.wait(() => {
    return browser.getCurrentUrl().then((url) => {
      actualUrl = url;
      return actualUrl.indexOf(expectedUri) > -1;
    });
  }, 5000, "URL hasn't changed to " + expectedUri + '(is currently: ' + actualUrl + ')');
};
exports.waitForUri = waitForUri;

// elem is a single protractor ElementFinder, such as: `element(by.css('.foo'))`
// not an ElementArrayFinder, this will not work: `element.all(by.css('.foo'))`
// example:
//  waitForElement(element(by.css('.foo')));  // success
//  waitForElement(element.all(by.css('.foos')));  // fail, incorrect element.all
var waitForElem = function(elem, timeout) {
  return browser.wait(EC.presenceOf(elem), timeout || 5000, 'Element not found: ' + elem.locator().toString());
};
exports.waitForElem = waitForElem;

var waitForElemRemoval = function(elem, timeout) {
  return browser.wait(EC.not(EC.presenceOf(elem)), timeout || 5000, 'Element did not disappear');
};
exports.waitForElemRemoval = waitForElemRemoval;

// an alt to waitForElem()
// waitForElem() does not use protractor.ExpectConditions, which can occasionally flake
exports.waitForPresence = function(selector, elementText, timeout, callback) {
  if (!timeout) { timeout = 5000; }
  var el;
  if (elementText) {
    el = element(by.cssContainingText(selector, elementText));
  }
  else {
    el = element(by.css(selector));
  }
  browser
    .wait(EC.presenceOf(el), timeout, "Element not found: " + selector)
    .then(function() {
      if(callback) {
        callback();
      }
    });
};

exports.goToPage = function(uri) {
  return browser.get(uri).then(() => {
    return waitForUri(uri);
  });
};

exports.presenceOf = function(obj) {
  return EC.presenceOf(obj);
};

// example:
//  h.waitFor(h.presenceOf(page.header()))
exports.waitFor = function(item, timeout, msg) {
  timeout = timeout || 5000;
  msg = msg || '';
  return browser.wait(item, timeout, msg);
};

exports.setInputValue = function(name, value) {
  var input = element(by.model(name));
  waitForElem(input);
  input.clear();
  // Workaround error with Firefox 53+ and sendKeys
  // https://github.com/mozilla/geckodriver/issues/659
  // TODO: We need to upgrade geckodriver, but that requires a newer Selenium
  // and bumping many other dependencies.
  // Assumes name and value don't have special characters.
  browser.executeScript("$('input[name=\"" + name + "\"').val('" + value + "').trigger('change');");
  //input.sendKeys(value);
  // expect(input.getAttribute("value")).toBe(value);
  return input;
};
