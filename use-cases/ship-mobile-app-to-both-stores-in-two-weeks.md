---
title: Ship a Mobile App to Both App Stores in Two Weeks
slug: ship-mobile-app-to-both-stores-in-two-weeks
description: A solo developer ships a cross-platform mobile app to iOS App Store and Google Play in 14 days — using Expo for development without Xcode knowledge, EAS Build for cloud builds, expo-router for navigation, push notifications for engagement, and over-the-air updates for instant bug fixes — going from idea to live apps with real users paying through in-app purchases.
skills: [react-native-expo, expo-router, nativewind, stripe-billing, vitest]
category: development
tags: [mobile, ios, android, expo, react-native, app-store, cross-platform, startup]
---

# Ship a Mobile App to Both App Stores in Two Weeks

Mira is a solo developer with a validated idea: a meditation timer that lets you track streaks and share them with friends. She's interviewed 50 potential users, 30 said they'd pay $4.99/month. She has React experience but has never built a mobile app. She doesn't own a Mac. She needs to ship to both App Store and Google Play in 2 weeks, because a competitor is building the same thing.

## Day 1-2: Project Setup and Core Navigation

```bash
# No Xcode, no Android Studio, just this:
npx create-expo-app@latest zen-timer --template tabs
cd zen-timer
npx expo install expo-router expo-notifications expo-haptics expo-av
npx expo install @react-native-async-storage/async-storage
npm install nativewind tailwindcss
```

Mira sets up file-based navigation with expo-router. Four tabs: Timer, Stats, Friends, Settings.

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#8B5CF6", headerShown: false }}>
      <Tabs.Screen name="index" options={{
        title: "Timer",
        tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="stats" options={{
        title: "Stats",
        tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
      }} />
      <Tabs.Screen name="friends" options={{
        title: "Friends",
        tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
      }} />
      <Tabs.Screen name="settings" options={{
        title: "Settings",
        tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
      }} />
    </Tabs>
  );
}
```

## Day 3-5: Core Feature — The Timer

The timer is the whole product. It needs to feel great: smooth animations, haptic feedback when the session ends, ambient sounds, and it must work when the screen is locked.

```tsx
// app/(tabs)/index.tsx — Meditation timer
import { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DURATIONS = [5, 10, 15, 20, 30];    // Minutes

export default function TimerScreen() {
  const [duration, setDuration] = useState(10);
  const [remaining, setRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<NodeJS.Timeout>();

  const startTimer = async () => {
    setRemaining(duration * 60);
    setIsRunning(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Keep audio session active (timer works when screen locks)
    await Audio.setAudioModeAsync({ staysActiveInBackground: true });

    // Breathing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 4000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
      ]),
    ).start();
  };

  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            completeSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, remaining]);

  const completeSession = async () => {
    setIsRunning(false);
    pulseAnim.stopAnimation();

    // Celebration haptics
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Play completion sound
    const { sound } = await Audio.Sound.createAsync(require("../../assets/bell.mp3"));
    await sound.playAsync();

    // Save session and update streak
    await saveSession(duration);
  };

  const saveSession = async (minutes: number) => {
    const today = new Date().toISOString().split("T")[0];
    const sessions = JSON.parse(await AsyncStorage.getItem("sessions") || "[]");
    sessions.push({ date: today, minutes, completedAt: new Date().toISOString() });
    await AsyncStorage.setItem("sessions", JSON.stringify(sessions));

    // Update streak
    await updateStreak(today);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View className="flex-1 bg-slate-900 items-center justify-center">
      <Animated.View
        style={{ transform: [{ scale: pulseAnim }] }}
        className="w-64 h-64 rounded-full bg-violet-500/20 items-center justify-center"
      >
        <Text className="text-6xl font-bold text-white">
          {isRunning ? formatTime(remaining) : `${duration}m`}
        </Text>
      </Animated.View>

      {!isRunning ? (
        <>
          <View className="flex-row gap-3 mt-8">
            {DURATIONS.map(d => (
              <Pressable key={d} onPress={() => setDuration(d)}
                className={`px-4 py-2 rounded-full ${d === duration ? "bg-violet-500" : "bg-slate-800"}`}>
                <Text className="text-white font-medium">{d}m</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={startTimer} className="mt-8 bg-violet-500 px-12 py-4 rounded-full">
            <Text className="text-white text-lg font-bold">Start</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => { setIsRunning(false); setRemaining(0); }}
          className="mt-8 bg-slate-800 px-8 py-3 rounded-full">
          <Text className="text-slate-400">Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}
```

## Day 6-8: Streaks, Stats, and Social

```tsx
// app/(tabs)/stats.tsx — Streak tracking and session history
export default function StatsScreen() {
  const [streak, setStreak] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [sessions, setSessions] = useState([]);

  useEffect(() => { loadStats(); }, []);

  return (
    <View className="flex-1 bg-slate-900 p-6">
      {/* Streak counter — the core retention mechanic */}
      <View className="bg-violet-500/20 rounded-2xl p-6 items-center mb-6">
        <Text className="text-5xl font-bold text-violet-400">🔥 {streak}</Text>
        <Text className="text-slate-400 mt-2">Day Streak</Text>
      </View>

      <View className="flex-row gap-4 mb-6">
        <View className="flex-1 bg-slate-800 rounded-xl p-4">
          <Text className="text-2xl font-bold text-white">{totalMinutes}</Text>
          <Text className="text-slate-400 text-sm">Total Minutes</Text>
        </View>
        <View className="flex-1 bg-slate-800 rounded-xl p-4">
          <Text className="text-2xl font-bold text-white">{sessions.length}</Text>
          <Text className="text-slate-400 text-sm">Sessions</Text>
        </View>
      </View>

      {/* Calendar heatmap showing meditation days */}
      <CalendarHeatmap sessions={sessions} />
    </View>
  );
}
```

## Day 9-10: Push Notifications and Streak Reminders

```typescript
// services/notifications.ts
import * as Notifications from "expo-notifications";

export async function setupDailyReminder() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  // Cancel existing reminders
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule daily reminder at user's preferred time
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🧘 Time to meditate",
      body: "Keep your streak alive! Just 5 minutes today.",
      sound: true,
    },
    trigger: { hour: 20, minute: 0, repeats: true },  // 8 PM daily
  });
}

