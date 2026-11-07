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

Sam is a solo developer building a meal planning app. Users create weekly meal plans, get an auto-generated grocery list, and share plans with their household. She needs the app on both iOS and Android, but has no Xcode experience and doesn't own a Mac. She wants to go from idea to the stores in about a week using a single TypeScript codebase.

## Step 1 — Set Up Expo with File-Based Routing

```bash
# The default template (Expo SDK 58) includes Expo Router and TypeScript; "@/" points at src/.
npx create-expo-app@latest mealplan && cd mealplan
npm run reset-project        # clears the demo screens, leaves a clean src/app

# expo install picks package versions that match the SDK
npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill \
  expo-notifications expo-device expo-constants expo-haptics
npm install @tanstack/react-query
```

Expo Router turns `src/app/` into a navigation structure; tabs, stacks and modals come from file and folder conventions, as in Next.js. Run `npx expo-doctor` when versions look off. The `react-native` skill supplies the app conventions used below: TanStack Query v5 for server state and tokens in `expo-secure-store`.

```typescript
// src/app/_layout.tsx — Root layout: providers and the root navigator.
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/providers/session";
const queryClient = new QueryClient();
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </QueryClientProvider>
  );
}
```

The tab bar lives in `src/app/(tabs)/_layout.tsx`: a `<Tabs screenOptions={{ tabBarActiveTintColor: "#10b981" }}>` with three `<Tabs.Screen>` entries (`index` "Meal Plans", `grocery` "Grocery List", `profile` "Profile"), each with a `tabBarIcon: ({ color, size }) => <Ionicons name="..." size={size} color={color} />`.

## Step 2 — Database, Household Sharing, and Row Level Security

Supabase provides the Postgres database, auth, and realtime. Sharing a plan with a household must be enforced in the database, not in the app: use a membership table and RLS. Do not use `user_metadata` for this, because signed-in users can edit their own metadata. The schema goes into a migration (Supabase CLI 3.x, Docker for the local stack): `npx supabase init`, then `npx supabase migration new create_meal_plan`.

```sql
-- supabase/migrations/<timestamp>_create_meal_plan.sql
create table public.households (id uuid primary key default gen_random_uuid(), name text not null);
create table public.household_members (
  household_id uuid references public.households on delete cascade,
  user_id uuid references auth.users on delete cascade default auth.uid(),
  primary key (household_id, user_id)
);
create table public.recipes (id uuid primary key default gen_random_uuid(), title text not null);
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  recipe_id uuid references public.recipes,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner'))
);
create table public.push_tokens (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  token text not null,
  platform text not null
);
-- recipe_ingredients and ingredients follow the same pattern

-- Definer function, so the policies below do not recurse into RLS
create function public.is_member(h uuid) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.household_members m
                 where m.household_id = h and m.user_id = (select auth.uid()));
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.recipes enable row level security;
alter table public.meals enable row level security;
alter table public.push_tokens enable row level security;

create policy "members read household" on public.households for select to authenticated
  using (public.is_member(id));
create policy "see own memberships" on public.household_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "read recipes" on public.recipes for select to authenticated using (true);
create policy "members manage meals" on public.meals for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "own token" on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.meals;
```

```bash
npx supabase db reset                       # rebuild the local database from migrations
npx supabase link "$PROJECT_REF"            # 20-letter ref from the dashboard URL
npx supabase db push --remote --dry-run     # preview
npx supabase db push --remote               # apply (asks first; --yes in CI); a bare db push is local
```

Invites create a `household_members` row through an RPC or edge function that checks an invite code with the secret key on the server. The app never holds the secret key.

Auth tokens belong in `expo-secure-store`, not AsyncStorage. A Supabase session can exceed the ~2 KB some iOS releases accept per SecureStore value, so a small adapter splits it into chunks:

```typescript
// src/lib/secure-storage.ts — Supabase session storage on the Keychain/Keystore.
import * as SecureStore from "expo-secure-store";
const CHUNK = 500;   // characters per entry
const count = async (key: string) => Number(await SecureStore.getItemAsync(`${key}.count`));
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await count(key);
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.count`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const n = await count(key);
    await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.count`);
  },
};
```

```typescript
// src/lib/supabase.ts — use the publishable key (sb_publishable_...) in the app.
import "react-native-url-polyfill/auto";
import { secureStorage } from "@/lib/secure-storage";
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);
```

The `SessionProvider` wraps `supabase.auth.getSession()` and `onAuthStateChange` and exposes `{ session }`. Sam keeps the user's household id in a `useHousehold()` hook that reads her `household_members` row.

## Step 3 — Build the Meal Plan Screen

