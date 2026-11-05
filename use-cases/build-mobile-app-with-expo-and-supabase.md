---
title: Build a Full-Stack Mobile App with Expo and Supabase
slug: build-mobile-app-with-expo-and-supabase
description: Build and ship a full-stack React Native mobile app in 2 weeks — Expo Router navigation, Supabase Auth with magic link and OAuth, Realtime subscriptions, file storage, push notifications, and App Store + Google Play deployment via EAS Build.
skills:
  - supabase
  - expo
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

Yuki is a web developer. She's been building Next.js apps for years and wants to ship a mobile app — a habit tracker where users log daily habits, see streaks, and get push notification reminders. She has two weeks before her vacation and doesn't want to learn Swift or Kotlin. Expo + Supabase is her path from web dev to the stores.

## Step 1 — Project Setup and Expo Router

```bash
# The default template (Expo SDK 58) includes Expo Router and TypeScript; "@/" points at src/.
npx create-expo-app@latest habits && cd habits
npm run reset-project    # moves the demo screens aside, leaves a clean src/app

npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill \
  expo-web-browser expo-auth-session expo-linking expo-notifications expo-device expo-constants expo-image-picker
npm install base64-arraybuffer
```

Set `"scheme": "habits"` in `app.json`; the OAuth and magic-link redirects use it. Run `npx expo-doctor` when versions look off.

```typescript
// src/app/_layout.tsx — Root layout. Auth gate: redirect to /login if there is no session.
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);   // undefined = loading
  const router = useRouter(), segments = useSegments();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session === undefined) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) router.replace("/login");
    else if (session && inAuthGroup) router.replace("/");
  }, [session, segments, router]);
  return <Slot />;
}
```

## Step 2 — Database and Policies with the Supabase CLI

The schema goes in a migration (Supabase CLI 3.x; Docker runs the local stack).

```bash
npx supabase init && npx supabase start      # local stack; prints the local URL and keys
npx supabase migration new create_habits     # supabase/migrations/<timestamp>_create_habits.sql
```

