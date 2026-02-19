---
name: expo
description: >-
  Assists with building, deploying, and updating React Native applications using Expo. Use
  when setting up file-based routing with Expo Router, configuring EAS Build and Submit,
  implementing over-the-air updates, or integrating Expo SDK modules for camera, location,
  and notifications. Trigger words: expo, expo router, eas build, eas update, expo sdk.
license: Apache-2.0
compatibility: "Requires Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["expo", "react-native", "mobile", "eas", "cross-platform"]
---

# Expo

## Overview

Expo is a development platform for React Native that provides file-based routing (Expo Router), cloud builds (EAS Build), automated store submissions (EAS Submit), and over-the-air updates (EAS Update). It includes 50+ SDK modules for native device APIs and lets developers ship iOS and Android apps without managing Xcode or Android Studio.

## Instructions

- When starting a new app, use `npx create-expo-app` with TypeScript and set up Expo Router for file-based navigation in the `app/` directory with layouts, dynamic routes, and route groups.
- When building for production, configure EAS Build profiles (`development`, `preview`, `production`) in `eas.json` and use cloud builds instead of local builds for reproducibility.
- When deploying updates, use EAS Update for instant JavaScript-only bug fixes that bypass app store review, with channel-based routing and rollback support.
- When accessing device APIs, use Expo SDK modules (`expo-camera`, `expo-location`, `expo-notifications`, `expo-secure-store`) and config plugins to handle native permissions without ejecting.
- When testing, use Expo Go for quick iteration on physical devices, and development builds for testing custom native modules.
- When optimizing performance, use `expo-image` over the built-in `Image` component for caching and modern format support, and configure splash screens and app icons via `app.config.ts`.

## Examples

### Example 1: Build a mobile app with tab navigation and push notifications

**User request:** "Create an Expo app with tabs, push notifications, and deep linking"

**Actions:**
1. Scaffold with `npx create-expo-app` and set up Expo Router with `app/(tabs)/_layout.tsx`
2. Configure `expo-notifications` for push notifications (APNs and FCM) with config plugin
3. Add deep linking via universal links in `app.config.ts`
4. Set up EAS Build profiles and EAS Submit for App Store and Google Play

**Output:** A tab-based mobile app with push notifications, deep linking, and automated store submission.

### Example 2: Ship a bug fix via over-the-air update

**User request:** "Push an urgent fix to production without going through app store review"

**Actions:**
1. Fix the bug in the JavaScript/TypeScript code
2. Run `eas update --channel production` to publish the update
3. Verify the update fingerprint to ensure no native code changes are required
4. Monitor rollout and use rollback if issues are detected

**Output:** A production fix deployed instantly to all users without waiting for app store review.

## Guidelines

- Use Expo Router for navigation since file-based routing is simpler and supports deep linking automatically.
- Use EAS Build instead of local builds for reproducible, cross-platform builds without local Xcode or Android Studio.
- Use `expo-image` over `Image` for better caching, transitions, and modern format support (WebP, AVIF).
- Store sensitive data in `expo-secure-store`, never in AsyncStorage or MMKV which are unencrypted.
- Use config plugins instead of ejecting to keep managed workflow benefits.
- Use development builds for testing native modules since Expo Go does not support custom native code.