```typescript
// src/hooks/use-week-meals.ts — the week's meals, with live updates from the household.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
export function useWeekMeals(householdId: string | null, weekDates: string[]) {   // weekDates: Monday-Sunday, "YYYY-MM-DD"
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["meals", householdId, weekDates[0]],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meals")
        .select("id, date, meal_type, recipe_id, recipes(id, title)")
        .eq("household_id", householdId!)
        .gte("date", weekDates[0]).lte("date", weekDates[6])
        .order("date").order("meal_type");
      if (error) throw error;
      return data;
    },
  });
  // When another household member changes a meal, refetch the week.
  useEffect(() => {
    if (!householdId) return;
    const channel = supabase
      .channel(`meals:${householdId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "meals", filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: ["meals"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [householdId, queryClient]);
  return query;
}
```

`src/app/(tabs)/index.tsx` calls `useWeekMeals(useHousehold(), getWeekDates())`, groups the rows by `date`, and renders one `FlatList` row per day: a date heading, a `MealCard` per meal (tap pushes `/recipe/<recipe_id>`), or an `EmptyDay` button that pushes `/add-meal?date=<date>`.

## Step 4 — Auto-Generate the Grocery List

The grocery list merges duplicate ingredients across the week's meals (2 cups flour + 1 cup flour = 3 cups) and groups them by aisle.

```typescript
// src/lib/utils.ts
export interface Ingredient { name: string; amount: number; unit: string; aisle: string }
export function mergeIngredients(items: Ingredient[]): Ingredient[] {
  const merged = new Map<string, Ingredient>();
  for (const it of items) {
    const key = `${it.name.toLowerCase()}|${it.unit}`;     // only same-unit amounts add up
    const found = merged.get(key);
    if (found) found.amount += it.amount;
    else merged.set(key, { ...it });
  }
  return [...merged.values()];
}
export function groupByAisle(items: Ingredient[]) {
  const byAisle: Record<string, Ingredient[]> = {};
  for (const it of items) (byAisle[it.aisle] ??= []).push(it);
  return Object.entries(byAisle)
    .map(([title, data]) => ({ title, data }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
```

The grocery screen fetches the week's meals with one nested select, `meals` then `recipes(recipe_ingredients(amount, unit, ingredients(name, aisle)))`, filtered the same way as above. It flattens the rows into `Ingredient[]` (aisle defaults to "Other") and runs `groupByAisle(mergeIngredients(all))` in a `useMemo`.

The screen renders `sections` in a `SectionList` (key `name|unit`, aisle title as the section header). Each row is a `Pressable` that calls `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` and toggles the item in `useCheckedItems`, a small hook that keeps the checked names in React state.

## Step 5 — Add Push Notifications

Remote push needs a physical device, and on Android a development build (Expo Go does not support it). Sam builds one with `eas build --profile development`.

```typescript
// src/lib/notifications.ts — register for push, store the token, handle taps.
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";
Notifications.setNotificationHandler({
  // banner and list entry while the app is open
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return;
  if (Platform.OS === "android") {    // create the channel before asking for a token
    await Notifications.setNotificationChannelAsync("meal-reminders", { name: "Meal Reminders", importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from("push_tokens").upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: "user_id" });
}
```

Sending is server-side: a Supabase edge function reads `push_tokens` and posts to Expo's push service. Tapping a notification can deep link with `Notifications.addNotificationResponseReceivedListener` and `router.push(...)`. The `expo` skill covers the token and device-only limits.

## Step 6 — Build and Submit with EAS

```bash
npm install --global eas-cli      # or: npx eas-cli@latest <command>
eas login && eas build:configure  # creates eas.json, links the project
eas update:configure              # adds runtimeVersion, updates.url, a channel per build profile
```

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "ios": { "simulator": true } },
    "preview": { "distribution": "internal", "channel": "preview" },
    "production": { "autoIncrement": true, "channel": "production" }
  },
  "submit": { "production": {
    "ios": { "ascAppId": "<App Store Connect app id>" },
    "android": { "serviceAccountKeyPath": "./google-play-key.json", "track": "production" } } }
}
```

Keep `google-play-key.json` out of git. Build and submit:

```bash
eas build --platform all --profile production    # runs in EAS cloud, no Mac needed
eas submit --platform all --profile production

# JavaScript-only fix, no store review (native changes still need a new build)
eas update --channel production --environment production --message "Fix grocery list merge bug"
```

A build only receives updates whose runtime version matches its own, so anything that touches native code or config needs a new build. Two store rules matter for a solo developer: Apple needs a developer account and TestFlight handles beta testers, and a new personal Google Play developer account needs a closed test with at least 12 testers opted in for 14 continuous days before it can apply for production access, so Sam starts that test on day 3.

## Results

Sam's schedule: days 1-2 auth, meal plan CRUD and the recipe database; day 3 the grocery list, haptics and the Play closed test; day 4 push notifications and household sharing through invite codes and RLS; day 5 polish; day 6 EAS Build and Submit, with TestFlight for beta testers.

What the stack gave her: one TypeScript codebase for both platforms (a few `Platform.OS` branches, such as the Android notification channel), cloud builds with no Xcode or Android Studio, JavaScript-only fixes through `eas update` without store review, and a household plan that refreshes over Supabase Realtime with the sharing rules enforced by RLS.
