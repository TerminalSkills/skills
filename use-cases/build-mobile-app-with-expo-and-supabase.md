---
title: Build a Full-Stack Mobile App with Expo and Supabase
slug: build-mobile-app-with-expo-and-supabase
description: Build and ship a full-stack React Native mobile app in 2 weeks — Expo Router navigation, Supabase Auth with magic link and OAuth, Realtime subscriptions, file storage, push notifications, and App Store + Google Play deployment via EAS Build.
skills:
  - supabase
  - expo-router
category: mobile
tags:
  - expo
  - react-native
  - supabase
  - mobile
  - push-notifications
  - eas-build
  - oauth
---

# Build a Full-Stack Mobile App with Expo and Supabase

Yuki is a web developer. She's been building Next.js apps for years and wants to ship a mobile app — a habit tracker where users log daily habits, see streaks, and get push notification reminders. She has two weeks before her vacation. She doesn't want to learn Swift or Kotlin. Expo + Supabase is her path from web dev to App Store in 14 days.

## Step 1 — Project Setup and Expo Router Navigation

```bash
# Bootstrap a new Expo app with TypeScript and file-based routing
npx create-expo-app@latest habits --template expo-template-blank-typescript
cd habits
npx expo install expo-router expo-constants expo-linking expo-status-bar react-native-safe-area-context react-native-screens

# Supabase client + Auth
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage

# Push notifications
npx expo install expo-notifications expo-device

# Image picker for avatar uploads
npx expo install expo-image-picker
```

```typescript
// app/_layout.tsx — Root layout. Auth gate: redirect to /login if no session.

import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function RootLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading]);

  return <Slot />;
}
```

```
// File-based routing structure:
// app/
//   _layout.tsx          ← Root layout (auth gate)
//   (auth)/
//     login.tsx          ← Magic link + OAuth login
//     verify.tsx         ← Magic link verification
//   (tabs)/
//     _layout.tsx        ← Bottom tab navigator
//     index.tsx          ← Today's habits
//     progress.tsx       ← Streak calendar
//     profile.tsx        ← User profile + settings
```

## Step 2 — Supabase Auth: Magic Link and OAuth

```typescript
// lib/supabase.ts — Supabase client configured for React Native.
// Uses AsyncStorage for session persistence across app restarts.

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,  // Handled manually via deep link
    },
  }
);
```

```typescript
// app/(auth)/login.tsx — Magic link + Google/Apple OAuth sign-in.

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();  // Required for OAuth redirect handling

const redirectUri = makeRedirectUri({ scheme: "habits", path: "auth/callback" });

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMagicLink() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectUri },
    });
    setLoading(false);

    if (error) return Alert.alert("Error", error.message);
    Alert.alert("Check your email!", `We sent a login link to ${email}`);
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUri, skipBrowserRedirect: true },
    });
    if (error || !data.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    if (result.type === "success") {
      const params = new URLSearchParams(result.url.split("#")[1]);
      await supabase.auth.setSession({
        access_token: params.get("access_token")!,
        refresh_token: params.get("refresh_token")!,
      });
    }
  }

  async function signInWithApple() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: redirectUri, skipBrowserRedirect: true },
    });
    if (error || !data.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    if (result.type === "success") {
      const params = new URLSearchParams(result.url.split("#")[1]);
      await supabase.auth.setSession({
        access_token: params.get("access_token")!,
        refresh_token: params.get("refresh_token")!,
      });
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Habits</Text>
      <TextInput
        style={styles.input}
        placeholder="your@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TouchableOpacity style={styles.button} onPress={sendMagicLink} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Sending..." : "Send Magic Link"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.google]} onPress={signInWithGoogle}>
        <Text style={styles.buttonText}>Continue with Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.apple]} onPress={signInWithApple}>
        <Text style={styles.buttonText}>Continue with Apple</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 32, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: "#6366f1", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 10 },
  google: { backgroundColor: "#4285F4" },
  apple: { backgroundColor: "#000" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
```

## Step 3 — Supabase Realtime for Live Habit Updates

```typescript
// hooks/useHabits.ts — Fetch today's habits and subscribe to real-time updates.
// Useful when the user has the app open on two devices simultaneously.

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface HabitLog {
  id: string;
  habit_id: string;
  logged_at: string;
  habits: { id: string; name: string; emoji: string };
}

export function useTodayHabits(userId: string) {
  const [habits, setHabits] = useState<HabitLog[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];

    // Initial fetch
    supabase
      .from("habit_logs")
      .select("*, habits(id, name, emoji)")
      .eq("user_id", userId)
      .gte("logged_at", `${today}T00:00:00`)
      .then(({ data }) => setHabits(data ?? []));

    // Real-time subscription — fires when logs are inserted/deleted
    const channel = supabase
      .channel("habit_logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "habit_logs", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setHabits((prev) => [...prev, payload.new as HabitLog]);
          } else if (payload.eventType === "DELETE") {
            setHabits((prev) => prev.filter((h) => h.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return habits;
}
```

## Step 4 — Supabase Storage for Avatar Uploads

```typescript
// lib/storage.ts — Upload profile avatar to Supabase Storage.
// Returns a public URL for the uploaded image.

import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets[0].base64) return null;

  const asset = result.assets[0];
  const ext = asset.uri.split(".").pop() ?? "jpg";
  const path = `avatars/${userId}.${ext}`;

  const { error } = await supabase.storage
    .from("profiles")
    .upload(path, decode(asset.base64), {
      contentType: `image/${ext}`,
      upsert: true,                     // Replace existing avatar
    });

  if (error) throw error;

  const { data } = supabase.storage.from("profiles").getPublicUrl(path);
  return data.publicUrl;
}
```

## Step 5 — Push Notifications for Daily Habit Reminders

```typescript
// lib/notifications.ts — Register for push notifications and save the token to Supabase.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return; // Push notifications require a physical device

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Daily Reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Save token to Supabase so backend can send notifications
  await supabase.from("push_tokens").upsert({
    user_id: userId,
    token,
    platform: Platform.OS,
  });
}

export async function scheduleLocalReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to log your habits! 🎯",
      body: "Keep your streak alive",
    },
    trigger: {
      hour,
      minute,
      repeats: true,        // Fire daily at this time
    },
  });
}
```

## Step 6 — Deploy to App Store and Google Play via EAS Build

```json
// eas.json — EAS Build configuration for development, preview, and production builds.
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "resourceClass": "m1-medium" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "yuki@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production"
      }
    }
  }
}
```

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Build for both platforms simultaneously
eas build --platform all --profile production

# Submit to App Store and Google Play
eas submit --platform all --profile production --latest
```

## Results

Yuki submitted to both stores on day 13 of her 14-day sprint.

- **Development speed** — Expo's hot reload + Supabase's instant backend meant she was testing real features on her phone within 30 minutes of starting. No Android Studio setup, no Xcode simulator crashes.
- **Auth just works** — magic link + Google took 2 hours to implement, including deep link handling. Apple Sign-In (required by App Store for apps with social login) took 1 extra hour.
- **Realtime streaks** — when a user logs a habit on the web companion, the mobile app updates instantly. Supabase Realtime over WebSocket, no extra infrastructure.
- **EAS Build** — first production build took 12 minutes (iOS) and 8 minutes (Android), running in Expo's cloud. No Mac required for the Android build; Yuki's MacBook handled iOS.
- **App Store approval: 2 days** — Yuki submitted on a Friday, approved Sunday. Google Play was live within 4 hours of submission.
- **Push notification opt-in: 68%** — users who enable reminders have a 3× higher 30-day retention rate than those who don't.
