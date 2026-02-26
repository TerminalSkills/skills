---
name: nativewind
description: >-
  Use Tailwind CSS in React Native with NativeWind — write className instead of
  StyleSheet. Use when someone asks to "use Tailwind in React Native", "NativeWind",
  "style React Native with Tailwind", "className in React Native", or "utility-first
  styling for mobile". Covers setup, responsive design, dark mode, animations,
  and platform-specific styles.
license: Apache-2.0
compatibility: "React Native / Expo. Tailwind CSS v3.4+."
metadata:
  author: terminal-skills
  version: "1.0.0"
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

### Setup with Expo

```bash
npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context
npx tailwindcss init
```

```javascript
// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
};
```

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```typescript
// app/_layout.tsx — Import global CSS
import "../global.css";
import { Stack } from "expo-router";

export default function Layout() {
  return <Stack />;
}
```

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
// Automatic dark mode with system preference
<View className="bg-white dark:bg-gray-900">
  <Text className="text-black dark:text-white">
    Adapts to system theme
  </Text>
</View>

// Toggle programmatically
import { useColorScheme } from "nativewind";

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <Pressable onPress={toggleColorScheme} className="p-3">
      <Text className="text-gray-900 dark:text-white">
        Current: {colorScheme}
      </Text>
    </Pressable>
  );
}
```

### Platform-Specific Styles

```tsx
// Different styles per platform
<View className="p-4 ios:pt-12 android:pt-8">
  <Text className="text-base ios:text-lg android:text-sm">
    Platform-aware text
  </Text>
</View>
```

### Responsive Design

```tsx
// Responsive breakpoints (useful for tablets/web)
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

**User prompt:** "Style a React Native chat app using Tailwind CSS classes."

The agent will create styled components with NativeWind — message bubbles, input bar, avatar groups, and status indicators using utility classes.

### Example 2: Add dark mode to existing app

**User prompt:** "Add dark mode to my Expo app. I want it to follow the system setting."

The agent will set up NativeWind, add `dark:` variants to existing styles, and configure the color scheme provider.

## Guidelines

- **`className` works on all RN components** — View, Text, Image, Pressable, etc.
- **Dark mode with `dark:` prefix** — follows system preference by default
- **`active:` for press states** — `active:scale-95`, `active:bg-blue-700`
- **No StyleSheet needed** — Tailwind classes compile to native styles
- **`ios:` and `android:` prefixes** — platform-specific styles
- **Responsive with `md:`, `lg:`** — useful for tablets and web
- **Animations require reanimated** — `animate-` classes need react-native-reanimated
- **Custom values in config** — extend `tailwind.config.js` theme as usual
- **Performance** — styles are compiled at build time, not runtime
- **Web compatible** — same classes work on web via Expo web
