---
title: "Build Mobile Push Notifications for iOS and Android"
description: "Ship push notifications for your React Native app: Expo Push, FCM, APNs, user segmentation, time-zone-aware scheduling, and campaign analytics."
skills: [expo-router]
difficulty: intermediate
time_estimate: "8 hours"
tags: [push-notifications, react-native, expo, fcm, apns, mobile, re-engagement, segmentation]
---

# Build Mobile Push Notifications for iOS and Android

Your app has 100k users. Daily actives are 18%. Push notifications, done right, can bring that to 35%+. Done wrong, users disable them on day one.

## Persona

**Kenji** is the mobile lead at a productivity app. They have 100k installs, a 20% D30 retention problem, and zero push infrastructure. He needs transactional notifications (instant) and marketing campaigns (scheduled, segmented).

---

## Architecture

```
Your backend
  ↓ Push service (Expo Push Gateway)
  ├── iOS → APNs (Apple)
  └── Android → FCM (Firebase)

Flow:
  App registers → token saved to DB
  Event triggers → backend queues notification
  Scheduler → segment users → batch send → track delivery
```

---

## Step 1: Set Up Expo Push in Your React Native App

```bash
npx expo install expo-notifications expo-device expo-constants
```

```typescript
// hooks/usePushNotifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(userId: string) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  async function registerForPushNotifications() {
    if (!Device.isDevice) return null; // Won't work on simulator

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    })).data;

    // Register token with your backend
    await fetch('https://api.yourapp.com/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, platform: Platform.OS }),
    });

    return token;
  }

  useEffect(() => {
    registerForPushNotifications().then(setExpoPushToken);

    // Handle notification when app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Handle tap on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      // Navigate to relevant screen
      if (data.screen) router.push(data.screen as string);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userId]);

  return { expoPushToken };
}
```

---

## Step 2: Backend Token Storage

```typescript
// server/push-tokens.ts
import { db } from './db'; // your database client

interface PushToken {
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  createdAt: Date;
  lastSeenAt: Date;
}

export async function registerToken(userId: string, token: string, platform: string) {
  await db.pushToken.upsert({
    where: { token },
    create: { userId, token, platform, lastSeenAt: new Date() },
    update: { userId, platform, lastSeenAt: new Date() },
  });
}

export async function getTokensForUsers(userIds: string[]): Promise<PushToken[]> {
  return db.pushToken.findMany({
    where: {
      userId: { in: userIds },
      // Skip stale tokens (not seen in 90 days)
      lastSeenAt: { gte: new Date(Date.now() - 90 * 86400_000) },
    },
  });
}
```

---

## Step 3: Send Transactional Notifications

```typescript
// server/send-push.ts
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100; // Expo's recommended batch size

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  categoryId?: string; // For actionable notifications
}

export async function sendPushNotifications(messages: PushMessage[]) {
  const results = [];

  // Process in chunks of 100
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(chunk),
    });

    const data = await response.json();
    results.push(...data.data);

    // Handle errors: remove invalid tokens
    for (const ticket of data.data) {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        await db.pushToken.delete({ where: { token: ticket.details.expoPushToken } });
      }
    }
  }

  return results;
}

// Transactional: send immediately on event
export async function notifyUser(userId: string, notification: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const tokens = await getTokensForUsers([userId]);

  await sendPushNotifications(
    tokens.map(t => ({ to: t.token, ...notification }))
  );
}
```

---

## Step 4: User Segmentation

```typescript
// server/segments.ts
export async function getUserSegment(criteria: {
  plan?: 'free' | 'pro' | 'enterprise';
  lastActiveAfter?: Date;
  lastActiveBefore?: Date;
  hasFeature?: string;
  locale?: string;
}): Promise<string[]> {
  const where: Record<string, unknown> = {};

  if (criteria.plan) where.plan = criteria.plan;
  if (criteria.locale) where.locale = criteria.locale;
  if (criteria.lastActiveAfter || criteria.lastActiveBefore) {
    where.lastActiveAt = {
      ...(criteria.lastActiveAfter ? { gte: criteria.lastActiveAfter } : {}),
      ...(criteria.lastActiveBefore ? { lte: criteria.lastActiveBefore } : {}),
    };
  }

  const users = await db.user.findMany({
    where,
    select: { id: true },
  });

  return users.map(u => u.id);
}

// Example: re-engage users who haven't opened in 7 days
const dormantUserIds = await getUserSegment({
  lastActiveBefore: new Date(Date.now() - 7 * 86400_000),
  lastActiveAfter: new Date(Date.now() - 30 * 86400_000),
});
```

---

## Step 5: Time-Zone-Aware Scheduled Campaigns

```typescript
// server/campaigns.ts
import { CronJob } from 'cron';

interface Campaign {
  id: string;
  title: string;
  body: string;
  segment: Record<string, unknown>;
  scheduleHour: number;   // Local hour (e.g., 10 for 10 AM)
  scheduleMinute: number;
  data?: Record<string, unknown>;
}

// Run every hour, send to users in timezones where it's now the target hour
new CronJob('0 * * * *', async () => {
  const now = new Date();
  const campaigns = await db.campaign.findMany({
    where: { status: 'active', scheduleHour: now.getUTCHours() }
  });

  for (const campaign of campaigns) {
    // Get users in timezones where local hour matches
    const users = await db.user.findMany({
      where: {
        ...campaign.segment,
        // Filter by timezone offset so local time = campaign time
        timezoneOffset: now.getUTCHours() - campaign.scheduleHour,
      },
      select: { id: true },
    });

    const userIds = users.map(u => u.id);
    const tokens = await getTokensForUsers(userIds);

    await sendPushNotifications(
      tokens.map(t => ({
        to: t.token,
        title: campaign.title,
        body: campaign.body,
        data: campaign.data,
      }))
    );

    // Track campaign delivery
    await db.campaignDelivery.createMany({
      data: userIds.map(userId => ({
        campaignId: campaign.id,
        userId,
        sentAt: new Date(),
      })),
    });
  }
}).start();
```

---

## Step 6: Delivery Analytics

```typescript
// Track opens via deep link on notification tap
// In your app's notification response handler:
await fetch('https://api.yourapp.com/push/opened', {
  method: 'POST',
  body: JSON.stringify({
    campaignId: response.notification.request.content.data.campaignId,
    userId: currentUser.id,
  }),
});

// Analytics query
export async function getCampaignStats(campaignId: string) {
  const [delivered, opened] = await Promise.all([
    db.campaignDelivery.count({ where: { campaignId } }),
    db.campaignDelivery.count({ where: { campaignId, openedAt: { not: null } } }),
  ]);

  return {
    delivered,
    opened,
    openRate: delivered > 0 ? (opened / delivered * 100).toFixed(1) + '%' : '0%',
  };
}
```

---

## Results

Kenji shipped push in a week. D30 retention went from 20% → 34% in 8 weeks. The weekly "you haven't logged in" re-engagement campaign alone recovered 12% of dormant users.

> "We were sending emails nobody opened. Push with proper segmentation changed everything." — Kenji
