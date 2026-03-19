---
title: "Build a Production-Ready Progressive Web App"
description: "Convert your web app into a mobile-like PWA with offline support, push notifications, and installability. Achieve a perfect Lighthouse PWA score."
skills: [next-pwa, workbox, web-push]
difficulty: intermediate
time_estimate: "4 hours"
tags: [pwa, service-worker, offline, push-notifications, next-js, workbox, lighthouse]
---

# Build a Production-Ready Progressive Web App

**Persona:** You're a developer with a Next.js SaaS app. Users want it on their home screen, offline access to recent data, and push notifications for key events — but you don't want to ship a native app.

---

## What You'll Build

A fully installable PWA with:
- **Service worker** with cache-first and network-first strategies
- **Web App Manifest** for home screen installability
- **Offline page** + offline-first data via IndexedDB/Workbox
- **Push notifications** via Web Push API + VAPID keys
- **Install prompt** handling
- **Lighthouse PWA score: 100**

---

## Step 1: Web App Manifest

Create `public/manifest.json`:

```json
{
  "name": "My SaaS App",
  "short_name": "MySaaS",
  "description": "Your productivity app, now on mobile",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#6366f1",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/dashboard.png", "sizes": "1280x720", "type": "image/png" }
  ]
}
```

Link it in `app/layout.tsx`:

```tsx
export const metadata = {
  manifest: '/manifest.json',
  themeColor: '#6366f1',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MySaaS' },
};
```

---

## Step 2: Service Worker with Workbox

Install dependencies:

```bash
npm install next-pwa workbox-window workbox-strategies workbox-routing
```

Configure `next.config.js`:

```js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.myapp\.com\/.*$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
});

module.exports = withPWA({ /* your next config */ });
```

---

## Step 3: Offline Page

Create `app/offline/page.tsx`:

```tsx
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">You're offline</h1>
      <p className="text-gray-500 mt-2">Check your connection and try again.</p>
      <button onClick={() => window.location.reload()} className="mt-4 btn-primary">
        Retry
      </button>
    </div>
  );
}
```

---

## Step 4: Push Notifications with VAPID

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Subscribe the user (client-side):

```ts
// lib/push-subscribe.ts
export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
  // Send subscription to your backend
  await fetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Send notifications from the server:

```ts
// app/api/push/send/route.ts
import webPush from 'web-push';

webPush.setVapidDetails(
  'mailto:you@yourapp.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  const { subscription, title, body } = await req.json();
  await webPush.sendNotification(subscription, JSON.stringify({ title, body }));
  return Response.json({ ok: true });
}
```

---

## Step 5: Install Prompt

```tsx
// hooks/usePWAInstall.ts
import { useEffect, useState } from 'react';

export function usePWAInstall() {
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setPrompt(e);
    });
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setPrompt(null);
  };

  return { canInstall: !!prompt, install };
}
```

---

## Step 6: Lighthouse PWA Checklist

| Check | How |
|-------|-----|
| HTTPS | Deploy to Vercel / Cloudflare |
| Manifest linked | `<link rel="manifest">` in `<head>` |
| Service worker registered | next-pwa handles it |
| Icons: 192px + 512px | Include in manifest |
| Maskable icon | Add `"purpose": "maskable"` |
| Offline fallback | `/offline` page in SW |
| `start_url` in cache | Precached by Workbox |
| `theme_color` set | In manifest + meta tag |

Run audit: `npx lighthouse https://yourapp.com --only-categories=pwa`

---

## Key Outcomes

- App installable on Android/iOS/desktop
- Works offline with stale data
- Push notification re-engagement channel
- Lighthouse PWA: 100/100
- Zero native app store dependency
