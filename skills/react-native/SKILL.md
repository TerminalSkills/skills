---
name: react-native
description: >-
  Assists with building iOS and Android applications from a single TypeScript codebase
  using React Native. Use when implementing mobile UI components, navigation, native device
  APIs, performance optimization, or setting up testing and CI pipelines for mobile apps.
  Trigger words: react native, mobile app, ios, android, flatlist, reanimated.
license: Apache-2.0
compatibility: "Requires Node.js 22.13+ (React Native 0.88)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/facebook/react-native
  tags: ["react-native", "mobile", "ios", "android", "cross-platform"]
---

# React Native

## Overview

React Native is a framework for building native iOS and Android applications from a single TypeScript codebase. It provides core UI components (View, Text, FlatList), integrates with Expo for managed development and cloud builds, supports performant animations via Reanimated, and offers access to native device APIs through Expo SDK modules.

## Instructions

- When starting a project, run `npx create-expo-app@latest my-app` (React Native's docs recommend an Expo framework; at the time of writing Expo SDK 58 / React Native 0.88). Native code outside Expo's modules does not require leaving Expo: use a development build (`npx expo run:ios`, `npx expo run:android`) and config plugins instead of editing native folders by hand. Bare projects use `npx @react-native-community/cli@latest init AppName`.
- Install Expo-managed libraries with `npx expo install <package>` so the version matches the SDK.
- When building lists, use `FlatList` for any list over 20 items with `getItemLayout` and `keyExtractor`; avoid `ScrollView` for large datasets since it renders all items at once.
- When implementing navigation, use Expo Router for file-based routing or React Navigation for programmatic control, with stack, tab, drawer, and modal patterns.
- When styling components, use `StyleSheet.create({})` for performant styles with Flexbox layout, `Platform.select()` for platform-specific styles, and NativeWind for Tailwind CSS syntax.
- When managing state, use TanStack Query (React Query v5) for server state, Zustand or Jotai for client state, and `expo-secure-store` for auth tokens and secrets.
- When optimizing performance, use Reanimated for UI-thread animations (`npx expo install react-native-reanimated react-native-worklets`; Reanimated 4 needs `react-native-worklets`, and with Expo the Babel plugin is configured by `babel-preset-expo`), Gesture Handler for touch gestures, `React.memo` to prevent unnecessary re-renders, and the Hermes engine (the default). For very large lists, `@shopify/flash-list` is included in the Expo SDK.
- When testing, use Jest with React Native Testing Library for unit and component tests, and Detox or Maestro for end-to-end testing on simulators.

## Examples

### Example 1: Build a social feed with infinite scroll

**User request:** "Create a social media feed with infinite scrolling and pull-to-refresh"

**Setup:**

```bash
npx create-expo-app@latest social-feed
cd social-feed
npx expo install expo-image @tanstack/react-query
```

**Actions:**
1. Set up a `FlatList` with `onEndReached` for pagination and `refreshControl` for pull-to-refresh
2. Use React Query with infinite query for server state management
3. Implement post cards with `expo-image` for optimized image loading
4. Add Reanimated-based like animation on double-tap gesture

**Output:** A performant social feed with infinite scroll, pull-to-refresh, optimized images, and smooth animations.

### Example 2: Add biometric login to a finance app

**User request:** "Implement Face ID and fingerprint login for my React Native banking app"

**Setup and core call:**

```bash
npx expo install expo-local-authentication expo-secure-store
```

```typescript
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
if (ok) {
  const { success } = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock your account" });
  if (success) await SecureStore.getItemAsync("session_token");
}
```

**Actions:**
1. Use `expo-local-authentication` to check biometric availability and authenticate
2. Store auth tokens in `expo-secure-store` (backed by Keychain on iOS, Keystore on Android); install both with `npx expo install expo-local-authentication expo-secure-store`
3. Add fallback to PIN/password when biometrics are unavailable
4. Handle authentication state with Zustand and persist session securely

**Output:** A banking app with biometric login, secure token storage, and graceful fallback authentication.

## Guidelines

- Face ID does not work in Expo Go and `requireAuthentication` in SecureStore is unsupported there when biometrics are available: test with a development build.
- On iOS, SecureStore values survive an uninstall and reinstall with the same bundle ID (Keychain behaviour); do not treat a stored token as removed after uninstall. On Android it is removed.
- Use `expo-image` over `Image` for better caching, transitions, and format support.
- Use `FlatList` for lists over 20 items since `ScrollView` renders all items at once and can crash on large datasets.
- Store auth tokens in `expo-secure-store`, not AsyncStorage, since AsyncStorage is unencrypted.
- Use Reanimated for animations instead of the `Animated` API since Reanimated runs animations on the UI thread instead of the JS thread.
- Test on real devices because simulators miss performance issues, permission flows, and push notifications.
