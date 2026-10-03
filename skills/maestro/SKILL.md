---
name: maestro
description: >-
  Maestro is an open-source UI testing framework that drives Android, iOS and
  web apps from short YAML flows (launchApp, tapOn, assertVisible). Use when the
  user wants to write mobile UI tests, set up Maestro in CI, debug a flaky flow,
  or let a coding agent run flows through the Maestro MCP server. For React
  Native gray-box testing see detox; for code-based cross-platform automation
  see appium.
license: Apache-2.0
compatibility: "Java 17+; macOS, Linux or Windows; Android emulators and devices, iOS Simulators (physical iPhones are not supported), web browsers"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - mobile-testing
    - ui-testing
    - yaml
    - ios
    - android
  repository: https://github.com/mobile-dev-inc/maestro
---

# Maestro

## Overview

Maestro tests an app the way a user sees it: it reads the screen through the platform accessibility layer and taps, types and scrolls by text or id. Flows are plain YAML interpreted at run time (no compile step), the same syntax covers React Native, Flutter, native Android/iOS and web, and built-in waiting removes most manual `sleep` calls. Checked against CLI 2.11.0 (29 September 2026).

Pieces to know: the open-source CLI (`maestro test`, `maestro mcp`), Maestro Studio (a free desktop app for building flows visually; the old `maestro studio` command was removed from the CLI in 2.6), Maestro Viewer, and Maestro Cloud (paid parallel runs on hosted devices).

## Instructions

### Install

Maestro needs Java 17+ (`java -version`, and `JAVA_HOME` must point to it).

```bash
# macOS
brew tap mobile-dev-inc/tap
brew install mobile-dev-inc/tap/maestro

# Linux / CI: download the release zip and check it against the published checksum
curl -fsSLO https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.11.0/maestro.zip
curl -fsSL https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.11.0/checksums_sha256.txt | sha256sum -c -
unzip -q maestro.zip -d "$HOME/.maestro-cli"
export PATH="$HOME/.maestro-cli/maestro/bin:$PATH"

maestro --version
```

The docs also show an install script (`curl ... get.maestro.mobile.dev | bash`); prefer the package manager or the checksum-verified zip above. On Windows, unzip `maestro.zip` and add its `bin` folder to `PATH`.

### Devices

```bash
maestro list-devices                            # emulators/simulators and connected devices
maestro start-device --platform android         # create and boot a default emulator
maestro start-device --platform ios --device-os iOS-18-2
maestro --device emulator-5554 test flows/login.yaml   # pick one device explicitly
```

### A basic flow

The header holds `appId` (Android package or iOS bundle id; for web use `url:` instead). Everything after `---` is a command list.

```yaml
# flows/login.yaml
appId: com.brightbasket.shop
env:
  EMAIL: ${EMAIL || "qa@brightbasket.dev"}
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: ${EMAIL}
- tapOn: "Password"
- inputText: ${PASSWORD}
- tapOn: "Log In"
- assertVisible: "Welcome back"
```

Pass values with `-e` or export shell variables prefixed `MAESTRO_` (CLI only). Parameters arrive as strings; `env:` in the flow defines constants and defaults.

```bash
maestro test -e PASSWORD="$QA_PASSWORD" flows/login.yaml
```

### Scrolling, conditions and sub-flows

```yaml
# flows/checkout.yaml
appId: com.brightbasket.shop
---
- launchApp
- runFlow:                       # dismiss a popup only if it shows up
    when:
      visible: "Allow Notifications"
    commands:
      - tapOn: "Not Now"
- runFlow:
    when:
      platform: Android
    file: subflows/android-permissions.yaml
- tapOn: "Electronics"
- scrollUntilVisible:
    element: "Wireless Headphones"
    direction: DOWN
    timeout: 20000
- tapOn: "Wireless Headphones"
- tapOn: "Add to Cart"
- assertVisible: "Added to cart"
- takeScreenshot: cart-added
```

