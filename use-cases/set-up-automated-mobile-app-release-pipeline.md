---
title: "Set Up an Automated Mobile App Release Pipeline with AI"
slug: set-up-automated-mobile-app-release-pipeline
description: "Use AI to configure CI/CD for iOS and Android builds, automate versioning, and streamline app store submissions."
skills: [cicd-pipeline, changelog-generator, coding-agent]
category: devops
tags: [mobile, release, ci-cd, app-store, automation]
---

# Set Up an Automated Mobile App Release Pipeline with AI

## The Problem

A mobile team of four ships a React Native app to both iOS and Android. Every release takes two days: one developer manually bumps version numbers in four files, another builds the iOS archive in Xcode and the Android bundle in Android Studio, a third writes release notes from memory, and someone uploads both binaries to App Store Connect and Google Play Console by hand. Builds fail silently when signing certificates expire, version codes get reused, and release notes are inconsistent between platforms. The team ships biweekly but wants to move to weekly releases — impossible at the current manual pace.

## The Solution

Use the **cicd-pipeline** skill to scaffold a GitHub Actions workflow that builds, signs, and uploads both platforms on every tagged commit. Add the **changelog-generator** skill to auto-generate release notes from merged PRs. Use the **coding-agent** skill to write and maintain the Fastlane configuration that handles code signing, screenshots, and store metadata.

## Step-by-Step Walkthrough

### 1. Scaffold the CI/CD workflow

Tell your AI agent:

```text
Create a GitHub Actions workflow for our React Native app. It should trigger on tags matching v*. Build the iOS .ipa using Fastlane and the Android .aab using Gradle. Store both artifacts. Use separate jobs for iOS (macos-latest) and Android (ubuntu-latest).
```

The agent uses **cicd-pipeline** to generate `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
      - run: bundle exec fastlane ios build
      - uses: actions/upload-artifact@v4
        with:
          name: ios-ipa
          path: output/app.ipa
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
      - run: ./gradlew bundleRelease
      - uses: actions/upload-artifact@v4
        with:
          name: android-aab
          path: android/app/build/outputs/bundle/release/app-release.aab
```

### 2. Configure code signing and Fastlane

```text
Write Fastlane configurations for both platforms. iOS should use match for certificate management with our git-based signing repo. Android should read the keystore from a GitHub secret. Add lanes for build, beta (TestFlight / internal track), and production.
```

The **coding-agent** generates `ios/fastlane/Fastfile` and `android/fastlane/Fastfile` with proper signing, including error handling for expired certificates.

### 3. Auto-generate release notes

```text
Add a step to the release workflow that generates release notes from all merged PRs since the last tag. Group changes into Features, Fixes, and Maintenance. Write the output to CHANGELOG.md and use it as the release body on GitHub.
```

The **changelog-generator** skill produces:

```text
## v2.4.0 (2025-01-20)

### Features
- Add biometric login support (#142)
- Implement offline mode for saved articles (#138)

### Fixes
- Fix crash on Android 14 when opening camera (#145)
- Resolve push notification badge count not clearing (#141)

### Maintenance
- Upgrade React Native to 0.73.2 (#139)
```

### 4. Automate store submissions

```text
Add Fastlane lanes that upload the iOS build to TestFlight and the Android bundle to Google Play internal testing track automatically after a successful build. Include store metadata (description, screenshots path, release notes) from a metadata/ directory.
```

### 5. Add version bumping automation

```text
Write a script that reads the current version from package.json, bumps it (major/minor/patch based on a parameter), updates package.json, ios/Info.plist, and android/app/build.gradle versionCode and versionName, commits the changes, and creates a git tag. Run it with: ./scripts/bump-version.sh minor
```

The agent generates the script and the team can now release with two commands: `./scripts/bump-version.sh minor && git push --tags`.

## Real-World Example

Nadia leads the mobile team at a 20-person SaaS startup. Before automation, releases took two developer-days every two weeks. After setting up this pipeline, any developer tags a commit and the entire build-sign-upload process runs in 18 minutes. Release notes are generated automatically from PR titles. The team moved to weekly releases and caught a signing certificate expiration proactively because the CI job flagged it three weeks early. Time spent on releases dropped from 16 hours per month to under one hour.