```sql
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, emoji text not null default '✅'
);
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  logged_at timestamptz not null default now()
);
create table public.push_tokens (user_id uuid primary key references auth.users on delete cascade, token text not null, platform text not null);

-- Same row-level rule on all three tables: you only see and write your own rows
do $$ declare t text; begin
  foreach t in array array['habits', 'habit_logs', 'push_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.habit_logs;   -- Realtime

-- Storage: public bucket; users write only in a folder named after their user id (one policy covers upsert)
insert into storage.buckets (id, name, public) values ('profiles', 'profiles', true);
create policy "own avatar" on storage.objects for all to authenticated
  using (bucket_id = 'profiles' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profiles' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

```bash
npx supabase db reset                              # rebuild the local database from migrations
npx supabase link "$PROJECT_REF"                   # 20-letter ref from the dashboard URL
npx supabase db push --remote --dry-run            # preview what the hosted project would receive
npx supabase db push --remote                      # apply (asks first; add --yes in CI); bare db push = local
```

## Step 3 — Supabase Auth: Magic Link and OAuth

In the dashboard add `habits://**` under Authentication, URL Configuration, Redirect URLs, and enable the Google and Apple providers. The app uses the **publishable** key (`sb_publishable_...`), never the secret key. Put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env`. Auth tokens belong in `expo-secure-store`, not AsyncStorage. A Supabase session can exceed the ~2 KB some iOS releases accept per SecureStore value, so a small adapter splits it into chunks:

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
// src/lib/supabase.ts — client configured for React Native.
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { secureStorage } from "@/lib/secure-storage";
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
// Refresh tokens only while the app is in the foreground
AppState.addEventListener("change", (s) => (s === "active" ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
```

```typescript
// src/lib/auth.ts — magic link + Google/Apple (Supabase native deep-linking guide).
import { useEffect } from "react";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";
WebBrowser.maybeCompleteAuthSession();   // web only
const redirectTo = makeRedirectUri({ scheme: "habits", path: "auth/callback" });
async function createSessionFromUrl(url: string) {
  const params = new URLSearchParams(url.split("#")[1] ?? "");   // tokens arrive in the fragment
  if (params.get("error")) throw new Error(params.get("error_description") ?? "Sign-in failed");
  const access_token = params.get("access_token"), refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return;
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}
export async function signInWith(provider: "google" | "apple") {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) return Alert.alert("Error", error?.message ?? "No URL");
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === "success") await createSessionFromUrl(res.url);
}
export function useMagicLinkLogin() {
  const url = Linking.useLinkingURL();   // magic links open the app through the "habits" scheme
  useEffect(() => {
    if (url) createSessionFromUrl(url).catch((e) => Alert.alert("Error", e.message));
  }, [url]);
  return async function sendMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: redirectTo } });
    Alert.alert(error ? "Error" : "Check your email", error?.message ?? `We sent a login link to ${email}`);
  };
}
```

`login.tsx` is a `TextInput` and three `Button`s: "Send Magic Link" calls the function from `useMagicLinkLogin()`, the other two call `signInWith("google")` and `signInWith("apple")`. If an app offers third-party login, App Store review expects an equivalent privacy-preserving option (usually Sign in with Apple), so Yuki ships both.

## Step 4 — Realtime for Live Habit Updates

```typescript
// src/hooks/useHabits.ts — today's logs, refetched when the table changes.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
export type HabitLog = { id: string; habit_id: string; logged_at: string; habits: { name: string; emoji: string } | null };
export function useTodayHabits(userId: string) {
  const [logs, setLogs] = useState<HabitLog[]>([]);
  useEffect(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);     // local midnight, sent as a UTC instant
    const load = async () => {
      const { data, error } = await supabase.from("habit_logs")
        .select("id, habit_id, logged_at, habits(name, emoji)")
        .eq("user_id", userId).gte("logged_at", startOfDay.toISOString()).returns<HabitLog[]>();
      if (!error) setLogs(data ?? []);
    };
    load();
    // Payloads lack the joined habit row, so refetch. DELETE events cannot be filtered by user_id; RLS limits the refetch.
    const channel = supabase
      .channel(`habit_logs:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "habit_logs", filter: `user_id=eq.${userId}` }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "habit_logs" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);
  return logs;
}
```

## Step 5 — Storage for Avatar Uploads

```typescript
// src/lib/storage.ts — upload to <user id>/avatar.<ext>, return the public URL.
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/lib/supabase";
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: true });
  const asset = result.assets?.[0];
  if (result.canceled || !asset?.base64) return null;
  const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${userId}/avatar.${ext}`;   // first folder = user id, matches the policy
  const { error } = await supabase.storage.from("profiles")
    .upload(path, decode(asset.base64), { contentType: `image/${ext}`, upsert: true });
  if (error) throw error;
  return supabase.storage.from("profiles").getPublicUrl(path).data.publicUrl;
}
```

## Step 6 — Push Notifications for Daily Reminders

Remote push does not work in Expo Go on Android; use a development build (`eas build --profile development`).
```typescript
// src/lib/notifications.ts — register for push and store the token in Supabase.
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return;                       // needs a physical device
  if (Platform.OS === "android") {                    // create the channel before asking for a token
    await Notifications.setNotificationChannelAsync("reminders", { name: "Daily Reminders", importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from("push_tokens").upsert({ user_id: userId, token, platform: Platform.OS });
}
export async function scheduleDailyReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: "Time to log your habits" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "reminders" },
  });
}
```

## Step 7 — Build and Submit with EAS

Install with `npm install --global eas-cli` (or `npx eas-cli@latest <command>`), then `eas login && eas build:configure`, which creates `eas.json` and links the project. Add the development profile and the submit settings to it:

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {
    "ios": { "ascAppId": "<App Store Connect app id>" },
    "android": { "serviceAccountKeyPath": "./google-service-account.json", "track": "production" } } }
}
```

Keep `google-service-account.json` out of git. Then `eas build --platform all --profile production` builds iOS and Android in Expo's cloud (no Mac needed) and `eas submit --platform all --profile production --latest` uploads them.

A new personal Google Play developer account must run a closed test first: at least 12 testers opted in continuously for 14 days before it can apply for production access. Yuki starts that test in week one (submit with `"track": "internal"` or a closed-test track meanwhile).

## Results

Yuki's own numbers: she was testing on her phone 30 minutes after `create-expo-app` with no Android Studio or Xcode, and magic link plus Google sign-in took about 2 hours including deep links. The schema she shipped is the Step 2 migration, not a hand-edited database.
