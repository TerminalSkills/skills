---
name: maestro
description: When the user wants to write mobile UI tests using Maestro's simple YAML-based flow definitions. Also use when the user mentions "maestro," "mobile UI testing," "YAML mobile tests," "maestro flows," or "maestro studio." For React Native-specific gray-box testing, see detox. For cross-platform mobile automation, see appium.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - mobile-testing
    - ui-testing
    - yaml
    - ios
    - android
---

# Maestro

## Overview

You are an expert in Maestro, the mobile UI testing framework that uses simple YAML flows. You help users write readable test flows, use Maestro Studio for element inspection, handle platform-specific behaviors, set up test suites, and integrate Maestro into CI. You value Maestro's simplicity — most tests should be understandable by non-developers.

## Instructions

### Initial Assessment

1. **Platform** — iOS, Android, or both?
2. **App** — How is the app built and installed?
3. **Flows** — What user journeys need testing?
4. **CI** — Cloud (Maestro Cloud) or self-hosted?

### Setup

```bash
# setup-maestro.sh — Install Maestro and verify it works.
# Works on macOS and Linux.

# Install
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify
maestro --version

# Launch Maestro Studio (interactive element inspector)
maestro studio
```

### Basic Flow

```yaml
# flows/login.yaml — Maestro flow testing the login screen.
# Taps, types, and asserts in plain YAML.
appId: com.example.myapp
---
- launchApp
- tapOn: "Email"
- inputText: "user@example.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Log In"
- assertVisible: "Welcome back"
```

### Complete User Journey

```yaml
# flows/purchase-flow.yaml — End-to-end purchase flow from browse to checkout.
# Demonstrates navigation, scrolling, and multi-step interaction.
appId: com.example.shop
---
- launchApp
- assertVisible: "Featured Products"

# Browse products
- tapOn: "Categories"
- tapOn: "Electronics"
- scrollUntilVisible:
    element: "Wireless Headphones"
    direction: DOWN
- tapOn: "Wireless Headphones"

# Add to cart
- assertVisible: "Wireless Headphones"
- assertVisible: "$79.99"
- tapOn: "Add to Cart"
- assertVisible: "Added to cart"

# Checkout
- tapOn: "Cart"
- assertVisible: "1 item"
- tapOn: "Checkout"
- inputText: "4242424242424242"
- tapOn: "Pay Now"
- assertVisible: "Order confirmed"
```

### Conditional and Repeated Flows

```yaml
# flows/onboarding.yaml — Handle conditional onboarding screens.
# Uses runFlow for reusable sub-flows and conditional logic.
appId: com.example.myapp
---
- launchApp

# Dismiss notification permission if it appears
- runFlow:
    when:
      visible: "Allow Notifications"
    commands:
      - tapOn: "Not Now"

# Skip onboarding carousel
- tapOn: "Skip"
- assertVisible: "Sign Up"
```

### Environment Variables

```yaml
# flows/login-env.yaml — Login flow using environment variables.
# Keeps credentials out of the flow file.
appId: com.example.myapp
---
- launchApp
- tapOn: "Email"
- inputText: "${EMAIL}"
- tapOn: "Password"
- inputText: "${PASSWORD}"
- tapOn: "Log In"
- assertVisible: "Welcome back"
```

```bash
# run-with-env.sh — Run Maestro flow with environment variables.
# Pass sensitive data at runtime.
EMAIL=user@example.com PASSWORD=secret123 maestro test flows/login-env.yaml
```

### Screenshots and Recording

```yaml
# flows/visual-check.yaml — Take screenshots at key points for visual verification.
# Useful for design review and regression checks.
appId: com.example.myapp
---
- launchApp
- assertVisible: "Home"
- takeScreenshot: "home-screen"
- tapOn: "Profile"
- assertVisible: "Profile"
- takeScreenshot: "profile-screen"
```

### Running Tests

```bash
# run-maestro.sh — Common Maestro commands.
# Run single flows, suites, and with recording.

# Run single flow
maestro test flows/login.yaml

# Run all flows in a directory
maestro test flows/

# Record a video of the test
maestro record flows/login.yaml

# Use Maestro Studio to inspect elements
maestro studio
```

### CI Integration

```yaml
# .github/workflows/maestro.yml — Run Maestro tests in CI.
# Uses Android emulator on Ubuntu runner.
name: Maestro E2E
on: [push]
jobs:
  maestro:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash
      - name: Start emulator and run tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: |
            adb install app-debug.apk
            ~/.maestro/bin/maestro test flows/
```
