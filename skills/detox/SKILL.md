---
name: detox
description: When the user wants to write end-to-end tests for React Native apps using Detox's gray-box testing approach. Also use when the user mentions "detox," "React Native testing," "React Native E2E," "gray-box testing," or "Wix Detox." For general mobile testing, see appium. For simpler mobile UI flows, see maestro.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - react-native
    - e2e-testing
    - mobile
    - gray-box
---

# Detox

## Overview

You are an expert in Detox, the gray-box end-to-end testing framework for React Native apps by Wix. You help users set up Detox for iOS and Android, write reliable tests that synchronize automatically with the app's UI and network activity, handle device/emulator management, and integrate Detox into CI. You understand Detox's automatic synchronization, which eliminates most flakiness caused by timing issues.

## Instructions

### Initial Assessment

1. **Platform** — iOS, Android, or both?
2. **React Native version** — Expo or bare workflow?
3. **CI** — Which CI provider? (GitHub Actions, CircleCI, Bitrise)
4. **Current state** — New project or adding tests to existing app?

### Setup

```bash
# setup-detox.sh — Install Detox in a React Native project.
# Includes both iOS and Android configuration.

# Install Detox CLI and library
npm install -g detox-cli
npm install --save-dev detox

# iOS: Install applesimutils (macOS only)
brew tap wix/brew
brew install applesimutils

# Initialize Detox config
detox init
```

### Configuration

```javascript
// .detoxrc.js — Detox configuration for iOS and Android.
// Defines build commands, device types, and test runner.
module.exports = {
  testRunner: {
    args: {
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 15' },
    },
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_7_API_34' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
```

### Jest Config for Detox

```javascript
// e2e/jest.config.js — Jest configuration for Detox tests.
// Sets up the Detox test environment and timeouts.
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
```

### Writing Tests

```javascript
// e2e/login.test.js — Detox E2E test for the login flow.
// Gray-box: Detox waits for animations and network automatically.
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show login screen on launch', async () => {
    await expect(element(by.id('login-screen'))).toBeVisible();
    await expect(element(by.id('email-input'))).toBeVisible();
    await expect(element(by.id('password-input'))).toBeVisible();
  });

  it('should login successfully with valid credentials', async () => {
    await element(by.id('email-input')).typeText('user@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await expect(element(by.id('home-screen'))).toBeVisible();
    await expect(element(by.text('Welcome back'))).toBeVisible();
  });

  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com');
    await element(by.id('password-input')).typeText('wrongpass');
    await element(by.id('login-button')).tap();

    await expect(element(by.id('error-message'))).toBeVisible();
    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });
});
```

### Scrolling and Lists

```javascript
// e2e/feed.test.js — Detox test for scrollable lists and pull-to-refresh.
// Demonstrates scroll actions and element matching within lists.
describe('Feed Screen', () => {
  beforeAll(async () => {
    await device.launchApp();
    await element(by.id('email-input')).typeText('user@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
  });

  it('should scroll to load more items', async () => {
    await waitFor(element(by.id('feed-list'))).toBeVisible().withTimeout(5000);
    await element(by.id('feed-list')).scroll(500, 'down');
    await expect(element(by.id('feed-item-10'))).toBeVisible();
  });

  it('should pull to refresh', async () => {
    await element(by.id('feed-list')).scroll(200, 'up');
    await waitFor(element(by.id('refresh-indicator'))).toBeNotVisible().withTimeout(5000);
  });
});
```

### Running Tests

```bash
# run-detox.sh — Build and run Detox tests.
# Separate build and test steps for flexibility.

# Build the app for testing
detox build --configuration ios.sim.debug
detox build --configuration android.emu.debug

# Run tests
detox test --configuration ios.sim.debug
detox test --configuration android.emu.debug

# Run specific test file
detox test --configuration ios.sim.debug e2e/login.test.js

# Run with retry on failure
detox test --configuration ios.sim.debug --retries 2
```

### CI Integration

```yaml
# .github/workflows/detox.yml — Run Detox tests on macOS runner.
# Uses iOS simulator for E2E testing.
name: Detox E2E
on: [push]
jobs:
  detox-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: brew tap wix/brew && brew install applesimutils
      - run: cd ios && pod install
      - run: detox build --configuration ios.sim.debug
      - run: detox test --configuration ios.sim.debug --retries 2
```
