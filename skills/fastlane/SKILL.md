---
name: fastlane
description: >-
  Automate mobile app builds, signing, and deployment with Fastlane — CI/CD
  for iOS and Android. Use when someone asks to "automate App Store deployment",
  "Fastlane", "automate iOS build", "CI/CD for mobile", "automate Play Store
  upload", "code signing automation", or "mobile release pipeline". Covers
  build automation, code signing, TestFlight, Play Store, screenshots, and CI.
license: Apache-2.0
compatibility: "fastlane 2.240.x needs Ruby 3.1 or newer. macOS with Xcode for iOS builds; any OS for Android."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["mobile", "cicd", "fastlane", "ios", "android"]
  repository: https://github.com/fastlane/fastlane
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
# Recommended: pin the version per project with Bundler
cd my-app
printf 'source "https://rubygems.org"\ngem "fastlane"\n' > Gemfile
bundle install
bundle exec fastlane init      # writes fastlane/Appfile and fastlane/Fastfile

# Alternatives: brew install fastlane (macOS), gem install fastlane
```

Run lanes with `bundle exec fastlane ios beta` (platform, then lane). Current release: 2.240.1; it needs Ruby 3.1 or newer.

For uploads to App Store Connect use an API key (Users and Access, Integrations, App Store Connect API) rather than an Apple ID password, which triggers two-factor prompts that CI cannot answer.

### iOS Configuration

```ruby
# fastlane/Fastfile — iOS build and deploy automation
default_platform(:ios)

platform :ios do
  desc "Push a new beta build to TestFlight"
  lane :beta do
    setup_ci   # on CI only: creates a temporary keychain for signing
    app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_P8"],          # contents of the .p8 file
    )
    match(type: "appstore", readonly: true)

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
      message: "New iOS beta uploaded to TestFlight",
      slack_url: ENV["SLACK_WEBHOOK"],
    )
  end

  desc "Deploy to App Store"
  lane :release do
    app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_P8"],
    )
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
      task: "clean bundle",
      build_type: "Release",           # produces an .aab; upload_to_play_store picks it up automatically
      properties: {
        "android.injected.signing.store.file" => ENV["KEYSTORE_PATH"],
        "android.injected.signing.store.password" => ENV["KEYSTORE_PASSWORD"],
        "android.injected.signing.key.alias" => ENV["KEY_ALIAS"],
        "android.injected.signing.key.password" => ENV["KEY_PASSWORD"],
      },
    )

    upload_to_play_store(
      track: "internal",
      json_key: ENV["PLAY_JSON_KEY_PATH"],   # service-account JSON with Play Console access
    )
  end

  desc "Promote internal to production"
  lane :release do
    upload_to_play_store(
      track: "internal",
      track_promote_to: "production",
      rollout: "0.1",  # 10% staged rollout
      json_key: ENV["PLAY_JSON_KEY_PATH"],
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
bundle exec fastlane match appstore --readonly
# Needed env vars on CI: MATCH_PASSWORD (decrypts the repo), MATCH_GIT_URL or Matchfile git_url
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
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: ${{ secrets.ASC_KEY_P8 }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_URL: ${{ secrets.MATCH_REPO }}
        run: bundle exec fastlane ios beta
```

## Examples

### Example 1: Set up mobile CI/CD

**User prompt:** "Automate our iOS and Android builds — build on every PR, deploy to TestFlight/Play Store on tag."

The agent will create Fastlane lanes for building, signing, and deploying, set up match for code signing, and configure GitHub Actions workflows. Result: `bundle exec fastlane ios beta` builds, signs and uploads a TestFlight build; `bundle exec fastlane android beta` uploads an .aab to the internal track.

### Example 2: Automate App Store screenshots

**User prompt:** "Generate App Store screenshots in all required sizes automatically."

The agent will set up Fastlane snapshot (`bundle exec fastlane snapshot init`) with UI tests, run `capture_screenshots` across the device sizes and languages in `Snapfile`, and optionally frame them with `frame_screenshots`. Result: `fastlane/screenshots/en-US/` (and one folder per language) holds one image per device and test step, ready for `upload_to_app_store`.

## Guidelines

- **`fastlane beta` for testing, `fastlane release` for production** — separate lanes
- **`match` for code signing** — stores certs in Git, all team members use the same ones
- **Increment build number automatically** — `increment_build_number` for iOS; Android has no built-in action for `versionCode`, so compute it in Gradle or use a plugin such as `fastlane-plugin-versioning_android`
- **`export_method`** — Xcode 15.3 and later accept `"app-store-connect"` as the new name for `"app-store"`; use the one your Xcode supports
- **macOS required for iOS builds** — use GitHub Actions macOS runners
- **Secrets from environment variables** — keystore passwords, API keys and the Play JSON key come from CI secrets or an untracked `fastlane/.env`; never commit them
- **`Appfile` for app metadata** — app identifier, Apple ID, team ID
- **`supply` for Play Store metadata** — descriptions, changelogs, screenshots
- **`precheck` validates before submission** — catches common rejection reasons
- **Lanes are composable** — call one lane from another
- **Plugins extend functionality** — `fastlane-plugin-firebase_app_distribution` etc.
