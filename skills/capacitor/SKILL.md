---
name: capacitor
description: >-
  Turn web apps into native mobile apps with Capacitor — access native device
  APIs from JavaScript. Use when someone asks to "convert my website to a mobile
  app", "Capacitor", "web to native app", "access camera from JavaScript",
  "deploy web app to App Store", "hybrid mobile app", or "Ionic Capacitor".
  Covers native API access, plugin system, web-to-native bridge, and app
  store deployment.
license: Apache-2.0
compatibility: "Any web framework (React, Vue, Angular, Svelte). iOS + Android."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["mobile", "capacitor", "hybrid", "native", "ios"]
---

# Capacitor

## Overview

Capacitor wraps your web app in a native container and gives it access to native device APIs — camera, file system, push notifications, biometrics, geolocation, and more. Your existing React/Vue/Angular/Svelte app becomes an iOS and Android app without rewriting in Swift or Kotlin. Built by the Ionic team, it's the modern replacement for Cordova/PhoneGap.

## When to Use

- Have a web app and want native iOS/Android versions
- Need native device features (camera, push notifications, biometrics)
- Want one codebase for web + iOS + Android
- Converting a PWA to a native app for App Store distribution
- Team knows web tech but not Swift/Kotlin

## Instructions

### Setup

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My App" com.mycompany.myapp

# Add platforms
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

### Build and Run

```bash
# Build your web app first
npm run build

# Copy web assets to native projects
npx cap sync

# Open in native IDE
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio

# Or run directly
npx cap run ios --target "iPhone 15"
npx cap run android
```

### Native Plugins

```bash
# Install plugins
npm install @capacitor/camera @capacitor/filesystem @capacitor/push-notifications
npm install @capacitor/haptics @capacitor/share @capacitor/browser
npx cap sync
```

```typescript
// src/native/camera.ts — Access the device camera
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

async function takePhoto(): Promise<string> {
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
  });
  return photo.webPath!;  // File URI to display in <img>
}

async function pickFromGallery(): Promise<string[]> {
  const photos = await Camera.pickImages({
    quality: 80,
    limit: 5,
  });
  return photos.photos.map((p) => p.webPath!);
}
```

```typescript
// src/native/notifications.ts — Push notifications
import { PushNotifications } from "@capacitor/push-notifications";

async function registerPush() {
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive === "granted") {
    await PushNotifications.register();
  }

  PushNotifications.addListener("registration", (token) => {
    console.log("FCM Token:", token.value);
    // Send token to your server
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Received:", notification.title, notification.body);
  });
}
```

```typescript
// src/native/filesystem.ts — File system access
import { Filesystem, Directory } from "@capacitor/filesystem";

async function saveFile(data: string, filename: string) {
  await Filesystem.writeFile({
    path: filename,
    data: data,
    directory: Directory.Documents,
  });
}

async function readFile(filename: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: filename,
    directory: Directory.Documents,
  });
  return result.data as string;
}
```

### Platform Detection

```typescript
// src/utils/platform.ts — Adapt behavior per platform
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

// Use native features when available, fallback to web
async function share(text: string) {
  if (isNative) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ text });
  } else {
    navigator.share?.({ text }) ?? navigator.clipboard.writeText(text);
  }
}
```

## Examples

### Example 1: Convert a React app to mobile

**User prompt:** "I have a React web app. Make it available on iOS and Android."

The agent will add Capacitor, configure native projects, add platform detection for native features, and prepare for App Store/Play Store submission.

### Example 2: Add camera and file upload

**User prompt:** "Add photo capture and file upload to my mobile web app."

The agent will install Capacitor camera and filesystem plugins, create a photo capture component with gallery fallback, and implement file upload.

## Guidelines

- **`npx cap sync` after every web build** — copies assets to native projects
- **`npx cap run` for testing** — faster than opening IDE each time
- **Platform detection** — `Capacitor.isNativePlatform()` for conditional native features
- **Plugins are web-compatible** — most plugins have web fallbacks
- **Live reload for development** — `npx cap run ios --livereload`
- **Custom native code** — write Swift/Kotlin plugins when needed
- **App Store deployment** — Xcode for iOS, Android Studio for Android
- **`capacitor.config.ts`** — configure server URL, plugins, app info
- **Permissions in native config** — camera, location, etc. need Info.plist/AndroidManifest entries
- **Not for gaming** — great for content apps, tools, dashboards; use Unity/Flutter for games
