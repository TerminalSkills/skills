---
title: Build a Cross-Platform Mobile App with Expo
slug: build-cross-platform-mobile-app-with-expo
description: Build and ship an iOS and Android app from a single TypeScript codebase using Expo Router, EAS Build, and push notifications — from first commit to App Store in one week.
skills:
  - expo
  - react-native
  - supabase
category: development
tags:
  - mobile
  - ios
  - android
  - react-native
  - cross-platform
---

# Build a Cross-Platform Mobile App with Expo

Sam is a solo developer building a meal planning app. Users create weekly meal plans, get an auto-generated grocery list, and share plans with their household. She needs the app on both iOS and Android, but has no Xcode experience and doesn't own a Mac. She wants to go from idea to App Store in one week using a single TypeScript codebase.

## Step 1 — Set Up Expo with File-Based Routing

Expo Router turns the `app/` directory into a navigation structure. Tabs, stacks, and modals are all defined by file and folder conventions — the same mental model as Next.js.

```typescript
// app/_layout.tsx — Root layout.
// Wraps the entire app with providers and defines the root navigator.
// Expo Router reads this file first and uses it as the navigation container.

import { Stack } from "expo-router";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { SessionProvider } from "@/providers/session";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack>
      </SessionProvider>
    </QueryClientProvider>
  );
}
```

```typescript
// app/(tabs)/_layout.tsx — Tab navigator.
// Three tabs: meal plans, grocery list, and profile.
// Icons from @expo/vector-icons (bundled with Expo).

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#10b981",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Meal Plans",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: "Grocery List",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

## Step 2 — Build the Meal Plan Screen with Supabase

Supabase provides the database, auth, and real-time subscriptions. When one household member adds a meal, the other members see it instantly.

```typescript
// app/(tabs)/index.tsx — Weekly meal plan view.
// Fetches the current week's meals from Supabase.
// TanStack Query handles caching and background refresh.

import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";
import { getWeekDates } from "@/lib/dates";
import { MealCard } from "@/components/meal-card";
import { EmptyDay } from "@/components/empty-day";

