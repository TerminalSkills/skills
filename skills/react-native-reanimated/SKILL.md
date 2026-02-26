---
name: react-native-reanimated
description: >-
  Build smooth 60fps animations in React Native with Reanimated — run animations
  on the UI thread without JS bridge delays. Use when someone asks to "animate
  in React Native", "Reanimated", "smooth mobile animations", "gesture
  animations", "shared element transitions", or "60fps React Native
  animations". Covers worklets, shared values, layout animations, gestures,
  and scroll-driven animations.
license: Apache-2.0
compatibility: "React Native / Expo. iOS + Android."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react-native", "animation", "reanimated", "gestures", "ui"]
---

# React Native Reanimated

## Overview

Reanimated runs animations on the native UI thread — no JS bridge bottleneck, no dropped frames. Animations stay at 60fps even when your JavaScript thread is busy. It uses "worklets" — small JavaScript functions that execute on the UI thread via JSI. The standard for production-quality animations in React Native: gesture-driven interactions, layout transitions, scroll-based effects, and shared element transitions.

## When to Use

- Any animation in React Native beyond simple opacity/transform
- Gesture-driven interactions (swipe to delete, drag to reorder, pinch to zoom)
- Scroll-driven animations (parallax headers, sticky elements)
- Layout animations (items entering/leaving lists)
- Shared element transitions between screens

## Instructions

### Setup

```bash
npx expo install react-native-reanimated react-native-gesture-handler
```

```javascript
// babel.config.js — Add the Reanimated plugin (MUST be last)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],  // Must be last!
  };
};
```

### Shared Values and Animated Styles

```tsx
// components/FadeIn.tsx — Basic animation with shared values
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useEffect } from "react";

export function FadeInCard({ children }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    translateY.value = withSpring(0, { damping: 15 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className="bg-white rounded-xl p-4 shadow-lg">
      {children}
    </Animated.View>
  );
}
```

### Gesture Animations

```tsx
// components/SwipeToDelete.tsx — Swipe gesture with animation
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

export function SwipeToDelete({ onDelete, children }) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow left swipe
      translateX.value = Math.min(0, event.translationX);
    })
    .onEnd((event) => {
      if (event.translationX < -150) {
        // Swipe far enough — delete
        translateX.value = withSpring(-400);
        runOnJS(onDelete)();
      } else {
        // Snap back
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
```

### Layout Animations

```tsx
// components/AnimatedList.tsx — Items animate in/out automatically
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from "react-native-reanimated";

export function AnimatedList({ items, onRemove }) {
  return (
    <Animated.FlatList
      data={items}
      itemLayoutAnimation={LinearTransition}
      renderItem={({ item, index }) => (
        <Animated.View
          entering={FadeInDown.delay(index * 100).springify()}
          exiting={FadeOutLeft.duration(300)}
          className="bg-white p-4 mx-4 my-1 rounded-lg"
        >
          <Text>{item.title}</Text>
          <Pressable onPress={() => onRemove(item.id)}>
            <Text className="text-red-500">Remove</Text>
          </Pressable>
        </Animated.View>
      )}
    />
  );
}
```

### Scroll-Driven Animations

```tsx
// components/ParallaxHeader.tsx — Parallax effect on scroll
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
} from "react-native-reanimated";

export function ParallaxHeader() {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [-100, 0, 200], [400, 300, 100]),
    opacity: interpolate(scrollY.value, [0, 200], [1, 0.3]),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 200], [0, -50]) },
    ],
  }));

  return (
    <>
      <Animated.View style={headerStyle} className="bg-blue-600">
        <Text className="text-white text-3xl font-bold">My App</Text>
      </Animated.View>
      <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}>
        {/* Content */}
      </Animated.ScrollView>
    </>
  );
}
```

## Examples

### Example 1: Build a card swipe interface

**User prompt:** "Build a Tinder-style card swipe interface with smooth animations."

The agent will create a card stack with pan gestures, rotation based on swipe direction, spring animations for snap-back, and layout transitions for card removal.

### Example 2: Animated bottom sheet

**User prompt:** "Create a bottom sheet that can be dragged up and snaps to positions."

The agent will use pan gestures with snap points, shared values for height, and spring animations for smooth snapping.

## Guidelines

- **Shared values for animation state** — `useSharedValue` runs on UI thread
- **`useAnimatedStyle` for dynamic styles** — recalculated on UI thread
- **`withSpring` for natural motion** — `withTiming` for precise duration
- **`runOnJS` to call JS from worklets** — bridge back to JS thread when needed
- **Gesture Handler integration** — `Gesture.Pan()`, `Gesture.Pinch()`, etc.
- **Layout animations are declarative** — `entering`, `exiting` props on Animated components
- **`interpolate` for value mapping** — map scroll position to opacity, scale, etc.
- **Babel plugin must be last** — `react-native-reanimated/plugin` at end of plugins array
- **Don't access JS objects in worklets** — only shared values and primitives
- **`scrollEventThrottle={16}`** — 60fps scroll events for smooth animations
