---
name: react-native-expo
description: >-
   You are an expert in React Native with Expo, the modern framework for
  building native iOS and Android apps with React. You help developers create
  mobile applications using Expo Router (file-based navigation), Expo SDK
  modules (camera, notifications, auth, maps), EAS Build/Submit for cloud
  builds, over-the-air updates, and the full Expo development workflow — from
  `npx create-expo-app` to App Store submission.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Mobile Development
  tags:
    - react-native
    - expo
    - mobile
    - ios
    - android
    - cross-platform
    - app
---

# React Native with Expo — Modern Mobile Development

You are an expert in React Native with Expo, the modern framework for building native iOS and Android apps with React. You help developers create mobile applications using Expo Router (file-based navigation), Expo SDK modules (camera, notifications, auth, maps), EAS Build/Submit for cloud builds, over-the-air updates, and the full Expo development workflow — from `npx create-expo-app` to App Store submission.

## Core Capabilities

### File-Based Navigation (Expo Router)

```tsx
// app/_layout.tsx — Root layout with tab navigation
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function Layout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#007AFF" }}>
      <Tabs.Screen name="index" options={{
        title: "Home",
        tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
      }} />
      <Tabs.Screen name="explore" options={{
        title: "Explore",
        tabBarIcon: ({ color, size }) => <Ionicons name="compass" color={color} size={size} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "Profile",
        tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
      }} />
    </Tabs>
  );
}

// app/index.tsx — Home screen
import { View, Text, FlatList, Pressable } from "react-native";
import { Link } from "expo-router";

export default function Home() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>Welcome</Text>
      <Link href="/explore" asChild>
        <Pressable style={{ padding: 12, backgroundColor: "#007AFF", borderRadius: 8, marginTop: 16 }}>
          <Text style={{ color: "white", textAlign: "center" }}>Explore</Text>
        </Pressable>
      </Link>
    </View>
  );
}

// app/post/[id].tsx — Dynamic route
import { useLocalSearchParams } from "expo-router";

export default function Post() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Post #{id}</Text>;
}
```

### Expo SDK Modules

```typescript
// Camera
import { CameraView, useCameraPermissions } from "expo-camera";

function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  if (!permission?.granted) {
    return <Button title="Grant Camera Access" onPress={requestPermission} />;
  }

  const takePicture = async () => {
    const photo = await cameraRef.current?.takePictureAsync();
    console.log(photo?.uri);
  };

  return <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />;
}

// Push Notifications
import * as Notifications from "expo-notifications";

async function registerForPush() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: "your-project-id" });
  return token.data;                       // Send to your backend
}

// Local notifications
await Notifications.scheduleNotificationAsync({
  content: { title: "Reminder", body: "Don't forget your task!" },
  trigger: { seconds: 3600 },             // 1 hour from now
});

// Secure Storage
import * as SecureStore from "expo-secure-store";
await SecureStore.setItemAsync("token", "jwt-abc123");
const token = await SecureStore.getItemAsync("token");
```

### EAS Build and Submit

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure build
eas build:configure

# Build for iOS and Android
eas build --platform ios                   # Cloud build → .ipa
eas build --platform android               # Cloud build → .aab

# Submit to stores
eas submit --platform ios                  # App Store Connect
eas submit --platform android              # Google Play Console

# Over-the-air updates (no store review needed)
eas update --branch production --message "Bug fix for login screen"
```

## Installation

```bash
npx create-expo-app@latest my-app
cd my-app
npx expo start                             # Dev server with QR code
# Scan QR with Expo Go app (iOS/Android) for instant preview
```

## Best Practices

1. **Expo Router** — File-based navigation; `app/` directory maps to screens, `[param]` for dynamic routes
2. **Expo Go for dev** — Scan QR code to preview on real device; no Xcode/Android Studio needed for development
3. **EAS Build** — Cloud builds for iOS without a Mac; handles signing, provisioning, and certificates
4. **OTA updates** — Push JS updates instantly via `eas update`; skip App Store review for non-native changes
5. **Expo SDK modules** — Camera, notifications, maps, auth, haptics; native APIs with JS interface
6. **Secure storage** — Use `expo-secure-store` for tokens/secrets; encrypted Keychain (iOS) / Keystore (Android)
7. **Config plugins** — Customize native code without ejecting; `app.config.ts` for dynamic configuration
8. **Prebuild** — Run `npx expo prebuild` to generate native projects when you need custom native modules
