---
name: capacitor
description: >-
  Capacitor is a runtime that packages a web app as a native iOS and Android
  app and exposes native device APIs to JavaScript. Use when someone asks to
  "convert my website to a mobile app", "Capacitor", "web to native app",
  "access camera from JavaScript", "deploy web app to App Store", "hybrid
  mobile app", or "Ionic Capacitor".
  Covers native API access, plugin system, web-to-native bridge, and app
  store deployment.
license: Apache-2.0
compatibility: "Capacitor 8: Node.js 22+, any web framework (React, Vue, Angular, Svelte). iOS builds need macOS with Xcode 26+; Android builds need Android Studio 2025.2.1+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/ionic-team/capacitor
  tags: ["mobile", "capacitor", "hybrid", "native", "ios"]
---

# Capacitor

## Overview

Capacitor wraps your web app in a native container and gives it access to native device APIs — camera, file system, push notifications, biometrics, geolocation, and more. Your existing React/Vue/Angular/Svelte app becomes an iOS and Android app without rewriting in Swift or Kotlin. Built by the Ionic team, it's the modern replacement for Cordova/PhoneGap. This skill targets Capacitor 8 (iOS 15+, Android 7 / API 24+).

## When to Use

- Have a web app and want native iOS/Android versions
- Need native device features (camera, push notifications, biometrics)
- Want one codebase for web + iOS + Android
- Converting a PWA to a native app for App Store distribution
- Team knows web tech but not Swift/Kotlin

## Instructions

### Setup

The web project needs a `package.json` and a build output directory (`dist`, `build`, `www`) whose `index.html` has a `<head>` tag.

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init "Trailhead" dev.fernhill.trailhead --web-dir dist

# Add platforms
npm install @capacitor/ios @capacitor/android
npx cap add ios        # Swift Package Manager project (default since Capacitor 8)
npx cap add android
```

`cap init` writes `capacitor.config.ts` (or `.json` when TypeScript is not installed) with the first three keys; plugin settings are added by hand. With TypeScript 7 the CLI loads the `.ts` config through Node's ES-module loader, so `package.json` needs `"type": "module"` (Vite templates have it); without it every `cap` command stops with `Parsing capacitor.config.ts failed`:

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.fernhill.trailhead",
  appName: "Trailhead",
  webDir: "dist",
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
```

### Build and Run

```bash
# Build your web app first
npm run build

# Copy web assets to native projects and update native dependencies
npx cap sync

# Open in native IDE
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio

# Or run directly (run = sync + build + deploy)
npx cap run ios --list                      # available simulators and devices
npx cap run ios --target-name "iPhone 17"   # or --target with an id from --list
npx cap run android

# Live reload from a running dev server (e.g. Vite on port 5173)
npx cap run android --live-reload --port 5173

# Signed release build from the terminal
npx cap build android --androidreleasetype AAB \
  --keystorepath release.keystore --keystorepass "$ANDROID_KEYSTORE_PASSWORD" \
  --keystorealias upload --keystorealiaspass "$ANDROID_KEY_PASSWORD"
```

### Native Plugins

```bash
# Install plugins
npm install @capacitor/camera @capacitor/filesystem @capacitor/push-notifications
npm install @capacitor/haptics @capacitor/share @capacitor/browser
npx cap sync
```

```typescript
// src/native/camera.ts — Access the device camera (@capacitor/camera 8.1+)
import { Camera, CameraDirection, MediaTypeSelection } from "@capacitor/camera";

export async function takePhoto(): Promise<string | undefined> {
  const photo = await Camera.takePhoto({
    quality: 80,
    cameraDirection: CameraDirection.Rear,
    saveToGallery: false,
  });
  return photo.webPath;  // Path to display in an <img> element
}

export async function pickFromGallery(): Promise<string[]> {
  const { results } = await Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: true,
    limit: 5,
  });
  return results.flatMap((item) => (item.webPath ? [item.webPath] : []));
}
```

`Camera.getPhoto()` and `Camera.pickImages()` still work but are deprecated since plugin version 8.1; new code should use `takePhoto` and `chooseFromGallery`.

```typescript
// src/native/notifications.ts — Push notifications (iOS and Android only)
import { PushNotifications } from "@capacitor/push-notifications";

export async function registerPush(sendTokenToServer: (token: string) => Promise<void>) {
  // Attach listeners before register() so the first event is not missed
  await PushNotifications.addListener("registration", (token) => {
    void sendTokenToServer(token.value);  // FCM token on Android, APNs token on iOS
  });
  await PushNotifications.addListener("registrationError", (err) => {
    console.error("Push registration failed:", err.error);
  });
  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Received:", notification.title, notification.body);
  });

  let status = await PushNotifications.checkPermissions();
  if (status.receive === "prompt") status = await PushNotifications.requestPermissions();
  if (status.receive !== "granted") throw new Error("Push permission denied");
  await PushNotifications.register();
}
```

