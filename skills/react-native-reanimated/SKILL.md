---
name: react-native-reanimated
description: >-
  React Native Reanimated is an animation library for React Native that runs
  animations on the UI thread through worklets and shared values, so they stay
  smooth while the JavaScript thread is busy. Use when someone asks to "animate
  in React Native", "Reanimated", "smooth mobile animations", "gesture
  animations", "shared element transitions", "60fps React Native animations",
  or to upgrade from Reanimated 3 to 4. Covers Reanimated 4: worklets, shared
  values, layout animations, CSS transitions, gestures, and scroll-driven
  animations.
license: Apache-2.0
compatibility: "Reanimated 4.x: React Native New Architecture only (4.7 supports RN 0.86–0.88), plus react-native-worklets. Expo SDK 54+. iOS, Android, Web."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["react-native", "animation", "reanimated", "gestures", "ui"]
  repository: https://github.com/software-mansion/react-native-reanimated
---

# React Native Reanimated

## Overview

Reanimated runs animations on the native UI thread, so they stay at 60fps (or the display's refresh rate) even when the JavaScript thread is busy. It uses "worklets": small JavaScript functions that execute on the UI thread via JSI. It is the standard for production-quality animations in React Native: gesture-driven interactions, layout transitions, scroll-based effects, and shared element transitions.

This skill targets **Reanimated 4** (4.7.0, September 2026). Version 4 works only on the New Architecture, moves worklets into the separate `react-native-worklets` package, and adds CSS-style transitions and animations. Apps still on the old architecture stay on 3.x, which is no longer actively maintained.

## When to Use

- Any animation in React Native beyond simple opacity/transform
- Gesture-driven interactions (swipe to delete, drag to reorder, pinch to zoom)
- Scroll-driven animations (parallax headers, sticky elements)
- Layout animations (items entering/leaving lists)
- Shared element transitions between screens (experimental in 4.x)

## Instructions

### Setup

```bash
# Expo: installs the versions pinned by the SDK (SDK 57: Reanimated 4.5, Worklets 0.10, Gesture Handler 2.32)
npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler
npx expo prebuild        # development builds only: regenerates ios/ and android/

# React Native Community CLI
npm install react-native-reanimated react-native-worklets react-native-gesture-handler
cd ios && pod install && cd ..
npm start -- --reset-cache
```

- **Expo:** `babel-preset-expo` adds the Worklets Babel plugin by itself; do not list it in `babel.config.js`.
- **Community CLI:** add `'react-native-worklets/plugin'` as the **last** entry of `plugins` in `babel.config.js`. The Reanimated 3 name `react-native-reanimated/plugin` still resolves in 4.x but is the legacy spelling.
- Each Reanimated minor accepts specific `react-native-worklets` and React Native versions (4.7 needs Worklets 0.13 and RN 0.86–0.88); check the compatibility table before a manual upgrade.
- For gestures, wrap the app root in `GestureHandlerRootView` from `react-native-gesture-handler` with `style={{ flex: 1 }}`.

### Shared Values and Animated Styles

```tsx
// components/FadeIn.tsx — Basic animation with shared values
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import { type ReactNode, useEffect } from "react";

export function FadeInCard({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    translateY.value = withSpring(0);
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[{ backgroundColor: "white", padding: 16 }, animatedStyle]}>{children}</Animated.View>;
}
```

Read and write `.value` only in effects, event handlers and worklets, never during render. With the React Compiler use `opacity.get()` and `opacity.set(1)` instead of `.value`.

### Gesture Animations

```tsx
// components/SwipeToDelete.tsx — Swipe gesture with animation
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import type { ReactNode } from "react";

export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = Math.min(0, event.translationX);   // only allow left swipe
    })
    .onEnd((event) => {
      if (event.translationX < -150) {
        translateX.value = withSpring(-400);
        scheduleOnRN(onDelete);            // call a JS-thread function from the UI thread
      } else {
        translateX.value = withSpring(0);  // snap back
      }
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

`scheduleOnRN(fn, ...args)` replaces `runOnJS(fn)(...args)`, which is deprecated in 4.x. `Gesture.Pan()` is the Gesture Handler 2 builder API, the one Expo SDK 57 installs; Gesture Handler 3 keeps it and adds hooks (`usePanGesture({ onUpdate, onDeactivate })`, where `onStart`/`onEnd` are named `onActivate`/`onDeactivate`).

### Layout Animations

```tsx
// components/AnimatedList.tsx — Items animate in/out automatically
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from "react-native-reanimated";
import { Pressable, Text } from "react-native";

type Item = { id: string; title: string };
export function AnimatedList({ items, onRemove }: { items: Item[]; onRemove: (id: string) => void }) {
  return (
    <Animated.FlatList
      data={items}
      keyExtractor={(item) => item.id}
      itemLayoutAnimation={LinearTransition}   // remaining rows slide into place; single column only
      renderItem={({ item, index }) => (
        <Animated.View
          entering={FadeInDown.delay(index * 100).springify()}
          exiting={FadeOutLeft.duration(300)}
          style={{ backgroundColor: "white", padding: 16, marginVertical: 4, borderRadius: 8 }}
        >
          <Text>{item.title}</Text>
          <Pressable onPress={() => onRemove(item.id)}><Text style={{ color: "#dc2626" }}>Remove</Text></Pressable>
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
  useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation,
} from "react-native-reanimated";
import { Text } from "react-native";

export function ParallaxHeader() {
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });
  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [-100, 0, 200], [400, 300, 100], Extrapolation.CLAMP),
    opacity: interpolate(scrollY.value, [0, 200], [1, 0.3], Extrapolation.CLAMP),
  }));

  return (
    <>
      <Animated.View style={[{ backgroundColor: "#2563eb" }, headerStyle]}>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "bold" }}>Trail Log</Text>
      </Animated.View>
      <Animated.ScrollView onScroll={scrollHandler}>{/* Content */}</Animated.ScrollView>
    </>
  );
}
```

When only the offset is needed, `useScrollOffset(animatedRef)` (named `useScrollViewOffset` in 3.x) returns it as a shared value without a handler.

### CSS Transitions and Shared Elements (Reanimated 4)

```tsx
// a state change animates by itself: no shared value, no hook
<Animated.View
  style={{
    height: 80,
    width: expanded ? 240 : 120,
    backgroundColor: expanded ? "#16a34a" : "#2563eb",
    transitionProperty: ["width", "backgroundColor"],
    transitionDuration: 300,
  }}