Other useful commands: `assertNotVisible`, `extendedWaitUntil` (custom timeout), `retry`, `repeat`, `swipe`, `back`, `hideKeyboard`, `openLink`, `setPermissions`, `runScript`/`evalScript` (JavaScript), `startRecording`. Selectors accept `text`, `id`, `index`, `point`, relational (`below`, `childOf`) and state (`enabled`, `checked`) matchers; prefer `id` (accessibility identifier) when text is ambiguous or localized.

### Running suites and reports

```bash
maestro test flows/                                    # every flow in a folder
maestro test --include-tags=smoke flows/               # tags are set in each flow header
maestro test --format junit --output report.xml flows/ # JUNIT or HTML reports
maestro test --shard-split 2 flows/                    # spread flows over 2 connected devices
maestro test --continuous flows/login.yaml             # re-run on file change while authoring
maestro record --local flows/login.yaml                # render an MP4 on your machine
```

Screenshots, logs and `commands.json` land in `~/.maestro/tests` unless `--test-output-dir` is set. A workspace `config.yaml` can set `flows`, tags, `executionOrder` and `onFlowStart`/`onFlowComplete` hooks.

### Maestro MCP for coding agents

The MCP server ships inside the CLI, so an agent can inspect a live device, tap, assert and write flows:

```bash
claude mcp add maestro -- maestro mcp
codex mcp add maestro -- maestro mcp
```

### CI on GitHub Actions (Android emulator)

```yaml
# .github/workflows/maestro.yml
name: Maestro E2E
on: [pull_request]
jobs:
  maestro:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - name: Install Maestro 2.11.0 (checksum verified)
        run: |
          base=https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.11.0
          curl -fsSLO $base/maestro.zip
          curl -fsSL $base/checksums_sha256.txt | sha256sum -c -
          unzip -q maestro.zip -d "$HOME/.maestro-cli"
          echo "$HOME/.maestro-cli/maestro/bin" >> "$GITHUB_PATH"
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: |
            adb install app/build/outputs/apk/debug/app-debug.apk
            maestro test --format junit --output report.xml flows/
        env:
          MAESTRO_PASSWORD: ${{ secrets.QA_PASSWORD }}
```

For hosted devices instead of an emulator use `maestro cloud --app-file app.apk --flows flows/` (needs a Maestro Cloud API key and project id).

## Examples

### Example 1: "Write a login test for our shop app and run it on my emulator"

```bash
maestro start-device --platform android
maestro test -e PASSWORD="$QA_PASSWORD" flows/login.yaml
```

Result: the console lists each command with a check mark (`Launch app`, `Tap on "Email"`, ..., `Assert that "Welcome back" is visible`) and ends with `Flow Passed`. If the text never appears, the run stops at the failing command and the screenshot and hierarchy dump are in `~/.maestro/tests/<timestamp>/`.

### Example 2: "Our checkout test fails on iOS because a permission dialog shows up sometimes"

Wrap the dialog handling in a conditional so the flow works whether or not it appears:

```yaml
- runFlow:
    when:
      visible: "Allow While Using App"
    commands:
      - tapOn: "Allow While Using App"
```

Run `maestro --platform ios test flows/checkout.yaml`. The step is skipped when the dialog is absent, so the flow no longer flakes. Alternatively grant permissions up front with `launchApp: { permissions: { all: allow } }`.

## Guidelines

- Physical iPhones are not supported (Simulators and Android devices are); the CLI exits early with an explicit message.
- Prefer `id` selectors plus accessibility labels in the app (`accessibilityIdentifier` on iOS, `testID`/resource ids on Android and React Native, `Semantics` in Flutter); text selectors break when copy or locale changes.
- Do not add `sleep`-style waits: use `assertVisible`, `extendedWaitUntil` or `scrollUntilVisible`, which retry automatically.
- Keep secrets out of flows: pass them with `-e` or `MAESTRO_*` variables from CI secrets; never commit real credentials. Use a card number like Stripe's test card only against a sandbox.
- `maestro record` without `--local` uploads the capture to Maestro's servers for rendering (a deprecated path); use `--local` for private apps.
- `maestro chat` was discontinued; use the MCP server. Parameters are strings, so parse numbers in JavaScript.
- Use Detox for gray-box React Native tests, Appium when you need code-level control or physical iOS devices.
