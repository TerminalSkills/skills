---
name: appium
description: When the user wants to automate mobile app testing on iOS and Android using Appium. Also use when the user mentions "appium," "mobile automation," "iOS testing," "Android testing," "mobile WebDriver," "XCUITest," or "UiAutomator." For React Native-specific testing, see detox.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - mobile-testing
    - ios
    - android
    - automation
---

# Appium

## Overview

You are an expert in Appium, the cross-platform mobile automation framework built on the WebDriver protocol. You help users set up Appium for iOS and Android testing, write reliable test scripts, configure desired capabilities, handle mobile-specific gestures, and integrate mobile tests into CI. You understand the differences between XCUITest (iOS) and UiAutomator2 (Android) drivers.

## Instructions

### Initial Assessment

1. **Platform** — iOS, Android, or both?
2. **App type** — Native, hybrid, or mobile web?
3. **Language** — JavaScript, Python, Java, or Ruby?
4. **Environment** — Real devices or simulators/emulators?

### Setup

```bash
# setup-appium.sh — Install Appium and verify the environment.
# Checks that all required dependencies are available.

# Install Appium
npm install -g appium

# Install platform drivers
appium driver install uiautomator2
appium driver install xcuitest

# Verify setup
appium driver list --installed

# Check environment requirements
npx appium-doctor --android
npx appium-doctor --ios
```

### Capabilities Configuration

```javascript
// capabilities.js — Appium desired capabilities for iOS and Android.
// Defines which device, OS version, and app to test.
const androidCaps = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Pixel 7',
  'appium:platformVersion': '14',
  'appium:app': '/path/to/app.apk',
  'appium:autoGrantPermissions': true,
  'appium:noReset': false,
};

const iosCaps = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.4',
  'appium:app': '/path/to/app.ipa',
  'appium:autoAcceptAlerts': true,
};
```

### Test Script (JavaScript with WebDriverIO)

```javascript
// tests/login.spec.js — Appium test for mobile login flow.
// Tests both successful login and error handling.
describe('Login Screen', () => {
  it('should login with valid credentials', async () => {
    const emailField = await $('~email-input');
    await emailField.setValue('user@example.com');

    const passwordField = await $('~password-input');
    await passwordField.setValue('password123');

    const loginButton = await $('~login-button');
    await loginButton.click();

    const welcomeText = await $('~welcome-message');
    await welcomeText.waitForDisplayed({ timeout: 10000 });
    await expect(welcomeText).toHaveText('Welcome back');
  });

  it('should show error on invalid credentials', async () => {
    const emailField = await $('~email-input');
    await emailField.setValue('wrong@example.com');

    const passwordField = await $('~password-input');
    await passwordField.setValue('wrongpass');

    const loginButton = await $('~login-button');
    await loginButton.click();

    const errorMsg = await $('~error-message');
    await errorMsg.waitForDisplayed({ timeout: 5000 });
    await expect(errorMsg).toHaveText('Invalid credentials');
  });
});
```

### Python Test

```python
# tests/test_app.py — Appium test using Python and pytest.
# Demonstrates element finding, gestures, and assertions.
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
    options.device_name = "emulator-5554"
    options.app = "./app-debug.apk"
    d = webdriver.Remote("http://localhost:4723", options=options)
    yield d
    d.quit()

def test_add_item(driver):
    wait = WebDriverWait(driver, 10)
    add_button = wait.until(
        EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "add-item"))
    )
    add_button.click()

    name_field = driver.find_element(AppiumBy.ACCESSIBILITY_ID, "item-name")
    name_field.send_keys("Test Item")

    save_button = driver.find_element(AppiumBy.ACCESSIBILITY_ID, "save-button")
    save_button.click()

    item = wait.until(
        EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "item-Test Item"))
    )
    assert item.is_displayed()
```

### Mobile Gestures

```javascript
// gestures.js — Common mobile gestures in Appium.
// Scroll, swipe, long-press, and pinch-to-zoom.

// Scroll down
await driver.execute('mobile: scrollGesture', {
  left: 100, top: 500, width: 200, height: 500,
  direction: 'down', percent: 1.0,
});

// Swipe left (e.g., dismiss card)
const card = await $('~card-element');
await driver.execute('mobile: swipeGesture', {
  elementId: card.elementId,
  direction: 'left', percent: 0.75,
});

// Long press
const item = await $('~list-item');
await driver.execute('mobile: longClickGesture', {
  elementId: item.elementId, duration: 2000,
});
```

### WebDriverIO Config

```javascript
// wdio.conf.js — WebDriverIO configuration for Appium mobile tests.
// Configures both Android and iOS test suites.
exports.config = {
  runner: 'local',
  port: 4723,
  specs: ['./tests/**/*.spec.js'],
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Pixel_7_API_34',
    'appium:app': './app/build/outputs/apk/debug/app-debug.apk',
  }],
  framework: 'mocha',
  mochaOpts: { timeout: 60000 },
  services: ['appium'],
};
```
