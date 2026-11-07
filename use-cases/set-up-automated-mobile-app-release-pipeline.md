---
title: "Set Up an Automated Mobile App Release Pipeline with AI"
slug: set-up-automated-mobile-app-release-pipeline
description: "Use AI to configure CI/CD for iOS and Android builds, automate versioning, and streamline app store submissions."
skills: [cicd-pipeline, changelog-generator, coding-agent, github-actions, fastlane]
category: devops
tags: [mobile, release, ci-cd, app-store, automation]
---

# Set Up an Automated Mobile App Release Pipeline with AI

## The Problem

Nadia leads a mobile team of four that ships a React Native app to both iOS and Android. Every release takes two developer-days. The process looks like this: one developer manually bumps version numbers in four files (package.json, the Xcode project's marketing version, build.gradle versionCode, build.gradle versionName). Another opens Xcode and builds the iOS archive, then opens Android Studio for the Android bundle. A third writes release notes from memory -- "I think we fixed that crash on Android 14? And there was a biometric login feature, right?" Someone uploads both binaries to App Store Connect and Google Play Console by hand.

Builds fail when signing certificates expire. Version codes get reused, which Google Play rejects with a confusing error. Release notes are inconsistent between platforms. The team ships biweekly but wants to move to weekly releases. At two developer-days per release, weekly releases would burn a tenth of the team's capacity (2 of 20 developer-days) on the release process alone, and each one pulls people off feature work.

## The Solution

Use the **coding-agent** skill to delegate the build-out of each piece to a coding agent with a tightly scoped brief. The **github-actions** skill covers the workflow that triggers on a version tag (the **cicd-pipeline** skill covers the same stages as GitLab CI or CircleCI config, if that is where your repository lives). The **fastlane** skill covers the lanes that sign, build and upload. The **changelog-generator** skill writes the release notes from the commit history, and the same text goes to GitHub, TestFlight and Google Play.

## Step-by-Step Walkthrough

### Step 1: Delegate the scaffolding to a coding agent

Give each piece its own short, self-contained task (workflow, Fastfile, Gradle signing, version script) and review each diff before merging. A brief for the first one:

```text
Create .github/workflows/release.yml for our React Native app. Trigger on tags matching v*.
Jobs: notes (extracts the tag's section from CHANGELOG.md), ios (macos-latest) and android
(ubuntu-latest) running `bundle exec fastlane ios beta` / `android beta`. Secrets come from
GitHub Actions secrets only. Do not change app code.
```

### Step 2: The workflow

`.github/workflows/release.yml` splits iOS and Android into parallel jobs because they need different runners:

```yaml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write   # create the GitHub Release

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Extract this version's section of CHANGELOG.md
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          awk -v v="$VERSION" '$0 ~ "^## \\[" v "\\]" {f=1; next} /^## \[/ {f=0} f' CHANGELOG.md > RELEASE_NOTES.md
          test -s RELEASE_NOTES.md
      - uses: actions/upload-artifact@v7
        with: { name: release-notes, path: RELEASE_NOTES.md }
      - name: Create the GitHub Release
        env: { GH_TOKEN: "${{ github.token }}" }
        run: gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --notes-file RELEASE_NOTES.md

  ios:
    needs: notes
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/download-artifact@v8
        with: { name: release-notes }
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: ruby/setup-ruby@v1
        with: { bundler-cache: true }   # reads the root Gemfile (gem "fastlane")
      - run: cd ios && bundle exec pod install
      - run: |
          { echo 'RELEASE_NOTES<<NOTES_EOF'; cat RELEASE_NOTES.md; echo 'NOTES_EOF'; } >> "$GITHUB_ENV"
          echo "APP_VERSION=${GITHUB_REF_NAME#v}" >> "$GITHUB_ENV"
      - run: bundle exec fastlane ios beta
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: ${{ secrets.ASC_KEY_P8 }}

  android:
    needs: notes
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/download-artifact@v8
        with: { name: release-notes }
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: actions/setup-java@v6
        with: { distribution: temurin, java-version: '17' }
      - uses: ruby/setup-ruby@v1
        with: { bundler-cache: true }
      - name: Prepare keystore, Play credentials and store changelog
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          PLAY_JSON_KEY: ${{ secrets.PLAY_JSON_KEY }}
        run: |
          echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.keystore"
          printf '%s' "$PLAY_JSON_KEY" > "$RUNNER_TEMP/play.json"
          mkdir -p fastlane/metadata/android/en-US/changelogs
          head -c 500 RELEASE_NOTES.md > fastlane/metadata/android/en-US/changelogs/default.txt
          echo "KEYSTORE_PATH=$RUNNER_TEMP/release.keystore" >> "$GITHUB_ENV"
          echo "PLAY_JSON_KEY_PATH=$RUNNER_TEMP/play.json" >> "$GITHUB_ENV"
          echo "APP_VERSION=${GITHUB_REF_NAME#v}" >> "$GITHUB_ENV"
      - run: bundle exec fastlane android beta
        env:
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
```

Both jobs run at the same time after the notes job, so wall-clock time is set by the slower build (usually iOS), not the sum. Pin the action majors to what the **github-actions** skill lists, and check each action's Releases page before bumping.

### Step 3: Code signing and Fastlane lanes

Code signing is where mobile releases go to die. Certificates expire, provisioning profiles drift, and the keystore password is in a Slack message from 2023. The **fastlane** skill covers `match`, which keeps certificates and profiles in a private encrypted Git repo, and `setup_ci`, which creates a temporary keychain on the CI machine.

```ruby
# fastlane/Fastfile
default_platform(:ios)

platform :ios do
  lane :beta do
    setup_ci   # temporary keychain; makes match read-only on CI
    api_key = app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"],
      issuer_id: ENV["ASC_ISSUER_ID"],
      key_content: ENV["ASC_KEY_P8"],      # contents of the .p8 file
    )
    match(type: "appstore", readonly: true, api_key: api_key)

    increment_version_number(xcodeproj: "ios/MyApp.xcodeproj", version_number: ENV["APP_VERSION"])
    increment_build_number(
      xcodeproj: "ios/MyApp.xcodeproj",
      build_number: latest_testflight_build_number(api_key: api_key) + 1,
    )
    build_app(workspace: "ios/MyApp.xcworkspace", scheme: "MyApp", export_method: "app-store")
    upload_to_testflight(
      api_key: api_key,
      changelog: ENV["RELEASE_NOTES"],
      skip_waiting_for_build_processing: true,
    )
  end
end

platform :android do
  lane :beta do
    code = google_play_track_version_codes(
      package_name: "com.example.myapp", track: "internal", json_key: ENV["PLAY_JSON_KEY_PATH"],
    ).max + 1
    gradle(
      project_dir: "android", task: "bundle", build_type: "Release",
      properties: { "versionCode" => code, "versionName" => ENV["APP_VERSION"] },
    )
    upload_to_play_store(
      package_name: "com.example.myapp", track: "internal",
      json_key: ENV["PLAY_JSON_KEY_PATH"],
      skip_upload_metadata: true, skip_upload_images: true, skip_upload_screenshots: true,
    )
  end
end
```

`android/app/build.gradle` reads the version properties and the signing secrets from the environment, so the keystore never touches a developer's machine:

```groovy
android {
  defaultConfig {
    versionCode (project.findProperty("versionCode") ?: "1").toInteger()
    versionName project.findProperty("versionName") ?: "0.0.0"
  }
  signingConfigs {
    release {
      storeFile System.getenv("KEYSTORE_PATH") ? file(System.getenv("KEYSTORE_PATH")) : null
      storePassword System.getenv("KEYSTORE_PASSWORD")
      keyAlias System.getenv("KEY_ALIAS")
      keyPassword System.getenv("KEY_PASSWORD")
    }
  }
  buildTypes { release { signingConfig signingConfigs.release } }
}
```

Version codes never collide because each release asks Google Play for the highest code already on the internal track and adds one. The first upload of a brand-new app must still be done by hand in Play Console, and the Play service account needs access to the app. On CI, `match` runs read-only, so when a certificate expires a maintainer renews it once on a laptop with `bundle exec fastlane match appstore` (without `--readonly`) and CI picks up the new one.

### Step 4: Release notes from the commit history

Release notes written from memory are unreliable. Release notes generated from the actual commits are accurate by definition. Before tagging, ask the agent to use the **changelog-generator** skill:

```text
Write the CHANGELOG.md entry for the next release from the commits since the last tag.
Keep a Changelog format (Added / Changed / Fixed), user-facing wording, PR numbers.
Show me the entry before writing it.
```

The skill reads `git log` since the last tag, sorts commits by their Conventional Commit prefix (`feat:` goes under Added, `fix:` under Fixed) or by reading the diff when there is no prefix, and prepends an entry like this:

```markdown
## [2.4.0] - 2026-10-20

### Added
- Add biometric login support (#142)
- Implement offline mode for saved articles (#138)

### Fixed
- Fix crash on Android 14 when opening the camera (#145)
- Resolve push notification badge count not clearing (#141)
```

The workflow in Step 2 extracts exactly that section and uses it as the GitHub Release body, the TestFlight "What to Test" text, and the Google Play changelog (Play accepts 500 characters per language, so the workflow trims it with `head -c 500`; write the first lines of each entry accordingly). One source, three destinations, no rewriting.

### Step 5: Bump the version and tag

The version lives in `package.json` only. The Fastlane lanes copy it to the Xcode project and Gradle at build time, so there is nothing else to edit. After the changelog entry is committed:

```console
$ npm version minor -m "chore: bump version to %s"
v2.4.0
$ git push --follow-tags
```

`npm version` bumps `package.json`, commits, and creates the tag `v2.4.0`; the tag push triggers the workflow. Promoting a build from internal testing or TestFlight to public release stays a separate, deliberate step: the team reviews the build and a human makes the go/no-go decision.

## Real-World Example

Nadia's team starts using the pipeline on a Tuesday. The first automated release goes out Wednesday morning: the tag push builds both apps, and TestFlight and the Play internal track receive them while the team is at standup. The changelog generator picks up all 6 merged PRs since the last tag and groups them cleanly.

In the old process a lapsed signing certificate surfaced on release day, as a failed Xcode build and a scramble to regenerate the certificate. Now the failure is the same CI job on a Tuesday, and the fix is a single `match` command on one laptop.

After one month, the team measures time spent on releases at under one hour, down from about 32 hours per month (two releases at two developer-days each), and moves to weekly releases. Version codes never conflict because they come from Google Play's own track, and release notes come from commit history, not human memory.

## Related Skills

- **coding-agent** -- delegate each piece (workflow, Fastfile, Gradle signing) as a scoped task and review every diff
- **github-actions** -- the tag-triggered workflow, permissions, secrets and current action versions
- **cicd-pipeline** -- the same stages as GitLab CI or CircleCI configuration
- **fastlane** -- lanes, `match` code signing, TestFlight and Play uploads
- **changelog-generator** -- release notes from the commit history, in Keep a Changelog format