/>

// the same tag on two screens of a native stack animates the element between them
<Animated.Image sharedTransitionTag="trail-42-photo" source={{ uri: photoUrl }} style={{ width: 120, height: 120 }} />
```

Shared element transitions are experimental in 4.x and off by default. Enable them with `"reanimated": { "staticFeatureFlags": { "ENABLE_SHARED_ELEMENT_TRANSITIONS": true } }` in the app's `package.json` (4.2+), then rebuild the native app; static flags cannot be changed in Expo Go.

## Examples

### Example 1: Build a card swipe interface

**User prompt:** "Build a Tinder-style card swipe interface with smooth animations."

```tsx
// components/SwipeCard.tsx
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { useWindowDimensions } from "react-native";
import type { ReactNode } from "react";

type Props = { children: ReactNode; onSwipe: (direction: "left" | "right") => void };
export function SwipeCard({ children, onSwipe }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((e) => { x.value = e.translationX; y.value = e.translationY; })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > width * 0.3) {
        const direction = e.translationX > 0 ? "right" : "left";
        x.value = withTiming(Math.sign(e.translationX) * width * 1.5, { duration: 200 }, (finished) => {
          if (finished) scheduleOnRN(onSwipe, direction);   // remove the card in React state
        });
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${interpolate(x.value, [-width, 0, width], [-15, 0, 15])}deg` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

**Result:** the card follows the finger and tilts up to 15°. Released past 30% of the screen width it flies off and `onSwipe("left" | "right")` runs on the JS thread; otherwise it springs back to the centre.

### Example 2: Animated bottom sheet

**User prompt:** "Create a bottom sheet that can be dragged up and snaps to positions."

```tsx
// components/BottomSheet.tsx
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useWindowDimensions } from "react-native";
import type { ReactNode } from "react";

export function BottomSheet({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  const snapPoints = [height * 0.1, height * 0.5, height * 0.85]; // top edge: open, half, peek
  const top = useSharedValue(snapPoints[2]);
  const start = useSharedValue(0);
  const pan = Gesture.Pan()
    .onBegin(() => { start.value = top.value; })
    .onUpdate((e) => { top.value = Math.max(snapPoints[0], start.value + e.translationY); })
    .onEnd((e) => {
      const projected = top.value + e.velocityY * 0.2; // where the fling would land
      const target = snapPoints.reduce((a, b) => (Math.abs(b - projected) < Math.abs(a - projected) ? b : a));
      top.value = withSpring(target, { velocity: e.velocityY });
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: top.value }] }));
  const sheet = { position: "absolute", left: 0, right: 0, top: 0, height, backgroundColor: "white" } as const;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[sheet, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

**Result:** the sheet starts in the peek position, follows the drag, and on release springs to the nearest of the three snap points, taking the fling velocity into account.

## Guidelines

- **Shared values for animation state** — `useSharedValue` lives on the UI thread; changing it does not re-render the component
- **`useAnimatedStyle` for dynamic styles** — recalculated on the UI thread
- **`withSpring` for natural motion** — `withTiming` for precise duration. Version 4 changed the spring defaults (damping 120, stiffness 900) and treats `duration` as perceptual; `Reanimated3DefaultSpringConfig` restores the old feel
- **`scheduleOnRN` to call JS from worklets** — pass a function defined in the component or module scope, not one created inside the worklet
- **Gesture Handler integration** — `Gesture.Pan()`, `Gesture.Pinch()`, etc.; callbacks passed inline are workletized automatically, a callback stored in a variable needs a `'worklet';` directive
- **Layout animations are declarative** — `entering`, `exiting` props on Animated components
- **`interpolate` for value mapping** — map scroll position to opacity, scale, etc.; pass `Extrapolation.CLAMP` to stop at the range ends
- **Worklets Babel plugin must be last** — and after changing Babel config, clear the Metro cache
- **Don't capture large objects in worklets** — captured values are copied to the UI runtime; pass shared values, primitives and small plain objects
- **Upgrading from 3.x** — enable the New Architecture first, install `react-native-worklets`, rename the Babel plugin, and replace `useAnimatedGestureHandler`, `useWorkletCallback` and `combineTransition`, which were removed
- **When not to use** — a one-off fade or slide that never blocks can stay on React Native's built-in `Animated` API (CSS transitions on native come from Reanimated itself); Reanimated 4 cannot be installed in an app on the old architecture
