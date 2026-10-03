---
name: appium
description: >-
  Appium is an open-source framework that automates native, hybrid and mobile-web apps on iOS and Android through the WebDriver protocol. Use when the user wants to set up Appium 3, write mobile UI tests in JavaScript (WebdriverIO) or Python, pick capabilities, run gestures, or fix "appium", "XCUITest", "UiAutomator2", "mobile automation" problems. For React Native-only testing, see detox.
license: Apache-2.0
compatibility: "Node.js 20.19+ (or 22.12+, 24+) and npm 10+ for the Appium server; Android SDK for Android, macOS with Xcode for iOS; Python 3.10+ for the Python client."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/appium/appium
  tags:
    - mobile-testing
    - ios
    - android
    - automation
---

# Appium

## Overview

Appium is a server that exposes the W3C WebDriver protocol for mobile apps. Test scripts (WebdriverIO, Python, Java, Ruby, .NET) send commands to the server, and a platform driver carries them out: UiAutomator2 for Android and XCUITest for iOS (iOS needs macOS and Xcode). Appium 3 is the current major version (3.8 at the time of writing); it needs Node.js 20.19+ or 22.12+ and npm 10+, speaks only W3C commands, and ships no drivers, so you install them separately.

## Instructions

### Initial assessment

1. Platform: Android, iOS or both? iOS requires a Mac.
2. App type: native, hybrid (WebView) or mobile web.
3. Client language: JavaScript (WebdriverIO), Python, Java, Ruby.
4. Emulators/simulators or real devices (real iOS devices need signing for WebDriverAgent).

### Setup

```bash
npm install -g appium                     # the only supported install route
appium driver install uiautomator2        # Android
appium driver install xcuitest            # iOS (macOS only)
appium driver list --installed

# Environment checks. The standalone appium-doctor package is deprecated;
# use the doctor built into each driver:
appium driver doctor uiautomator2
appium driver doctor xcuitest

appium                                    # listens on http://127.0.0.1:4723
```

Android needs `ANDROID_HOME` pointing at the SDK and `adb` on the PATH. Appium 3 requires driver-scoped insecure features, e.g. `appium --allow-insecure=uiautomator2:adb_shell` (`*:adb_shell` applies to all drivers).

### Capabilities

Every non-standard key carries the `appium:` prefix. `deviceName` does not pick a device on Android: select one with `appium:udid` (real device), `appium:avd` (emulator to boot) or `appium:platformVersion` (auto-detect).

```javascript
// capabilities.js
export const androidCaps = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:avd': 'Pixel_7_API_34',
  'appium:app': '/Users/dana/projects/shop-app/app/build/outputs/apk/debug/app-debug.apk',
  'appium:autoGrantPermissions': true,
  'appium:newCommandTimeout': 240,
};

export const iosCaps = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.5',
  'appium:app': '/Users/dana/projects/shop-app/build/ShopApp.app',
  'appium:autoAcceptAlerts': true,
};
```

### WebdriverIO config

```bash
npm install --save-dev webdriverio @wdio/cli @wdio/appium-service @wdio/mocha-framework
```

```javascript
// wdio.conf.js
export const config = {
  runner: 'local',
  specs: ['./tests/**/*.spec.js'],
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:avd': 'Pixel_7_API_34',
    'appium:app': './app/build/outputs/apk/debug/app-debug.apk',
  }],
  framework: 'mocha',
  mochaOpts: { timeout: 60000 },
  services: ['appium'],   // starts the globally installed Appium server on port 4723
};
```

Run with `npx wdio run wdio.conf.js`. In WebdriverIO, `$('~login-button')` finds by accessibility id (content-desc on Android, accessibility identifier on iOS).

### Mobile gestures

Prefer the driver's `mobile:` commands over legacy TouchAction. The UiAutomator2 set includes `clickGesture`, `longClickGesture`, `doubleClickGesture`, `dragGesture`, `flingGesture`, `swipeGesture`, `scrollGesture`, `pinchOpenGesture`, `pinchCloseGesture`. XCUITest has `mobile: swipe`, `mobile: scroll`, `mobile: touchAndHold`, `mobile: pinch` and others (see the driver docs).

## Examples

### Example 1: Login test in WebdriverIO

**Request:** "Write an Appium test that logs into my Android shopping app and checks the welcome text."

```javascript
// tests/login.spec.js
describe('Login screen', () => {
  it('logs in with valid credentials', async () => {
    await $('~email-input').setValue('dana.ortiz@shopmail.dev');
    await $('~password-input').setValue(process.env.SHOP_TEST_PASSWORD);
    await $('~login-button').click();

    const welcome = await $('~welcome-message');
    await welcome.waitForDisplayed({ timeout: 10000 });
    await expect(welcome).toHaveText('Welcome back, Dana');
  });
});
```

Run `appium` in one terminal (or rely on the `appium` service) and `npx wdio run wdio.conf.js`. The emulator boots, the APK installs, and Mocha reports `1 passing`.

### Example 2: Python test with scrolling

**Request:** "Python version: add an item, scroll the list, and assert it is listed."

```python
# tests/test_items.py
import pytest
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

@pytest.fixture
def driver():
    options = UiAutomator2Options()
    options.platform_name = "Android"
    options.avd = "Pixel_7_API_34"
    options.app = "./app-debug.apk"
    d = webdriver.Remote("http://127.0.0.1:4723", options=options)
    yield d
    d.quit()

def test_add_item(driver):
    wait = WebDriverWait(driver, 10)
    wait.until(EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "add-item"))).click()
    driver.find_element(AppiumBy.ACCESSIBILITY_ID, "item-name").send_keys("Oat milk 1L")
    driver.find_element(AppiumBy.ACCESSIBILITY_ID, "save-button").click()

    driver.execute_script("mobile: scrollGesture", {
        "left": 100, "top": 500, "width": 200, "height": 600,
        "direction": "down", "percent": 1.0,
    })
    assert wait.until(
        EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "item-Oat milk 1L"))
    ).is_displayed()
```

Install with `pip install Appium-Python-Client pytest` (client 6.x, Python 3.10+). `UiAutomator2Options` replaced the removed `desired_capabilities` argument.

## Guidelines

- Pin the Appium and driver versions in CI; upgrade drivers with `appium driver update uiautomator2`, not by reinstalling Appium.
- Missing `appium:` prefix on a custom capability is the most common "invalid capabilities" error.
- Give elements accessibility ids; XPath is slow and breaks on layout changes. Android `-android uiautomator` locators are on Google's deprecation path.
- Use explicit waits (`waitForDisplayed`, `WebDriverWait`) instead of sleeps.
- Appium 3 removed many old REST endpoints (app launch, lock, clipboard); use the driver's `mobile:` execute commands.
- Real iOS devices need a development team and WebDriverAgent signing; simulators do not.
- Keep passwords in environment variables; never commit them or the app binaries.
- Only expose the server beyond localhost behind authentication; insecure features give shell access to the device.
- For React Native apps with synchronised gray-box testing, Detox is a lighter choice.
