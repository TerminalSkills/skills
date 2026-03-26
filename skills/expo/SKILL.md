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
compatibility: "Expo SDK 50+, Node.js 18+. iOS, Android, Web."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["expo", "react-native", "mobile", "routing", "eas"]
---

# Expo

## Overview

Expo is a development platform for React Native providing file-based routing (Expo Router), cloud builds (EAS Build), store submissions (EAS Submit), over-the-air updates (EAS Update), and 50+ SDK modules for native device APIs. Ship iOS, Android, and web apps from one codebase without managing Xcode or Android Studio.

## Instructions

### Setup

```bash
npx create-expo-app@latest my-app --template tabs
cd my-app && npx expo start
```

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
- `https://myapp.com/post/hello-world` -> Same screen (universal links)

### Expo SDK Modules

```typescript
// Camera
import { CameraView, useCameraPermissions } from "expo-camera";
const [permission, requestPermission] = useCameraPermissions();
const photo = await cameraRef.current?.takePictureAsync();

// Push Notifications
import * as Notifications from "expo-notifications";
const token = await Notifications.getExpoPushTokenAsync({ projectId: "your-id" });

// Secure Storage
import * as SecureStore from "expo-secure-store";
await SecureStore.setItemAsync("token", "jwt-abc123");
```

### EAS Build, Submit, and Update

```bash
npm install -g eas-cli
eas build:configure
eas build --platform ios          # Cloud build -> .ipa
eas build --platform android      # Cloud build -> .aab
eas submit --platform ios         # App Store Connect
eas submit --platform android     # Google Play Console
eas update --branch production --message "Bug fix"  # OTA update
```

## Examples

### Example 1: Social app with tabs, stacks, and modals

**User prompt:** "Set up navigation for a social app — tabs for feed/search/profile, stack for post details, and modal for creating posts."

The agent creates a tab layout in `app/(tabs)/_layout.tsx`, nested stack routes for post details, and a modal route with `presentation: "modal"`. Deep linking works automatically for every route.

### Example 2: Ship an urgent bug fix via OTA update

**User prompt:** "Push an urgent fix to production without app store review."

The agent fixes the JavaScript code, runs `eas update --channel production`, verifies the update fingerprint ensures no native code changes, and monitors rollout with rollback available if issues arise.

## Guidelines

- **File = route** — `app/about.tsx` becomes `/about`
- **`_layout.tsx`** for navigation containers (Stack, Tabs, Drawer)
- **`(group)`** for route groups — organize without affecting URL
- **`[param]`** for dynamic routes — access via `useLocalSearchParams`
- **Deep linking is automatic** — every route has a URL
- Use `expo-image` over `Image` for better caching and modern format support
- Store secrets in `expo-secure-store`, never AsyncStorage
- Use config plugins instead of ejecting to keep managed workflow
- Use development builds for custom native modules (Expo Go cannot run them)
- Use EAS Build for reproducible cross-platform builds without local Xcode/Android Studio
