---
name: macos-spm-app-packaging
description: >-
  Turns a Swift Package Manager executable into a real macOS .app without an Xcode project: builds the binary, assembles the bundle and Info.plist, signs it, and for distribution notarizes, staples and wraps it in a zip or disk image. Covers universal binaries, resources and icons, hardened runtime entitlements, reading the notary log, and Sparkle update feeds. Use when the user says "package my SwiftPM app", "make an .app from swift build", "no Xcode project", "sign and notarize", "Gatekeeper says the app is damaged", "notarization failed", "make a universal binary" or "ship a DMG".
license: Apache-2.0
compatibility: "macOS with Xcode or the Command Line Tools (swift, codesign, lipo, iconutil, hdiutil, ditto). Notarization needs Xcode 13 or later for notarytool and an Apple Developer Program membership with a Developer ID Application certificate."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["macos", "swiftpm", "codesign", "notarization", "app-bundle"]
---

# macOS SwiftPM App Packaging

## Overview

`swift build` produces a bare executable. macOS treats a program as an app only when that executable sits inside a bundle: a folder ending in `.app` with a fixed layout, an `Info.plist` that names the executable and the bundle identifier, and a code signature that seals both. Xcode normally creates all of that; with a SwiftPM-only project a script has to. This skill gives the layout, the script, the signing rules and the notarization sequence, with a check after every stage so a failure is caught where it happens instead of on a user's Mac.

## Instructions

### 1. Establish the facts

Ask the user:

- Who runs the result: only this Mac, a few testers, or the public? That decides the signing level (step 5).
- Bundle identifier, display name, marketing version and build number.
- The oldest macOS to support, and whether Intel Macs matter (universal binary).
- Is it a menu bar agent with no Dock icon?
- For public distribution: the Developer ID identity and the name of the stored notary profile. The Mac App Store is out of scope; it needs an Xcode archive and an installer package.

Read from the project: `Package.swift` (the executable target name, `platforms`, resources, dependencies that ship frameworks), `swift --version`, existing scripts under `Scripts/`, and the installed signing identities:

```bash
security find-identity -p codesigning -v     # lists identity names and SHA-1 hashes, no private keys
```

### 2. Build the executable

```bash
swift build --configuration release --product Skiff
swift build --configuration release --show-bin-path      # prints the folder that holds Skiff
```

For a universal binary, build each architecture and merge:

```bash
swift build --configuration release --product Skiff --triple arm64-apple-macosx
swift build --configuration release --product Skiff --triple x86_64-apple-macosx
lipo -create -output build/Skiff-universal \
  "$(swift build --configuration release --triple arm64-apple-macosx --show-bin-path)/Skiff" \
  "$(swift build --configuration release --triple x86_64-apple-macosx --show-bin-path)/Skiff"
lipo -archs build/Skiff-universal                        # x86_64 arm64
```

### 3. Assemble the bundle

```text
Skiff.app/
└── Contents/
    ├── Info.plist              # required; identifies the bundle
    ├── MacOS/Skiff             # the executable, same name as CFBundleExecutable
    ├── Resources/              # icon, images, data files; everything that is not code
    └── Frameworks/             # embedded frameworks and dylibs, only if the app ships any
```

Placement matters for signing: Mach-O code goes in `MacOS/` or `Frameworks/`, data goes in `Resources/`. A data file left in `MacOS/`, or anything at all in the bundle's top level beside `Contents/`, breaks the signature or slows notarization. Copy with `ditto`, which preserves the symlinks that frameworks depend on.

Minimum `Info.plist` keys:

| Key | Value for the example | Purpose |
|-----|-----------------------|---------|
| `CFBundleExecutable` | `Skiff` | File name inside `Contents/MacOS` |
| `CFBundleIdentifier` | `dev.pinecrest.Skiff` | Unique reverse-DNS identifier |
| `CFBundleName` | `Skiff` | Short user-visible name |
| `CFBundlePackageType` | `APPL` | Marks an application bundle |
| `CFBundleShortVersionString` | `1.4.0` | Version users see |
| `CFBundleVersion` | `37` | Build number; raise it on every release |
| `LSMinimumSystemVersion` | `14.0` | Must match `platforms` in `Package.swift` |
| `CFBundleIconFile` | `AppIcon` | `AppIcon.icns` in `Resources/` |
| `NSPrincipalClass` | `NSApplication` | Main class for a Cocoa app |
| `NSHighResolutionCapable` | `true` | Retina rendering |
| `LSUIElement` | `true`, menu bar agents only | No Dock icon |

**Icon.** Put PNGs named `icon_16x16.png` through `icon_512x512@2x.png` in `AppIcon.iconset`, then `iconutil -c icns AppIcon.iconset -o Resources/AppIcon.icns`.

