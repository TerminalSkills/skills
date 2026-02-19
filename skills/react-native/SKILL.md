---
name: react-native
description: >-
  Assists with building iOS and Android applications from a single TypeScript codebase
  using React Native. Use when implementing mobile UI components, navigation, native device
  APIs, performance optimization, or setting up testing and CI pipelines for mobile apps.
  Trigger words: react native, mobile app, ios, android, flatlist, reanimated.
license: Apache-2.0
compatibility: "Requires Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react-native", "mobile", "ios", "android", "cross-platform"]
---

# React Native

## Overview

React Native is a framework for building native iOS and Android applications from a single TypeScript codebase. It provides core UI components (View, Text, FlatList), integrates with Expo for managed development and cloud builds, supports performant animations via Reanimated, and offers access to native device APIs through Expo SDK modules.

## Instructions

- When starting a project, use Expo (`npx create-expo-app`) unless you need a native module Expo does not support, since ejecting adds significant complexity.
- When building lists, use `FlatList` for any list over 20 items with `getItemLayout` and `keyExtractor`; avoid `ScrollView` for large datasets since it renders all items at once.
- When implementing navigation, use Expo Router for file-based routing or React Navigation for programmatic control, with stack, tab, drawer, and modal patterns.
- When styling components, use `StyleSheet.create({})` for performant styles with Flexbox layout, `Platform.select()` for platform-specific styles, and NativeWind for Tailwind CSS syntax.
- When managing state, use React Query or TanStack Query for server state, Zustand or Jotai for client state, and `expo-secure-store` for auth tokens and secrets.
- When optimizing performance, use Reanimated for 60fps UI-thread animations, Gesture Handler for touch gestures, `React.memo` to prevent unnecessary re-renders, and the Hermes engine (default in Expo SDK 50+).
- When testing, use Jest with React Native Testing Library for unit and component tests, and Detox or Maestro for end-to-end testing on simulators.

## Examples

### Example 1: Build a social feed with infinite scroll

**User request:** "Create a social media feed with infinite scrolling and pull-to-refresh"

**Actions:**
1. Set up a `FlatList` with `onEndReached` for pagination and `refreshControl` for pull-to-refresh
2. Use React Query with infinite query for server state management
3. Implement post cards with `expo-image` for optimized image loading
4. Add Reanimated-based like animation on double-tap gesture

**Output:** A performant social feed with infinite scroll, pull-to-refresh, optimized images, and smooth animations.

### Example 2: Add biometric login to a finance app

**User request:** "Implement Face ID and fingerprint login for my React Native banking app"

**Actions:**
1. Use `expo-local-authentication` to check biometric availability and authenticate
2. Store auth tokens in `expo-secure-store` (backed by Keychain on iOS, Keystore on Android)
3. Add fallback to PIN/password when biometrics are unavailable
4. Handle authentication state with Zustand and persist session securely

**Output:** A banking app with biometric login, secure token storage, and graceful fallback authentication.

## Guidelines

- Use Expo unless a specific native module requires ejecting; the managed workflow reduces complexity significantly.
- Use `expo-image` over `Image` for better caching, transitions, and format support.
- Use `FlatList` for lists over 20 items since `ScrollView` renders all items at once and can crash on large datasets.
- Store auth tokens in `expo-secure-store`, not AsyncStorage, since AsyncStorage is unencrypted.
- Use Reanimated for animations instead of the `Animated` API since Reanimated runs on the UI thread without JS bridge bottleneck.
- Test on real devices because simulators miss performance issues, permission flows, and push notifications.
