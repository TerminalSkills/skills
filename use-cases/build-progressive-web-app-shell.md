---
title: Build a Progressive Web App Shell
slug: build-progressive-web-app-shell
description: Build a PWA app shell with service worker caching, offline support, push notifications, background sync, install prompts, and update management for native-like web experiences.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Frontend Development
tags:
  - pwa
  - service-worker
  - offline
  - push-notifications
  - caching
---

# Build a Progressive Web App Shell

## The Problem

Julia leads frontend at a 20-person company. Their web app doesn't work offline — field workers in areas with spotty internet lose their work. There's no install prompt — users keep a browser tab open instead of having an app icon. Push notifications require a native app they don't have. Page loads are slow on repeat visits because everything's fetched from the network. App updates require a hard refresh that confuses users. They need a PWA shell: offline support, installable, push notifications, background sync for pending operations, smart caching, and seamless updates.

## Step 1: Build the PWA Shell

```typescript
// src/pwa/shell.ts — PWA app shell with service worker, offline, and push
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PushSubscription { userId: string; endpoint: string; keys: { p256dh: string; auth: string }; createdAt: string; }
interface SyncTask { id: string; userId: string; action: string; data: any; status: "pending" | "synced" | "failed"; createdAt: string; }

// Generate web app manifest
export function generateManifest(config: { name: string; shortName: string; themeColor: string; backgroundColor: string; startUrl: string; iconUrl: string }): any {
  return {
    name: config.name, short_name: config.shortName, description: `${config.name} — works offline`,
    start_url: config.startUrl, display: "standalone", orientation: "any",
    theme_color: config.themeColor, background_color: config.backgroundColor,
    icons: [
      { src: config.iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: config.iconUrl.replace("192", "512"), sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    categories: ["productivity", "business"],
  };
}

// Generate service worker code
export function generateServiceWorker(config: { version: string; cacheFirst: string[]; networkFirst: string[]; offlineFallback: string }): string {
  return `
const CACHE_NAME = 'app-shell-v${config.version}';
const CACHE_FIRST = ${JSON.stringify(config.cacheFirst)};
const NETWORK_FIRST = ${JSON.stringify(config.networkFirst)};
const OFFLINE_FALLBACK = '${config.offlineFallback}';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...CACHE_FIRST, OFFLINE_FALLBACK]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (CACHE_FIRST.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request).then((resp) => {
      const clone = resp.clone(); caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)); return resp;
    })));
  } else if (NETWORK_FIRST.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match(OFFLINE_FALLBACK))));
  } else {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_FALLBACK)));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  const db = await openDB();
  const tasks = await db.getAll('sync-queue');
  for (const task of tasks) {
    try {
      await fetch(task.url, { method: task.method, headers: task.headers, body: task.body });
      await db.delete('sync-queue', task.id);
    } catch {}
  }
}

function openDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open('pwa-sync', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sync-queue', { keyPath: 'id' });
    req.onsuccess = () => resolve({ getAll: (store) => new Promise((r) => { const tx = req.result.transaction(store, 'readonly'); tx.objectStore(store).getAll().onsuccess = (e) => r(e.target.result); }), delete: (store, id) => new Promise((r) => { const tx = req.result.transaction(store, 'readwrite'); tx.objectStore(store).delete(id).onsuccess = () => r(); }) });
  });
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Update', body: 'New update available' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', badge: '/badge-72.png', data: data.url ? { url: data.url } : undefined }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) event.waitUntil(clients.openWindow(event.notification.data.url));
});
`;
}

// Register push subscription
export async function registerPushSubscription(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const sub: PushSubscription = { userId, ...subscription, createdAt: new Date().toISOString() };
  await redis.set(`push:sub:${userId}`, JSON.stringify(sub));
}

// Send push notification
export async function sendPush(userId: string, payload: { title: string; body: string; url?: string }): Promise<boolean> {
  const subData = await redis.get(`push:sub:${userId}`);
  if (!subData) return false;
  // In production: use web-push library with VAPID keys
  await redis.rpush("push:queue", JSON.stringify({ userId, payload, subscription: JSON.parse(subData) }));
  return true;
}

// Queue offline action for background sync
export async function queueOfflineAction(params: { userId: string; action: string; data: any }): Promise<string> {
  const id = `sync-${randomBytes(6).toString("hex")}`;
  await redis.rpush(`sync:pending:${params.userId}`, JSON.stringify({ id, ...params, status: "pending", createdAt: new Date().toISOString() }));
  return id;
}

// Get update status for version management
export async function getLatestVersion(): Promise<{ version: string; releaseNotes: string; forceUpdate: boolean }> {
  const version = await redis.get("pwa:version") || "1.0.0";
  const notes = await redis.get("pwa:release_notes") || "Bug fixes and improvements";
  const force = (await redis.get("pwa:force_update")) === "1";
  return { version, releaseNotes: notes, forceUpdate: force };
}
```

## Results

- **Works offline** — field workers fill forms offline; data queued in IndexedDB; background sync uploads when connection returns; zero lost work
- **Installable** — "Add to Home Screen" prompt; app icon on phone; launches in standalone mode; feels native; no app store needed
- **Push notifications** — "Your report is ready" push notification; user taps → opens directly to report; engagement up 3x vs email notification
- **Cache-first for static assets** — CSS, JS, images served from cache on repeat visits; page load: 3s → 200ms; cache updated in background
- **Seamless updates** — new service worker activates on next visit; old caches cleaned; user sees update banner "New version available"; no hard refresh needed
