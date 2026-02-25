---
title: Automate Mobile App Testing
slug: automate-mobile-app-testing
description: Set up mobile end-to-end testing using Maestro for quick YAML-based UI flows and Detox for deep React Native gray-box testing — covering onboarding, core features, and CI integration for both iOS and Android.
skills:
  - maestro
  - detox
  - react-native
category: devops
tags:
  - mobile-testing
  - e2e-testing
  - react-native
  - ios
  - android
  - ci-cd
---

# Automate Mobile App Testing

Marcus is the sole mobile engineer at a health-tech startup. The app — built in React Native — lets patients book appointments, message their doctors, and view lab results. The team ships weekly, and Marcus has been testing manually: tap through onboarding, book an appointment, check the messages tab, verify lab results render. Every release takes him two hours of manual QA on both iOS and Android. Last week he missed a regression where the appointment calendar crashed on Android when scrolling to the next month. A user reported it from a hospital waiting room. Marcus decides to automate.

He picks two tools: **Maestro** for fast, readable smoke tests that cover critical user flows, and **Detox** for deeper gray-box tests that hook into React Native's internals for the complex, timing-sensitive screens like real-time messaging and calendar interactions.

## Step 1 — Install Maestro for Quick UI Flows

Maestro tests read like plain English. Marcus can write a flow in five minutes and hand it to the product manager to review.

```bash
# install-maestro.sh — Install Maestro CLI.
# Works on macOS and Linux; requires a running simulator or emulator.
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version
```

## Step 2 — Write Maestro Smoke Tests for Critical Flows

The onboarding flow is the first thing every patient sees. If it breaks, nobody can use the app.

```yaml
# e2e/maestro/onboarding.yaml — Onboarding flow from launch to home screen.
# Covers permission dialogs, welcome carousel, and account creation.
appId: com.healthapp.patient
---
- launchApp:
    clearState: true

# Handle notification permission popup (iOS)
- runFlow:
    when:
      visible: "Allow Notifications"
    commands:
      - tapOn: "Allow"

# Welcome carousel
- assertVisible: "Welcome to HealthApp"
- tapOn: "Next"
- assertVisible: "Book appointments instantly"
- tapOn: "Next"
- assertVisible: "Secure messaging with your doctor"
- tapOn: "Get Started"

# Sign up
- tapOn: "Create Account"
- tapOn: "Full Name"
- inputText: "Marcus Test"
- tapOn: "Email"
- inputText: "marcus+test@example.com"
- tapOn: "Password"
- inputText: "TestPass123!"
- tapOn: "Date of Birth"
- inputText: "01/15/1990"
- tapOn: "Create Account"

# Verify we reach the home screen
- assertVisible: "Good morning, Marcus"
- assertVisible: "Upcoming Appointments"
```

The appointment booking flow is the core money-maker:

```yaml
# e2e/maestro/book-appointment.yaml — Book an appointment from the home screen.
# Tests calendar navigation, doctor selection, and confirmation.
appId: com.healthapp.patient
---
- launchApp

# Navigate to booking
- tapOn: "Book Appointment"
- assertVisible: "Choose a Specialty"
- tapOn: "General Practice"

# Select doctor
- assertVisible: "Available Doctors"
- tapOn: "Dr. Sarah Chen"
- assertVisible: "Available Times"

# Pick a date
- tapOn: "Next Week"
- scrollUntilVisible:
    element: "9:00 AM"
    direction: DOWN
- tapOn: "9:00 AM"

# Confirm
- assertVisible: "Confirm Appointment"
- assertVisible: "Dr. Sarah Chen"
- assertVisible: "9:00 AM"
- tapOn: "Confirm Booking"
- assertVisible: "Appointment Confirmed"
- tapOn: "Done"

# Verify it shows on home screen
- assertVisible: "Dr. Sarah Chen"
```

Lab results need to render correctly — patients make medical decisions based on this data:

```yaml
# e2e/maestro/view-lab-results.yaml — View lab results and check data rendering.
# Verifies the results list, detail view, and PDF download.
appId: com.healthapp.patient
---
- launchApp
- tapOn: "Lab Results"
- assertVisible: "Recent Results"

# Open a result
- tapOn: "Blood Panel - Jan 15"
- assertVisible: "Blood Panel"
- assertVisible: "Hemoglobin"
- assertVisible: "White Blood Cell Count"

# Check that values are displayed
- assertNotVisible: "Loading..."

# Download PDF
- tapOn: "Download PDF"
- assertVisible: "PDF saved"
- back
```

```bash
# run-maestro-smoke.sh — Run all Maestro smoke tests.
maestro test e2e/maestro/
```

## Step 3 — Set Up Detox for Deep React Native Testing

Maestro catches surface-level regressions. But the appointment calendar crash Marcus missed? That was a timing issue — the calendar component fetched new data on scroll, and the state update collided with the scroll animation. Detox hooks into React Native's bridge and synchronizes with animations, network requests, and timers automatically.

```bash
# install-detox.sh — Install Detox in the React Native project.
npm install --save-dev detox detox-cli jest
cd ios && pod install && cd ..
detox init
```

```javascript
// .detoxrc.js — Detox configuration for iOS simulator and Android emulator.
// Separate build configs for debug and release.
module.exports = {
  testRunner: {
    args: { config: 'e2e/detox/jest.config.js' },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/HealthApp.app',
      build: 'xcodebuild -workspace ios/HealthApp.xcworkspace -scheme HealthApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
```