// Streak-breaking urgency notification
export async function scheduleStreakReminder(currentStreak: number) {
  if (currentStreak < 3) return;           // Only for meaningful streaks

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⚠️ Your ${currentStreak}-day streak!`,
      body: "Don't break it! A quick 5-minute session will keep it going.",
      sound: true,
      badge: 1,
    },
    trigger: { hour: 21, minute: 30, repeats: false },  // 9:30 PM one-time
  });
}
```

## Day 11-12: Build and Submit

No Mac needed. Mira builds and submits from her Linux laptop:

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for both platforms (cloud builds)
eas build --platform ios        # Builds .ipa in the cloud
eas build --platform android    # Builds .aab in the cloud

# Submit to stores
eas submit --platform ios       # Uploads to App Store Connect
eas submit --platform android   # Uploads to Google Play Console
```

## Day 13-14: First Bug Fix via OTA Update

A user reports the timer doesn't play the bell sound on some Android devices. Mira fixes it and pushes an update — no store review needed:

```bash
# Fix the bug, then:
eas update --branch production --message "Fix bell sound on Android 14+"
# Update is live for ALL users within minutes — no App Store review wait
```

## Results

Two weeks from `npx create-expo-app` to live on both stores:

- **Day 14**: Live on App Store and Google Play; 50 beta users from the interview list
- **Week 2**: 200 downloads; 45% D7 retention (strong for meditation apps)
- **Week 4**: 500 downloads; 12% conversion to $4.99/month subscription
- **Revenue**: $300 MRR after 4 weeks; covers infrastructure costs
- **Streaks**: Average active user has 8-day streak; longest streak is 23 days
- **OTA updates**: 3 bug fixes pushed via EAS Update without store review; users never saw broken versions
- **Development**: Single codebase serves both platforms; 95% code shared between iOS and Android
- **No Mac needed**: Entire development, build, and submission done from a Linux laptop using EAS cloud builds
- **Time-to-market**: Competitor launched 3 weeks later; Mira already had 500 users and reviews when they appeared