export default function MealPlanScreen() {
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const weekDates = getWeekDates();  // Returns Mon-Sun date strings

  const { data: meals, isLoading } = useQuery({
    queryKey: ["meals", weekDates[0], weekDates[6]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meals")
        .select("*, recipes(*)")
        .eq("household_id", session!.user.user_metadata.household_id)
        .gte("date", weekDates[0])
        .lte("date", weekDates[6])
        .order("date")
        .order("meal_type");  // breakfast, lunch, dinner

      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  // Group meals by date
  const mealsByDate = weekDates.map((date) => ({
    date,
    meals: meals?.filter((m) => m.date === date) || [],
  }));

  return (
    <FlatList
      data={mealsByDate}
      keyExtractor={(item) => item.date}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <View style={styles.daySection}>
          <Text style={styles.dayHeader}>
            {new Date(item.date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
          {item.meals.length > 0 ? (
            item.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onPress={() => router.push(`/recipe/${meal.recipe_id}`)}
              />
            ))
          ) : (
            <EmptyDay
              date={item.date}
              onAdd={() => router.push(`/add-meal?date=${item.date}`)}
            />
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  daySection: { marginBottom: 24 },
  dayHeader: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
});
```

## Step 3 — Auto-Generate the Grocery List

The grocery list aggregates ingredients from all planned meals, merges duplicates (2 cups flour + 1 cup flour = 3 cups flour), and groups by store aisle.

```typescript
// app/(tabs)/grocery.tsx — Auto-generated grocery list.
// Computes the list from this week's meal plan.
// Items can be checked off and the list persists locally.

import { View, Text, SectionList, Pressable, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";
import { useCheckedItems } from "@/hooks/use-checked-items";
import { getWeekDates, mergeIngredients } from "@/lib/utils";

export default function GroceryScreen() {
  const { session } = useSession();
  const weekDates = getWeekDates();
  const { checkedItems, toggleItem } = useCheckedItems();

  const { data: meals } = useQuery({
    queryKey: ["meals-with-ingredients", weekDates[0], weekDates[6]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meals")
        .select("*, recipes(*, recipe_ingredients(*, ingredients(*)))")
        .eq("household_id", session!.user.user_metadata.household_id)
        .gte("date", weekDates[0])
        .lte("date", weekDates[6]);

      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  // Merge ingredients, group by aisle
  const sections = useMemo(() => {
    if (!meals) return [];

    const allIngredients = meals.flatMap((meal) =>
      meal.recipes.recipe_ingredients.map((ri: any) => ({
        name: ri.ingredients.name,
        amount: ri.amount,
        unit: ri.unit,
        aisle: ri.ingredients.aisle || "Other",
      }))
    );

    const merged = mergeIngredients(allIngredients);

    // Group by aisle
    const grouped = Object.groupBy(merged, (item) => item.aisle);
    return Object.entries(grouped)
      .map(([aisle, items]) => ({ title: aisle, data: items! }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [meals]);

  const handleToggle = useCallback((itemName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleItem(itemName);
  }, [toggleItem]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.name}
      contentContainerStyle={styles.container}
      renderSectionHeader={({ section: { title } }) => (
        <Text style={styles.sectionHeader}>{title}</Text>
      )}
      renderItem={({ item }) => {
        const isChecked = checkedItems.has(item.name);
        return (
          <Pressable
            onPress={() => handleToggle(item.name)}
            style={[styles.item, isChecked && styles.itemChecked]}
          >
            <Ionicons
              name={isChecked ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={isChecked ? "#10b981" : "#9ca3af"}
            />
            <Text style={[styles.itemText, isChecked && styles.itemTextChecked]}>
              {item.amount} {item.unit} {item.name}
            </Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Add meals to your plan to generate a grocery list
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  sectionHeader: {
    fontSize: 14, fontWeight: "600", color: "#6b7280",
    textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8,
  },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6",
  },
  itemChecked: { opacity: 0.5 },
  itemText: { fontSize: 16, color: "#111827", flex: 1 },
  itemTextChecked: { textDecorationLine: "line-through", color: "#9ca3af" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { fontSize: 16, color: "#9ca3af", textAlign: "center" },
});
```

## Step 4 — Add Push Notifications

```typescript
// src/lib/notifications.ts — Push notification setup.
// Registers for push tokens on app start, stores the token in Supabase
// for server-side sending. Handles notification taps for deep linking.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "./supabase";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,       // Show banner even when app is open
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return;
  }

  // Request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  // Get Expo push token
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });

  // Store token in database for server-side sending
  await supabase
    .from("push_tokens")
    .upsert({
      user_id: userId,
      token: token,
      platform: Platform.OS,
    }, { onConflict: "user_id" });

  // Android: create notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("meal-reminders", {
      name: "Meal Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
    });
  }
}

// Handle notification taps — deep link to the relevant screen
export function setupNotificationListeners() {
  // When user taps a notification
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === "grocery") {
        router.push("/(tabs)/grocery");
      } else if (data?.mealId) {
        router.push(`/recipe/${data.mealId}`);
      }
    }
  );

  return () => subscription.remove();
}
```

## Step 5 — Build and Submit with EAS

```json
// eas.json — EAS Build configuration.
// Three profiles: development (for testing), preview (for beta testers),
// and production (for App Store / Google Play).
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "sam@example.com",
        "ascAppId": "123456789",
        "appleTeamId": "ABCDE12345"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "production"
      }
    }
  }
}
```

```bash
# Build for both platforms (runs in EAS cloud — no Mac needed)
eas build --platform all --profile production

# Submit to App Store and Google Play
eas submit --platform all --profile production

# Push a JS-only update (bypasses app store review)
eas update --branch production --message "Fix grocery list merge bug"
```

## Results

Sam went from `npx create-expo-app` to App Store submission in 6 days:

- **Day 1-2**: Auth, meal plan CRUD, recipe database — Expo Router + Supabase
- **Day 3**: Grocery list generation, haptic feedback, offline checklist persistence
- **Day 4**: Push notifications, household sharing via invite links
- **Day 5**: Polish — animations with Reanimated, loading skeletons, error boundaries
- **Day 6**: EAS Build + Submit to both stores, TestFlight for beta testers

Key metrics after the first month:

- **Single codebase**: 100% code sharing between iOS and Android. Zero platform-specific files.
- **Build time: 8 minutes** on EAS Cloud for both platforms simultaneously. No Xcode or Android Studio installed locally.
- **App size: 12MB** on iOS, 8MB on Android — smaller than most native apps with equivalent features.
- **OTA updates: 3 bug fixes shipped** in the first week without waiting for App Store review. Users get the fix in under a minute via `eas update`.
- **2,400 installs** in the first month (60% iOS, 40% Android). The grocery list feature drives daily active usage — 68% DAU/MAU ratio.
- **Real-time sync works** — when one household member adds "Chicken Parmesan" to Wednesday dinner, the other member's grocery list updates within 2 seconds.
