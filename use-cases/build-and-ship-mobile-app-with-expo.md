---
title: Build and Ship a Mobile App with Expo and Fastlane
slug: build-and-ship-mobile-app-with-expo
description: Create a cross-platform mobile app with Expo Router for navigation, NativeWind for styling, Reanimated for animations, and Fastlane for automated App Store deployment.
skills:
  - expo-router
  - nativewind
  - react-native-reanimated
  - fastlane
  - capacitor
category: development
tags:
  - mobile
  - expo
  - react-native
  - ios
  - android
  - app-store
---

## The Problem

Jun's startup built a successful web app and now needs native iOS and Android versions. The team are web developers — they know React and Tailwind but have zero Swift or Kotlin experience. They need navigation (tabs, stacks, modals), platform-native styling, smooth animations, and automated deployment to both app stores. Building two separate native apps is out of budget; they need one codebase that produces quality native apps.

## The Solution

Use Expo with Expo Router for file-based navigation (familiar from Next.js), NativeWind for Tailwind-based styling (familiar from web), Reanimated for 60fps animations, and Fastlane to automate builds and App Store/Play Store uploads. The team writes React components with Tailwind classes and gets native apps on both platforms.

## Step-by-Step Walkthrough

### Step 1: Project Setup

```bash
npx create-expo-app@latest my-app --template tabs
cd my-app
npx expo install nativewind tailwindcss react-native-reanimated react-native-gesture-handler
npx tailwindcss init
```

```javascript
// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#6366F1", light: "#818CF8", dark: "#4F46E5" },
      },
    },
  },
};
```

### Step 2: Navigation with Expo Router

```
app/
├── _layout.tsx              # Root: auth check + providers
├── (auth)/
│   ├── _layout.tsx          # Auth stack
│   ├── login.tsx            # /login
│   └── signup.tsx           # /signup
├── (tabs)/
│   ├── _layout.tsx          # Tab bar
│   ├── index.tsx            # Home tab
│   ├── search.tsx           # Search tab
│   ├── create.tsx           # Create tab
│   └── profile.tsx          # Profile tab
├── post/
│   └── [id].tsx             # /post/123 (detail screen)
└── settings/
    ├── _layout.tsx          # Settings stack
    ├── index.tsx            # /settings
    └── edit-profile.tsx     # /settings/edit-profile
```

```tsx
// app/_layout.tsx — Root layout with auth redirect
import "../global.css";
import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuth";

export default function RootLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: "Post" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
```

### Step 3: Styled Components with NativeWind

```tsx
// components/PostCard.tsx — Styled with Tailwind, animated with Reanimated
import { View, Text, Image, Pressable } from "react-native";
import { Link } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

interface Post {
  id: string;
  author: { name: string; avatar: string };
  content: string;
  image?: string;
  likes: number;
  timeAgo: string;
}

export function PostCard({ post, index }: { post: Post; index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      className="bg-white dark:bg-gray-800 mx-4 my-2 rounded-2xl shadow-sm"
    >
      <Link href={`/post/${post.id}`} asChild>
        <Pressable className="active:opacity-90">
          {/* Author row */}
          <View className="flex-row items-center p-4">
            <Image
              source={{ uri: post.author.avatar }}
              className="w-10 h-10 rounded-full"
            />
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-gray-900 dark:text-white">
                {post.author.name}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {post.timeAgo}
              </Text>
            </View>
          </View>

          {/* Content */}
          <Text className="px-4 pb-3 text-gray-700 dark:text-gray-300">
            {post.content}
          </Text>

          {/* Image */}
          {post.image && (
            <Image
              source={{ uri: post.image }}
              className="w-full h-64"
              resizeMode="cover"
            />
          )}

          {/* Actions */}
          <View className="flex-row px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <Text className="text-gray-500 dark:text-gray-400">
              ❤️ {post.likes} likes
            </Text>
          </View>
        </Pressable>
      </Link>
    </Animated.View>
  );
}
```

### Step 4: Smooth Animations

```tsx
// components/LikeButton.tsx — Animated like button with haptics
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import { Haptics } from "expo-haptics";
import { Pressable } from "react-native";

export function LikeButton({ isLiked, onToggle }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.4, { damping: 4 }),
      withSpring(1, { damping: 6 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.Text style={animatedStyle} className="text-2xl">
        {isLiked ? "❤️" : "🤍"}
      </Animated.Text>
    </Pressable>
  );
}
```

### Step 5: Automated Deployment with Fastlane

```ruby
# fastlane/Fastfile — Automated builds and store uploads
default_platform(:ios)

platform :ios do
  lane :beta do
    increment_build_number(
      build_number: latest_testflight_build_number + 1
    )
    build_app(
      workspace: "ios/MyApp.xcworkspace",
      scheme: "MyApp",
    )
    upload_to_testflight(skip_waiting_for_build_processing: true)
  end
end

platform :android do
  lane :beta do
    gradle(task: "clean bundleRelease", project_dir: "android/")
    upload_to_play_store(
      track: "internal",
      aab: "android/app/build/outputs/bundle/release/app-release.aab",
    )
  end
end
```

```bash
# One command to ship
npx expo prebuild
fastlane ios beta     # → TestFlight
fastlane android beta # → Play Store internal testing
```

## The Outcome

Jun's team ships their first mobile app in 3 weeks — the same timeline it would take to build a single native app in Swift. The web developers write React with Tailwind classes and get iOS + Android apps with native navigation, smooth 60fps animations, and platform-appropriate styling (dark mode adapts to system preference). Fastlane handles the App Store submission dance — code signing, building, uploading, and submitting for review. The app launches with a 4.7-star rating. Total new technology to learn: Expo Router's file conventions (1 day) and Reanimated's shared values (2 days). Everything else is React and Tailwind they already knew.
