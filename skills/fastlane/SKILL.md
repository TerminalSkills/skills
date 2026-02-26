---
name: fastlane
description: >-
  Automate mobile app builds, signing, and deployment with Fastlane — CI/CD
  for iOS and Android. Use when someone asks to "automate App Store deployment",
  "Fastlane", "automate iOS build", "CI/CD for mobile", "automate Play Store
  upload", "code signing automation", or "mobile release pipeline". Covers
  build automation, code signing, TestFlight, Play Store, screenshots, and CI.
license: Apache-2.0
compatibility: "macOS for iOS builds. Any OS for Android. Ruby."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["mobile", "cicd", "fastlane", "ios", "android"]
---

# Fastlane

## Overview

Fastlane automates the tedious parts of mobile app releases — building, code signing, uploading to TestFlight/Play Store, taking screenshots, and managing certificates. One command to go from code to production. Used by most professional mobile teams to eliminate manual Xcode/Google Play Console workflows.

## When to Use

- Publishing to App Store / Play Store manually and it's painful
- Code signing is a nightmare across team members
- Need automated CI/CD for mobile builds
- Want automated screenshots for store listings
- Managing certificates and provisioning profiles

## Instructions

### Setup

```bash
# Install
brew install fastlane  # macOS
# Or: gem install fastlane

# Initialize in your project
cd my-app
fastlane init
```

### iOS Configuration

```ruby
# fastlane/Fastfile — iOS build and deploy automation
default_platform(:ios)

platform :ios do
  desc "Push a new beta build to TestFlight"
  lane :beta do
    # Increment build number
    increment_build_number(
      build_number: latest_testflight_build_number + 1
    )

    # Build the app
    build_app(
      workspace: "MyApp.xcworkspace",
      scheme: "MyApp",
      export_method: "app-store",
    )

    # Upload to TestFlight
    upload_to_testflight(
      skip_waiting_for_build_processing: true,
    )

    # Notify team
    slack(
      message: "New iOS beta uploaded to TestFlight! 🚀",
      slack_url: ENV["SLACK_WEBHOOK"],
    )
  end

  desc "Deploy to App Store"
  lane :release do
    build_app(
      workspace: "MyApp.xcworkspace",
      scheme: "MyApp",
      export_method: "app-store",
    )

    upload_to_app_store(
      force: true,  # Skip HTML preview verification
      submit_for_review: true,
      automatic_release: true,
      precheck_include_in_app_purchases: false,
    )
  end

  desc "Manage code signing with match"
  lane :certificates do
    match(
      type: "appstore",
      app_identifier: "com.mycompany.myapp",
      readonly: true,
    )
  end
end
```

### Android Configuration

```ruby
# fastlane/Fastfile — Android build and deploy
platform :android do
  desc "Build and upload to Google Play internal testing"
  lane :beta do
    gradle(
      task: "clean assembleRelease",
      properties: {
        "android.injected.signing.store.file" => ENV["KEYSTORE_PATH"],
        "android.injected.signing.store.password" => ENV["KEYSTORE_PASSWORD"],
        "android.injected.signing.key.alias" => ENV["KEY_ALIAS"],
        "android.injected.signing.key.password" => ENV["KEY_PASSWORD"],
      },
    )

    upload_to_play_store(
      track: "internal",
      aab: "./app/build/outputs/bundle/release/app-release.aab",
    )
  end

  desc "Promote internal to production"
  lane :release do
    upload_to_play_store(
      track: "internal",
      track_promote_to: "production",
      rollout: "0.1",  # 10% rollout
    )
  end
end
```

### Code Signing with Match

```bash
# Initialize match (stores certs in Git repo or cloud)
fastlane match init

# Generate certificates
fastlane match development
fastlane match appstore

# On CI — read-only mode (don't create new certs)
fastlane match appstore --readonly
```

### CI Integration

```yaml
# .github/workflows/release-ios.yml
name: iOS Release
on:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with: { bundler-cache: true }

      - name: Install CocoaPods
        run: pod install --project-directory=ios

      - name: Deploy to TestFlight
        env:
          APP_STORE_CONNECT_API_KEY: ${{ secrets.ASC_KEY }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_URL: ${{ secrets.MATCH_REPO }}
        run: fastlane ios beta
```

## Examples

### Example 1: Set up mobile CI/CD

**User prompt:** "Automate our iOS and Android builds — build on every PR, deploy to TestFlight/Play Store on tag."

The agent will create Fastlane lanes for building, signing, and deploying, set up match for code signing, and configure GitHub Actions workflows.

### Example 2: Automate App Store screenshots

**User prompt:** "Generate App Store screenshots in all required sizes automatically."

The agent will set up Fastlane snapshot with UI tests, capture screenshots in multiple device sizes and languages, and frame them with device bezels.

## Guidelines

- **`fastlane beta` for testing, `fastlane release` for production** — separate lanes
- **`match` for code signing** — stores certs in Git, all team members use the same ones
- **Increment build number automatically** — `increment_build_number` or `increment_version_code`
- **macOS required for iOS builds** — use GitHub Actions macOS runners
- **`.env` files for secrets** — keystore passwords, API keys
- **`Appfile` for app metadata** — app identifier, Apple ID, team ID
- **`supply` for Play Store metadata** — descriptions, changelogs, screenshots
- **`precheck` validates before submission** — catches common rejection reasons
- **Lanes are composable** — call one lane from another
- **Plugins extend functionality** — `fastlane-plugin-firebase_app_distribution` etc.