```javascript
// e2e/detox/jest.config.js — Jest config for Detox test runner.
// Single worker to avoid simulator conflicts.
module.exports = {
  rootDir: '../..',
  testMatch: ['<rootDir>/e2e/detox/**/*.test.js'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
```

## Step 4 — Write Detox Tests for Complex Interactions

The calendar is where manual testing failed Marcus. Detox's automatic synchronization waits for network requests and animations to complete before proceeding.

```javascript
// e2e/detox/calendar.test.js — Detox test for the appointment calendar.
// Tests the exact scenario that caused the production crash: scrolling months.
describe('Appointment Calendar', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await element(by.id('email-input')).typeText('marcus+test@example.com');
    await element(by.id('password-input')).typeText('TestPass123!');
    await element(by.id('login-button')).tap();
    await waitFor(element(by.id('home-screen'))).toBeVisible().withTimeout(10000);
  });

  beforeEach(async () => {
    await element(by.id('tab-appointments')).tap();
    await element(by.id('book-appointment-button')).tap();
    await element(by.text('General Practice')).tap();
    await element(by.text('Dr. Sarah Chen')).tap();
  });

  it('should scroll between months without crashing', async () => {
    await expect(element(by.id('calendar-view'))).toBeVisible();

    // Scroll to next month — triggers data fetch + animation
    await element(by.id('calendar-view')).swipe('left');
    await waitFor(element(by.id('calendar-loading'))).toBeNotVisible().withTimeout(5000);

    // Verify next month rendered
    await expect(element(by.id('calendar-view'))).toBeVisible();

    // Scroll to month after — rapid consecutive swipes
    await element(by.id('calendar-view')).swipe('left');
    await waitFor(element(by.id('calendar-loading'))).toBeNotVisible().withTimeout(5000);

    // Scroll back — this triggered the crash due to stale state
    await element(by.id('calendar-view')).swipe('right');
    await waitFor(element(by.id('calendar-loading'))).toBeNotVisible().withTimeout(5000);
    await expect(element(by.id('calendar-view'))).toBeVisible();
  });

  it('should select a time slot and show confirmation', async () => {
    await element(by.id('day-15')).tap();
    await waitFor(element(by.id('time-slots'))).toBeVisible().withTimeout(5000);

    await element(by.text('9:00 AM')).tap();

    await expect(element(by.id('confirm-screen'))).toBeVisible();
    await expect(element(by.text('Dr. Sarah Chen'))).toBeVisible();
    await expect(element(by.text('9:00 AM'))).toBeVisible();
  });
});
```

The messaging screen uses WebSocket connections and real-time updates:

```javascript
// e2e/detox/messaging.test.js — Detox test for real-time doctor messaging.
// Verifies message sending, receiving indicators, and scroll behavior.
describe('Doctor Messaging', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await element(by.id('email-input')).typeText('marcus+test@example.com');
    await element(by.id('password-input')).typeText('TestPass123!');
    await element(by.id('login-button')).tap();
    await waitFor(element(by.id('home-screen'))).toBeVisible().withTimeout(10000);
  });

  it('should send a message and show it in the thread', async () => {
    await element(by.id('tab-messages')).tap();
    await waitFor(element(by.id('conversations-list'))).toBeVisible().withTimeout(5000);

    await element(by.text('Dr. Sarah Chen')).tap();
    await waitFor(element(by.id('message-input'))).toBeVisible().withTimeout(5000);

    await element(by.id('message-input')).typeText('Hi Dr. Chen, I have a question about my prescription.');
    await element(by.id('send-button')).tap();

    // Detox waits for the network request and UI update automatically
    await expect(element(by.text('Hi Dr. Chen, I have a question about my prescription.'))).toBeVisible();
    await expect(element(by.id('message-status-sent'))).toBeVisible();
  });

  it('should scroll through message history', async () => {
    await element(by.id('tab-messages')).tap();
    await element(by.text('Dr. Sarah Chen')).tap();

    // Scroll up to load older messages
    await element(by.id('messages-list')).scroll(500, 'up');
    await waitFor(element(by.id('loading-older'))).toBeNotVisible().withTimeout(5000);

    await expect(element(by.id('messages-list'))).toBeVisible();
  });
});
```

## Step 5 — Running Tests

```bash
# run-detox.sh — Build and run Detox tests on both platforms.

# iOS
detox build --configuration ios.sim.debug
detox test --configuration ios.sim.debug --retries 2

# Android
detox build --configuration android.emu.debug
detox test --configuration android.emu.debug --retries 2
```

## Step 6 — CI Pipeline

Marcus sets up CI to run Maestro smoke tests on every push and Detox deep tests on PRs targeting main.

```yaml
# .github/workflows/mobile-e2e.yml — Mobile E2E testing pipeline.
# Maestro for fast smoke tests, Detox for thorough platform tests.
name: Mobile E2E Tests
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  maestro-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Install Maestro
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH
      - name: Build Android APK
        run: cd android && ./gradlew assembleDebug
      - name: Run Maestro smoke tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: |
            adb install android/app/build/outputs/apk/debug/app-debug.apk
            maestro test e2e/maestro/

  detox-ios:
    runs-on: macos-14
    if: github.event_name == 'pull_request'
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

  detox-android:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Build and test
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: |
            detox build --configuration android.emu.debug
            detox test --configuration android.emu.debug --retries 2
```

Marcus pushes the pipeline. The next morning, a teammate's PR changes the calendar component's data fetching logic. The Detox calendar test catches a regression where scrolling back to the previous month shows stale data — exactly the kind of bug that would have slipped through manual testing. Marcus approves the fix, the tests go green, and the app ships on Thursday without him spending two hours tapping through screens.
