---
name: expo-router
description: >-
  Build native mobile apps with file-based routing using Expo Router — React
  Native navigation that works like Next.js. Use when someone asks to "add
  navigation to React Native", "Expo Router", "file-based routing for mobile",
  "deep linking in React Native", "mobile app navigation", or "React Native
  routing like Next.js". Covers file-based routes, layouts, deep linking,
  tabs, stacks, and universal links.
license: Apache-2.0
compatibility: "Expo SDK 50+. iOS, Android, Web."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["expo", "routing", "react-native", "navigation", "file-based"]
---

# Expo Router

## Overview

Expo Router brings file-based routing to React Native — the same pattern as Next.js but for mobile apps. Drop a file in `app/`, get a screen. Folder structure defines navigation hierarchy: stacks, tabs, drawers, and modals. Deep linking works automatically — every route has a URL. Build iOS, Android, and web from one codebase with the same routing system.

## When to Use

- Building a React Native / Expo app that needs navigation
- Want file-based routing instead of manual React Navigation config
- Need deep linking and universal links without extra setup
- Building a universal app (iOS + Android + Web)
- Migrating from React Navigation to a simpler routing model

## Instructions

### Setup

```bash
npx create-expo-app@latest my-app --template tabs
cd my-app
npx expo start
```

### File-Based Routes

```
app/
├── _layout.tsx          # Root layout (wraps all screens)
├── index.tsx            # / (home screen)
├── about.tsx            # /about
├── (tabs)/              # Tab navigation group
│   ├── _layout.tsx      # Tab bar configuration
│   ├── index.tsx        # First tab (home)
│   ├── explore.tsx      # Second tab
│   └── profile.tsx      # Third tab
├── settings/
│   ├── _layout.tsx      # Stack layout for settings
│   ├── index.tsx        # /settings
│   ├── account.tsx      # /settings/account
│   └── notifications.tsx # /settings/notifications
├── [id].tsx             # /123 (dynamic route)
├── post/
│   └── [slug].tsx       # /post/my-first-post
└── +not-found.tsx       # 404 screen
```

### Root Layout

```tsx
// app/_layout.tsx — Root layout with stack navigation
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Info" }}
      />
    </Stack>
  );
}
```

### Tab Navigation

```tsx
// app/(tabs)/_layout.tsx — Bottom tab bar
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#007AFF" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => <Ionicons name="compass" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### Navigation and Dynamic Routes

```tsx
// app/(tabs)/index.tsx — Home screen with navigation
import { Link, router } from "expo-router";
import { View, Text, Pressable, FlatList } from "react-native";

export default function HomeScreen() {
  const posts = usePosts();

  return (
    <View>
      {/* Declarative navigation */}
      <Link href="/about">About</Link>
      <Link href="/settings">Settings</Link>
      <Link href="/post/hello-world">My Post</Link>

      {/* Programmatic navigation */}
      <Pressable onPress={() => router.push("/settings/account")}>
        <Text>Go to Account</Text>
      </Pressable>

      {/* Dynamic routes */}
      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <Link href={`/post/${item.slug}`}>
            <Text>{item.title}</Text>
          </Link>
        )}
      />
    </View>
  );
}
```

```tsx
// app/post/[slug].tsx — Dynamic route screen
import { useLocalSearchParams } from "expo-router";

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const post = usePost(slug);

  return (
    <View>
      <Text style={{ fontSize: 24 }}>{post?.title}</Text>
      <Text>{post?.content}</Text>
    </View>
  );
}
```

### Deep Linking (Automatic)

```json
// app.json — Deep linking just works
{
  "expo": {
    "scheme": "myapp",
    "web": { "bundler": "metro" }
  }
}
```

Every route automatically gets a URL:
- `myapp://` → Home screen
- `myapp://post/hello-world` → Post screen
- `https://myapp.com/post/hello-world` → Same screen (universal links)

## Examples

### Example 1: Build a social media app navigation

**User prompt:** "Set up navigation for a social app — tabs for feed/search/profile, stack for post details, and modal for creating posts."

The agent will create tab layout, nested stack routes, and a modal route with proper animations and deep linking.

### Example 2: Add authentication flow

**User prompt:** "Add login/signup screens that show before the main app tabs."

The agent will create a route group for auth screens, use layout redirection based on auth state, and protect tab routes.

## Guidelines

- **File = route** — `app/about.tsx` = `/about` screen
- **`_layout.tsx` for navigation containers** — Stack, Tabs, Drawer
- **`(group)` for route groups** — organize without affecting URL
- **`[param]` for dynamic routes** — access via `useLocalSearchParams`
- **Deep linking is automatic** — every route has a URL
- **`Link` for declarative, `router` for programmatic** — navigation
- **`+not-found.tsx` for 404** — catches unmatched routes
- **Typed routes** — `href` autocompletes with TypeScript
- **Web support** — same routes work on web with `expo-router`
- **`presentation: "modal"` in options** — for modal screens