**Resources.** Files the app target owns are simplest to keep in a plain `Resources/` folder at the repository root, copy into `Contents/Resources/`, and load with `Bundle.main`. Resource bundles that SwiftPM generates for dependencies (`*.bundle` folders in the bin path) also go into `Contents/Resources/`; launch the assembled app and exercise a feature that reads them, because where `Bundle.module` looks has changed between toolchains.

**Embedded frameworks.** Copy each into `Contents/Frameworks/` and make sure the executable has the run path `@executable_path/../Frameworks`.

### 4. Check the bundle before signing

```bash
plutil -lint build/Skiff.app/Contents/Info.plist       # OK
file build/Skiff.app/Contents/MacOS/Skiff              # Mach-O ... executable
lipo -archs build/Skiff.app/Contents/MacOS/Skiff       # the architectures you intended
```

### 5. Sign

| Audience | Identity | Command options |
|----------|----------|-----------------|
| This Mac, development loop | Ad hoc (`-`) | `codesign --force --sign - Skiff.app` |
| Other Macs | `Developer ID Application: …` | `--force --sign "$IDENTITY" --timestamp --options runtime`, plus `--entitlements` when needed |

Rules that prevent most failures:

- Sign from the inside out: every framework, dylib and helper in the bundle first, the app last. Do not sign with `--deep`; it applies one set of options and entitlements to everything and skips code in unexpected places. `--deep` is fine for verification.
- Put `--sign` before `--options`. `codesign` silently ignores `--options` when it comes first, and the hardened runtime will be missing.
- Entitlements belong on main executables only, never on libraries. Without the App Sandbox a plain app needs none; add a file only for hardened-runtime exceptions or protected resources the app really uses, for example `com.apple.security.device.audio-input` for the microphone. Never ship `com.apple.security.get-task-allow`.
- The entitlements file must be an XML property list: `plutil -lint Skiff.entitlements`.
- Any change to the bundle after signing (a copied file, an edited plist) invalidates the seal. Sign last.
- Do not run `codesign` under `sudo`.

Verify:

```bash
codesign --verify --deep --strict --verbose=2 build/Skiff.app
codesign --display --verbose=4 build/Skiff.app            # identity, flags (runtime), Timestamp
codesign --display --entitlements - build/Skiff.app
```

### 6. Notarize and staple (Developer ID only)

Credentials are stored once by the user, interactively, so the password never passes through the agent or a script:

```bash
xcrun notarytool store-credentials "skiff-notary" --apple-id "dana@pinecrest.dev" --team-id Q4T7M2XK9D
```

`notarytool` then prompts for an app-specific password. On CI, pass an App Store Connect API key instead: `--key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID"`.

```bash
ditto -c -k --keepParent build/Skiff.app build/Skiff-notarize.zip
xcrun notarytool submit build/Skiff-notarize.zip --keychain-profile "skiff-notary" --wait
xcrun stapler staple build/Skiff.app
xcrun stapler validate build/Skiff.app
spctl -vvv --assess --type exec build/Skiff.app
ditto -c -k --keepParent build/Skiff.app build/Skiff-1.4.0.zip     # the file users download
```

The notary service accepts zip archives, UDIF disk images and signed flat installer packages, not a bare `.app`. A zip cannot be stapled, so staple the app and zip it again. When the status is anything other than `Accepted`, fetch the log with the submission ID and read every issue; read it on success too, since it lists warnings:

```bash
xcrun notarytool log 2efe2717-52ef-43a5-96dc-0797e4ca1041 --keychain-profile "skiff-notary" build/notary-log.json
```

| Message in the log | Fix |
|--------------------|-----|
| The signature does not include a secure timestamp. | Add `--timestamp`; signing needs network access |
| The executable does not have the hardened runtime enabled. | Add `--options runtime` after `--sign` |
| The executable requests the com.apple.security.get-task-allow entitlement. | Remove it from the entitlements file and re-sign |
| The binary is not signed with a valid Developer ID certificate. | Ad hoc or development identity was used; sign with Developer ID Application |
| The signature of the binary is invalid. | A nested item was changed or signed after its parent; re-sign inside out |
| Embedded entitlements are invalid | `plutil -convert xml1 Skiff.entitlements`, then re-sign |

For a disk image instead of a zip: fill a folder with the stapled app using `ditto`, run `hdiutil create -srcFolder build/dmg-root -o build/Skiff-1.4.0.dmg`, sign it with `codesign --sign "$IDENTITY" --timestamp -i dev.pinecrest.Skiff.dmg build/Skiff-1.4.0.dmg`, submit the image to the notary service and staple the image itself. With nested containers, notarize only the outermost one.

