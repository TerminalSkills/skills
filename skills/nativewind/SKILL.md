---
name: nativewind
description: >-
  Use Tailwind CSS in React Native with NativeWind — write className instead of
  StyleSheet. Use when someone asks to "use Tailwind in React Native", "NativeWind",
  "style React Native with Tailwind", "className in React Native", or "utility-first
  styling for mobile". Covers setup, responsive design, dark mode, animations,
  and platform-specific styles.
license: Apache-2.0
compatibility: "Expo or React Native with Metro. Nativewind 4.2 needs Tailwind CSS 3.4 (v5 release candidate needs Tailwind 4)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/nativewind/nativewind
  category: development
  tags: ["tailwind", "react-native", "styling", "nativewind", "mobile"]
---

# NativeWind

## Overview

NativeWind lets you use Tailwind CSS classes in React Native — write `className="bg-blue-500 p-4 rounded-xl"` instead of `StyleSheet.create({ container: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12 } })`. Same Tailwind you know from web, compiled to native styles at build time. Supports dark mode, responsive breakpoints, animations, and platform-specific styles.

## When to Use

- Styling React Native apps with Tailwind utilities
- Coming from web development and want familiar styling
- Need consistent design system across web and mobile
- Dark mode support without managing themes manually
- Rapid prototyping of mobile UI

## Instructions

### Setup with Expo (Nativewind 4.2.7, stable, Tailwind CSS 3)

Fastest start: `npx rn-new --nativewind` creates an Expo project already wired up. To add it to an existing project:

```bash
npx expo install nativewind@4.2.7 react-native-reanimated react-native-safe-area-context
npx expo install --dev tailwindcss@^3.4.17 babel-preset-expo
npx tailwindcss init
# Expo SDK 57 / Reanimated 4 also needs: npx expo install react-native-worklets
```

Do not run `npm install tailwindcss` unpinned: it now installs Tailwind 4, which Nativewind 4 does not support.

```javascript
// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
```

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```javascript
// babel.config.js — required, without it className does nothing
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

```javascript
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
```

```typescript
// app/_layout.tsx — import global CSS once, in the root component
import "../global.css";
import { Stack } from "expo-router";

export default function Layout() {
  return <Stack />;
}
```

For TypeScript add a `nativewind-env.d.ts` file containing `/// <reference types="nativewind/types" />` (do not name it `nativewind.d.ts`). For Expo web set `"web": { "bundler": "metro" }` in `app.json`. Restart Metro with `npx expo start -c` after changing config files.

**Nativewind 5** (`nativewind@5.0.0-rc.0`, September 2026) is a release candidate for Tailwind CSS 4: it needs `react-native-css`, `@tailwindcss/postcss`, `withNativewind(config)` in Metro (lowercase w), CSS `@import` lines instead of `@tailwind` directives, and drops the Babel preset. Stay on 4.2.7 for production and follow https://www.nativewind.dev/v5/guides/migrate-from-v4 when you move.

### Basic Usage

```tsx
// components/Card.tsx — Styled with Tailwind classes
import { View, Text, Image, Pressable } from "react-native";

export function ProductCard({ product }) {
  return (
    <Pressable className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 m-2 active:scale-95">
      <Image
        source={{ uri: product.image }}
        className="w-full h-48 rounded-xl"
        resizeMode="cover"
      />
      <View className="mt-3">
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {product.name}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {product.description}
        </Text>
        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-xl font-bold text-blue-600">
            ${product.price}
          </Text>
          <Pressable className="bg-blue-600 px-4 py-2 rounded-full active:bg-blue-700">
            <Text className="text-white font-semibold">Add to Cart</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
```

### Dark Mode

```tsx
// Automatic: follows the system appearance
<View className="bg-white dark:bg-gray-900">
  <Text className="text-black dark:text-white">Adapts to system theme</Text>
</View>
```

