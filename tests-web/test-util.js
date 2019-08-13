// BROWSER = firefox | chrome
// BROWSER_BINARY
// BASE_URL
// SHOW_BROWSER = true | false

var assert = require("assert");
var webdriver = require("selenium-webdriver");
var seleniumChrome = require("selenium-webdriver/chrome");
var fs = require("fs");
const jsesc = require("jsesc");
const ffdriver = require('geckodriver');
const chromedriver = require('chromedriver');

let kindFF = "firefox";
let kindChrome = "chrome";

// Used by Travis
let BROWSER;
if (process.env.BROWSER) {
  BROWSER = process.env.BROWSER;
  if (BROWSER !== kindFF && BROWSER !== kindChrome) {
    throw `Unknown browser: ${BROWSER}. Set BROWSER to either \"${kindFF}\" or \"${kindChrome}\"`
  }
} else {
  throw `Set BROWSER to either \"${kindFF}\" or \"${kindChrome}\"`
}

// Used by Travis
let PATH_TO_BROWSER;
if (process.env.BROWSER_BINARY) {
  PATH_TO_BROWSER = process.env.BROWSER_BINARY;
} else {
  throw "Set BROWSER_BINARY to the path to your browser install";
}

let BASE_URL;
if (process.env.BASE_URL) {
  BASE_URL = process.env.BASE_URL;
} else {
  throw "Set BASE_URL to be the root of the compiler directory";
}

let leave_open = process.env.LEAVE_OPEN === "true" || false;

var chromeOptions = new seleniumChrome
  .Options();
if (process.env.SHOW_BROWSER === "false") {
  chromeOptions = chromeOptions.headless();
}

if(!process.env.SHOW_BROWSER) {
  console.log("Running headless (may not work with Firefox). You can set SHOW_BROWSER=true to see what's going on");
}

let args = [];
const ffCapabilities = webdriver.Capabilities.firefox();
ffCapabilities.set('moz:firefoxOptions', {
  binary: PATH_TO_BROWSER,
  'args': args
});

// Working from https://developers.google.com/web/updates/2017/04/headless-chrome#drivers
const chromeCapabilities = webdriver.Capabilities.chrome();
chromeCapabilities.set('chromeOptions', {
  binary: PATH_TO_BROWSER,
});

const INPUT_ID = "program";
const COMPILE_RUN_BUTTON = "compileRun";
const TYPE_CHECK_CHECKBOX = "typeCheck";
const CLEAR_LOGS = "clearLogs";

function setup() {

  let driver;
  if (BROWSER === kindFF) {
    driver = new webdriver.Builder()
      .forBrowser("firefox")
      .withCapabilities(ffCapabilities)
      .build();
  } else if (BROWSER === kindChrome) {
    driver = new webdriver.Builder()
      .forBrowser("chrome")
      .setChromeOptions(chromeOptions)
      .withCapabilities(chromeCapabilities)
      .build();
  } else {
    throw `Unknown browser: ${BROWSER}`;
  }

  return {
    driver: driver,
    baseURL: BASE_URL,
  };
}

function beginSetInputText(driver, unescapedInput) {
  // TODO(alex): Find a way to properly escape
  let escapedInput = jsesc(unescapedInput, {quotes: "double"});
  return driver.executeScript(
    "document.getElementById(\"" + INPUT_ID + "\").value = \"" + escapedInput + "\";"
  );
}

async function clearLogs(driver) {
  let clearButton = await driver.findElement({ id: CLEAR_LOGS });
  await clearButton.click();
}

async function compileRun(driver, options) {
  if (options["type-check"] === false) {
    let tc = await driver.findElement({ id: TYPE_CHECK_CHECKBOX });
    if (tc.isSelected()) {
      await tc.click();
    }
  }
  let runButton = await driver.findElement({ id: COMPILE_RUN_BUTTON });
  await runButton.click();
}

async function pyretCompilerLoaded(driver, timeout) {
  let cl = await driver.findElement({ id: "consoleList" });

  let result = await driver.wait(async () => {
    let innerHTML = await cl.getAttribute("innerHTML");
    let index = innerHTML.search(/Worker setup done/);
    return index !== -1;
  }, timeout);

  return result;
}

async function searchForRunningOutput(driver, toSearch, timeout) {
  let cl = await driver.findElement({ id: "consoleList" });

  try {
    let result = await driver.wait(async () => {
      let innerHTML = await cl.getAttribute("innerHTML");
      let runningIndex = innerHTML.search(/Running/);
      
      if (runningIndex !== -1) {
        let toSearchIndex = innerHTML.substring(runningIndex).includes(toSearch);
        return toSearchIndex !== -1;
      } else {
        return false;
      }
    }, timeout);

    return result === null ? false : result;
  } catch (error) {
    return false;
  }
};

async function searchOutput(driver, pattern) {
  let cl = await driver.findElement({ id: "consoleList" });
  let innerHTML = await cl.getAttribute("innerHTML");

  // -1 if pattern not found
  return innerHTML.search(pattern);
}

function prepareExpectedOutput(rawExpectedOutput) {
  // TODO(alex): Remove leading '###' and trim
  return rawExpectedOutput;
}

function teardown(browser, done) {
  if(!leave_open) {
    return browser.quit().then(done);
  }

  return done;
}

module.exports = {
  pyretCompilerLoaded: pyretCompilerLoaded,
  setup: setup,
  teardown: teardown,
  beginSetInputText: beginSetInputText,
  compileRun: compileRun,
  searchOutput: searchOutput,
  searchForRunningOutput: searchForRunningOutput,
};