### 7. Updates with Sparkle (optional)

Add `SUFeedURL` (where the appcast is hosted) and `SUPublicEDKey` (printed by Sparkle's `generate_keys`) to `Info.plist`, embed `Sparkle.framework` in `Contents/Frameworks/` and sign it before the app. After notarizing a release, put the archive in an updates folder and run Sparkle's `generate_appcast` on that folder; it signs the archive and writes the feed. Sparkle compares `CFBundleVersion`, so a release whose build number did not increase is never offered.

### 8. Hand over

Commit the script, the `Info.plist` template values and the entitlements file. Tell the user which stage each check passed, the path of the artifact, and what they still have to do themselves (store notary credentials, upload the file).

## Examples

### Example 1: package and run locally

**Request:** "Skiff builds with `swift build`. Give me one command that produces Skiff.app I can open."

```bash
#!/usr/bin/env bash
# Scripts/package.sh [debug|release] — build Skiff and assemble a fresh Skiff.app
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="${1:-debug}"
VERSION="${SKIFF_VERSION:-1.4.0}"
BUILD="${SKIFF_BUILD:-37}"
STAGE="build/$CONFIG-$(date +%Y%m%d-%H%M%S)"     # a new folder each run: no stale files, nothing deleted
APP="$STAGE/Skiff.app"

swift build --configuration "$CONFIG" --product Skiff
BIN="$(swift build --configuration "$CONFIG" --show-bin-path)"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
ditto "$BIN/Skiff" "$APP/Contents/MacOS/Skiff"
ditto Resources "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>Skiff</string>
  <key>CFBundleIdentifier</key><string>dev.pinecrest.Skiff</string>
  <key>CFBundleName</key><string>Skiff</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

plutil -lint "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
codesign --verify --strict --verbose=2 "$APP"
echo "$APP" > build/latest.txt
```

```bash
Scripts/package.sh && open "$(cat build/latest.txt)"
```

**Result:** the script prints `Info.plist: OK` and `Skiff.app: valid on disk`, and the app opens with its own Dock icon and menu. `build/latest.txt` holds the bundle path for the next step. Add `build/` to `.gitignore`.

### Example 2: a notarized release

**Request:** "Ship 1.4.0 to testers on other Macs. The notary profile is skiff-notary."

```bash
Scripts/package.sh release
APP="$(cat build/latest.txt)"
IDENTITY="Developer ID Application: Pinecrest Labs (Q4T7M2XK9D)"

codesign --force --sign "$IDENTITY" --timestamp --options runtime "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
ditto -c -k --keepParent "$APP" build/Skiff-notarize.zip
xcrun notarytool submit build/Skiff-notarize.zip --keychain-profile "skiff-notary" --wait
xcrun stapler staple "$APP" && xcrun stapler validate "$APP"
spctl -vvv --assess --type exec "$APP"
ditto -c -k --keepParent "$APP" build/Skiff-1.4.0.zip
```

**Result:**

```text
  id: 6c1d0f5e-9a47-4b21-8f03-5d2e7a1b9c44
  status: Accepted
The staple and validate action worked!
build/release-20261001-141207/Skiff.app: accepted
source=Notarized Developer ID
```

`build/Skiff-1.4.0.zip` is the file to send. If `status` had been `Invalid`, the next command would be `xcrun notarytool log` with that ID, and nothing would be stapled or shipped.

## Guidelines

- Rebuild the bundle from scratch for each release. Reusing a bundle folder leaves files from earlier builds inside the seal.
- An ad hoc signature works only on the Mac that made it. On another Mac a downloaded, un-notarized app is blocked by Gatekeeper, often with a "damaged" message; the fix is Developer ID signing plus notarization, not asking users to strip the quarantine attribute.
- Test the downloaded artifact, ideally on a second Mac: unzip it in Downloads and open it there. When a user opens the app without moving it first, Gatekeeper gives it a randomized path for that launch, which breaks apps that expect files next to the bundle.
- Never put a password, an app-specific password or a `.p8` key in a script or the repository. Use a keychain profile locally and environment variables that point to the key on CI.
- Notarization usually finishes within minutes but can take longer; `--wait` blocks until it ends. Keep submissions under 75 per day and do not resubmit in a loop on failure.
- Stapling needs network access and must be repeated after re-signing, because signing discards the stapled ticket.
- A SwiftUI app started with `swift run` has no bundle, so it may not come to the front, show a Dock icon or accept keyboard input. Judge behaviour from the packaged app.
- Use Xcode or a project generator instead when the app needs app extensions, a provisioning profile for restricted entitlements (iCloud, push, keychain access groups), asset catalogs, or the Mac App Store.