In Expo, set `"userInterfaceStyle": "automatic"` in `app.json`, or the app stays light. A manual toggle needs `darkMode: "class"` in `tailwind.config.js`; with the default (`media`) `setColorScheme` and `toggleColorScheme` throw.

```tsx
import { useColorScheme } from "nativewind";

function ThemeToggle() {
  const { colorScheme, setColorScheme } = useColorScheme();   // setColorScheme accepts "light" | "dark" | "system"
  return (
    <Pressable onPress={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")} className="p-3">
      <Text className="text-gray-900 dark:text-white">Current: {colorScheme}</Text>
    </Pressable>
  );
}
```

Offer a "System" option next to a manual toggle and persist the choice yourself (for example with AsyncStorage).

### Platform-Specific Styles

```tsx
// Different styles per platform (ios:, android:, web:, windows:, osx:, native: for everything except web)
<View className="p-4 ios:pt-12 android:pt-8">
  <Text className="text-base ios:text-lg android:text-sm">
    Platform-aware text
  </Text>
</View>
```

### Responsive Design

```tsx
// Tailwind breakpoints apply to window width; the defaults were designed for web, so tune `theme.screens` for phones
<View className="flex-col md:flex-row gap-4">
  <View className="w-full md:w-1/3">
    <Text>Sidebar</Text>
  </View>
  <View className="w-full md:w-2/3">
    <Text>Main content</Text>
  </View>
</View>
```

## Examples

### Example 1: Build a mobile UI with Tailwind

**User prompt:** "Style the chat screen of my Expo app with Tailwind classes: message bubbles, an input bar, and online status dots."

The agent checks that `babel.config.js`, `metro.config.js` and `global.css` are set up as above, then writes components such as:

```tsx
export function Bubble({ text, mine }: { text: string; mine: boolean }) {
  return (
    <View className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? "self-end bg-blue-600" : "self-start bg-gray-200 dark:bg-gray-700"}`}>
      <Text className={mine ? "text-white" : "text-gray-900 dark:text-white"}>{text}</Text>
    </View>
  );
}
```

Result: bubbles align left or right, and the received style switches with the system theme. Class names are built from complete literal strings so Tailwind can see them.

### Example 2: Add dark mode to an existing app

**User prompt:** "Add dark mode to my Expo app. I want it to follow the system setting, with a toggle in settings."

The agent sets `"userInterfaceStyle": "automatic"` in `app.json`, sets `darkMode: "class"` in `tailwind.config.js`, adds paired `bg-white dark:bg-gray-900` and `text-black dark:text-white` classes to existing screens, and adds the `ThemeToggle` above using `setColorScheme("system" | "light" | "dark")`. After `npx expo start -c` the app switches when the device appearance changes.

## Guidelines

- **`className` works on core RN components** (View, Text, Image, Pressable, TextInput...). Third-party components need `cssInterop` or `remapProps`, or a wrapper passing `style`.
- **Declare both sides of a variant** — write `text-black dark:text-white`, not only `dark:text-white`; React Native handles conditionally appearing styles badly.
- **Pseudo-classes need the matching event** — `active:` works on `Pressable`, `hover:` needs `onHoverIn`, so it does not work on `View`.
- **Units** — React Native uses dp, so write `10px` in theme values and Nativewind converts; `rem` is 14 on native and 16 on web. Add `flex-1` and an explicit `flex-row` where web habits assume other defaults.
- **Opacity utilities** — color opacity (`bg-black/50`) is static; the dynamic `*-opacity-*` core plugins are off by default for speed.
- **Animations** use `react-native-reanimated` (Reanimated 4 needs `react-native-worklets` on new Expo SDKs).
- **Missing styles** are almost always a config problem: wrong `content` globs, missing Babel preset, or `global.css` not imported; restart Metro with `-c`.
- **Versions** — Nativewind 4 is for Tailwind 3; do not mix with Tailwind 4 or the v5 RC packages.
