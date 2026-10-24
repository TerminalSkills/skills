---
name: expo
description: >-
  Build, deploy, and update React Native apps with Expo. Covers file-based
  routing with Expo Router (stacks, tabs, drawers, deep linking), EAS Build
  and Submit, over-the-air updates, and 50+ SDK modules for camera, location,
  notifications. Use when setting up Expo, adding navigation, configuring
  builds, or integrating native device APIs. Trigger words: expo, expo router,
  eas build, react native expo, file-based routing mobile, deep linking.
license: Apache-2.0
compatibility: "Expo SDK 57-58 (expo 58.0.x); Node.js 22.13+ or 24.3+; iOS, Android, Web. Cloud builds need an Expo account."
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags: ["expo", "react-native", "mobile", "routing", "eas"]
  repository: https://github.com/expo/expo
---

# Expo

## Overview

Expo is a development platform for React Native providing file-based routing (Expo Router), cloud builds (EAS Build), store submissions (EAS Submit), over-the-air updates (EAS Update), and 50+ SDK modules for native device APIs. Ship iOS, Android, and web apps from one codebase without managing Xcode or Android Studio.

## Instructions

### Setup

```bash
npx create-expo-app@latest fieldnotes --template default@sdk-58
cd fieldnotes && npx expo start
```

The `default` template already includes Expo Router and TypeScript (`tabs` and `blank` templates also exist). While SDK 58 is rolling out, `create-expo-app@latest` without `--template` creates an SDK 57 project, which is the one to pick if you test on a physical device with Expo Go. Install packages with `npx expo install <pkg>` so versions match the SDK, and run `npx expo-doctor` to find mismatches.

### File-Based Routing (Expo Router)

Drop a file in `app/`, get a screen. Folder structure defines navigation hierarchy.

```
app/
├── _layout.tsx          # Root layout (wraps all screens)
├── index.tsx            # / (home screen)
├── about.tsx            # /about
├── (tabs)/              # Tab navigation group
│   ├── _layout.tsx      # Tab bar configuration
│   ├── index.tsx        # First tab
│   ├── explore.tsx      # Second tab
│   └── profile.tsx      # Third tab
├── settings/
│   ├── _layout.tsx      # Stack layout for settings
│   ├── index.tsx        # /settings
│   └── account.tsx      # /settings/account
├── post/
│   └── [slug].tsx       # /post/my-first-post (dynamic route)
└── +not-found.tsx       # 404 screen
```

### Root Layout

```tsx
// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
```

### Tab Navigation

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#007AFF" }}>
      <Tabs.Screen name="index" options={{
        title: "Home",
        tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
      }} />
      <Tabs.Screen name="explore" options={{
        title: "Explore",
        tabBarIcon: ({ color }) => <Ionicons name="compass" size={24} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "Profile",
        tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
      }} />
    </Tabs>
  );
}
```

### Navigation and Dynamic Routes

```tsx
import { Link, router, useLocalSearchParams } from "expo-router";

// Declarative: <Link href="/post/hello-world">My Post</Link>
// Programmatic: router.push("/settings/account")

// app/post/[slug].tsx — Dynamic route
import { Text } from "react-native";

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Text>{slug}</Text>;
}
```

### Deep Linking (Automatic)

Every route gets a URL automatically. Configure the scheme in `app.json`:

```json
{ "expo": { "scheme": "myapp" } }
```

- `myapp://` -> Home screen
- `myapp://post/hello-world` -> Post screen
- `https://fieldnotes.app/post/hello-world` -> same screen via universal links / app links, which additionally need `ios.associatedDomains` and Android `intentFilters` in the app config plus a hosted association file on your domain.

### Expo SDK Modules

```typescript
// Camera
import { CameraView, useCameraPermissions } from "expo-camera";
// Render <CameraView ref={cameraRef} facing="back" /> once permission.granted is true
const [permission, requestPermission] = useCameraPermissions();
const photo = await cameraRef.current?.takePictureAsync();

// Push Notifications (remote push needs a development build on Android, not Expo Go)
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
const token = await Notifications.getExpoPushTokenAsync({ projectId });

// Secure Storage
import * as SecureStore from "expo-secure-store";
await SecureStore.setItemAsync("session_token", sessionJwt);
```

### EAS Build, Submit, and Update

```bash
npm install --global eas-cli      # or run commands as: npx eas-cli@latest <command>
eas login
eas build:configure               # creates eas.json (development, preview, production profiles)
eas update:configure              # adds runtimeVersion, updates.url and the channel per profile
eas build --platform ios          # Cloud build -> .ipa
eas build --platform android      # production profile -> .aab (use a preview profile for an .apk)
eas submit --platform ios         # App Store Connect
eas submit --platform android     # Google Play Console
eas update --channel production --environment production --message "Fix login crash"   # OTA update
eas update:rollback               # roll back a bad update
```

OTA updates ship JavaScript and assets only. A build only receives updates whose runtime version matches its own; `eas update:configure` sets `"runtimeVersion": { "policy": "appVersion" }`, and the `"fingerprint"` policy changes the runtime version whenever native code or config changes. Anything that touches native code needs a new build. For SDK 55+ projects, `eas update` outside CI asks which EAS environment to use unless `--environment` is given, so pass it in scripts.

## Examples

### Example 1: Social app with tabs, stacks, and modals

**User prompt:** "Set up navigation for a social app — tabs for feed/search/profile, stack for post details, and modal for creating posts."

The agent creates a tab layout in `app/(tabs)/_layout.tsx`, nested stack routes for post details, and a modal route with `presentation: "modal"`. Deep linking works automatically for every route.

### Example 2: Ship an urgent bug fix via OTA update

**User prompt:** "Push an urgent fix to production without app store review."

The agent fixes the JavaScript code, checks that no native dependency or config changed (otherwise a new build is required), runs `eas update --channel production --environment production --message "Fix login crash"`, optionally limits exposure with `--rollout-percentage 10`, and uses `eas update:rollback` if the fix misbehaves.

## Guidelines

- **File = route** — `app/about.tsx` becomes `/about`
- **`_layout.tsx`** for navigation containers (Stack, Tabs, Drawer)
- **`(group)`** for route groups — organize without affecting URL
- **`[param]`** for dynamic routes — access via `useLocalSearchParams`
- **Deep linking is automatic** — every route has a URL
- Use `expo-image` over `Image` for better caching and modern format support
- Store secrets in `expo-secure-store`, never AsyncStorage
- Use config plugins instead of ejecting to keep managed workflow
- Use development builds (`eas build --profile development`) for custom native modules and for Android push notifications; Expo Go cannot run them
- Prefer `npx expo install` over `npm install` for SDK packages, and treat `expo-doctor` warnings as bugs
- In SDK 58 and later, native tabs come from `expo-router/native-tabs` (`expo-router/unstable-native-tabs` in SDK 54-57)
- Use EAS Build for reproducible cross-platform builds without local Xcode/Android Studio