```typescript
// src/native/filesystem.ts — File system access
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export async function saveFile(data: string, filename: string) {
  await Filesystem.writeFile({
    path: filename,
    data: data,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,  // Without an encoding, data must be base64
  });
}

export async function readFile(filename: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: filename,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  return result.data as string;
}
```

### Platform Detection

```typescript
// src/utils/platform.ts — Adapt behavior per platform
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
export const hasPush = Capacitor.isPluginAvailable("PushNotifications");

// Use the native share sheet when available, fall back to the clipboard
export async function shareLink(title: string, url: string) {
  const { value: canShare } = await Share.canShare();
  if (canShare) await Share.share({ title, url });
  else await navigator.clipboard.writeText(url);
}
```

## Examples

### Example 1: Convert a React app to mobile

**User prompt:** "I have a React web app built with Vite. Make it available on iOS and Android."

```bash
npm install @capacitor/core @capacitor/ios @capacitor/android
npm install -D @capacitor/cli
npx cap init "Trailhead" dev.fernhill.trailhead --web-dir dist
npm run build
npx cap add android && npx cap add ios
npx cap sync
npx cap run android
```

`cap add` creates the `android/` and `ios/` folders (commit them), and `cap sync` reports each step (Android part shown; iOS prints the same):

```text
✔ Copying web assets from dist to android/app/src/main/assets/public in 1.36ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 229.50μs
✔ copy android in 3.65ms
✔ Updating Android plugins in 232.46μs
✔ update android in 8.14ms
[info] Sync finished in 0.021s
```

The app then installs and opens on the connected emulator or device. `npx cap doctor` lists installed versus latest Capacitor packages when something looks off.

### Example 2: Add camera and file upload

**User prompt:** "Add photo capture and file upload to my mobile web app."

```bash
npm install @capacitor/camera
npx cap sync
```

Add `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` strings to `ios/App/App/Info.plist`, then upload the captured file:

```typescript
import { takePhoto } from "./native/camera";

export async function uploadReceipt(): Promise<void> {
  const webPath = await takePhoto();
  if (!webPath) return;
  const blob = await (await fetch(webPath)).blob();
  const form = new FormData();
  form.append("receipt", blob, "receipt.jpg");
  await fetch(`${import.meta.env.VITE_API_URL}/receipts`, { method: "POST", body: form });
}
```

On a device the native camera opens and the photo is posted as multipart form data; in a browser the same code falls back to a file input (or the PWA Elements camera UI if installed).

## Guidelines

- **`npx cap sync` after every web build and every plugin install** — copies assets and updates native dependencies
- **`npx cap run` for testing** — faster than opening IDE each time
- **Platform detection** — `Capacitor.isNativePlatform()` for conditional native features
- **Not every plugin runs on the web** — Camera, Filesystem and Share have web implementations; Push Notifications does not. Guard with `Capacitor.isPluginAvailable()`
- **Live reload for development** — `npx cap run ios --live-reload --host 192.168.1.68 --port 5173`; the dev server must listen on `0.0.0.0` and the device must be on the same network. Never commit a `server.url` entry in the config
- **Custom native code** — write Swift/Kotlin plugins when needed
- **App Store deployment** — archive in Xcode for iOS; Android Studio or `npx cap build android` for Android. iOS builds require a Mac
- **`capacitor.config.ts`** — configure server URL, plugins, app info
- **Permissions in native config** — camera, location, etc. need `Info.plist` usage descriptions; on Android the Camera plugin needs no permission unless `saveToGallery` is used
- **Push setup is native** — Android needs the Firebase `google-services.json` in `android/app/`; iOS needs the Push Notifications capability and the two `AppDelegate.swift` forwarding methods from the plugin README
- **Upgrading** — keep `@capacitor/core`, `cli`, `ios` and `android` on the same version; `npx cap migrate` moves a Capacitor 7 project to 8 (Node 22+, Xcode 26+, iOS 15 deployment target, `minSdkVersion` 24). New iOS projects use Swift Package Manager; pass `--packagemanager CocoaPods` to `cap add ios` to keep CocoaPods
- **Not for gaming** — great for content apps, tools, dashboards; use Unity/Flutter for games
