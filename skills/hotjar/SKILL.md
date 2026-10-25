---
name: hotjar
description: >-
  Hotjar adds heatmaps, session recordings, surveys and feedback widgets to a
  website so you can see how visitors actually use it. Covers installing the
  tracking snippet or the @hotjar/browser package, identifying users, sending
  events, SPA page changes, a CSP nonce, element suppression for privacy and
  linking sessions to Google Analytics. Use when asked to "add Hotjar", "record
  user sessions", "set up heatmaps", "trigger a Hotjar survey" or "hide
  sensitive fields from recordings".
license: Apache-2.0
compatibility: "Any website; npm package @hotjar/browser 1.0.x for bundled apps; Hotjar account and site ID required"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "hotjar, heatmaps, session-recording, user-feedback, surveys"
  repository: https://github.com/Hotjar/hotjar-js
---

# Hotjar

## Overview

Hotjar records sessions, builds heatmaps and runs surveys on a site you own. Everything is configured in the Hotjar dashboard (heatmaps, recordings, survey targeting); your code only loads the tracking script and, optionally, sends user attributes and events through the `hj` function. Tracking code version `hjsv: 6` is current in the official `@hotjar/browser` package (1.0.9). Docs: https://help.hotjar.com (the help center blocks automated fetching, so confirm dashboard wording in a browser).

## Instructions

### 1. Install the script

Find the site ID in the dashboard (Sites and organizations). Either paste the snippet into `<head>` or use the npm package.

```html
<head>
  <script>
    (function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:3841205,hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
  </script>
</head>
```

The package wraps the same snippet and is typed:

```bash
npm install @hotjar/browser
```

```typescript
// src/analytics/hotjar.ts
import Hotjar from '@hotjar/browser'

export function initHotjar() {
  const siteId = Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID)
  if (!siteId) return
  Hotjar.init(siteId, 6, { debug: false })
}
```

`Hotjar.init(siteId, 6, opts)` accepts `debug` and `nonce`. The package also exposes `identify(userId | null, attributes)`, `event(name)`, `stateChange(path)` and `isReady()`.

### 2. Next.js App Router

Initialize once on the client, in production only, so development traffic does not pollute the data.

```typescript
// components/hotjar-init.tsx
'use client'
import { useEffect } from 'react'
import Hotjar from '@hotjar/browser'

export function HotjarInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    Hotjar.init(Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID), 6)
  }, [])
  return null
}
```

Render `<HotjarInit />` inside `<body>` of `app/layout.tsx`.

### 3. Identify users and send events

```typescript
// lib/hotjar.ts
declare global {
  interface Window { hj: (...args: any[]) => void }
}

// Attributes become filters on recordings and heatmaps; values are string, number, date or boolean.
export const identify = (userId: string, attrs: Record<string, string | number | boolean>) =>
  window.hj('identify', userId, attrs)

// Events can start a recording, trigger a survey or filter sessions.
export const track = (eventName: string) => window.hj('event', eventName)

// Tags are passed as an array.
export const tagRecording = (...tags: string[]) => window.hj('tagRecording', tags)
```

Use stable, non-sensitive IDs from your own database. Do not send e-mail addresses or names as attributes unless your privacy policy and Hotjar data agreement cover it.

### 4. Surveys

Surveys are shown by the targeting rules you set in the dashboard. To show one at a precise moment, set its trigger to a Hotjar event in the survey builder and fire that event from code:

```typescript
track('checkout_completed')   // survey "Post-purchase NPS" listens to this event name
track('cancel_clicked')       // exit survey for cancellations
```

Event names must match the dashboard exactly. Do not rely on any other client call for surveys: only the event route is documented for current surveys.

### 5. Single-page apps

Hotjar listens for History API navigation on most SPAs. If a router changes content without updating the URL through the History API, tell Hotjar:

```typescript
// hooks/use-hotjar-route.ts
'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function useHotjarRoute() {
  const pathname = usePathname()
  useEffect(() => {
    if (typeof window.hj === 'function') window.hj('stateChange', pathname)
  }, [pathname])
}
```

### 6. Content Security Policy

Pass a nonce to the loader and allow Hotjar hosts. The header below is a minimal sketch: recordings also need Hotjar's connect-src, img-src and font-src hosts, so copy the complete list from Hotjar's CSP help article and test in the browser console for blocked requests.

```typescript
Hotjar.init(siteId, 6, { nonce: 'rAnD0m8f3a' })
```

```text
Content-Security-Policy: script-src *.hotjar.com 'nonce-rAnD0m8f3a'; frame-src *.hotjar.com
```

### 7. Privacy

Mark sensitive parts in your markup. `data-hj-suppress` hides the text of an element in recordings and heatmaps; `data-hj-allow` re-allows an element that a broader rule would hide.

Add the bare attribute, for example `data-hj-suppress` on the element showing a card balance, and `data-hj-allow` on a public plan name inside a suppressed section.

Hotjar suppresses keystrokes and password fields by default, and offers site-wide masking choices in the dashboard under the site's privacy settings. Check a real recording after any change instead of trusting the setting.

## Examples

### Example 1: "Add Hotjar to my Next.js shop, production only"

Install `@hotjar/browser`, add `NEXT_PUBLIC_HOTJAR_SITE_ID=3841205` to the production environment, create `components/hotjar-init.tsx` as in step 2 and render it in `app/layout.tsx`. Deploy, open the site, and the dashboard install check for the site should turn green within a few minutes. In the browser console `typeof window.hj` is `"function"`.

### Example 2: "Show a survey after checkout and tag those sessions"

In the dashboard create a survey with the trigger "Event" named `checkout_completed`. In the order-confirmation handler:

```typescript
import { identify, track, tagRecording } from '@/lib/hotjar'

identify(String(order.customerId), { plan: 'pro', orders: 3 })
tagRecording('checkout_v2')
track('checkout_completed')
```

The survey appears for that visitor once, and recordings can be filtered by the `checkout_v2` tag and the `plan` attribute.

### Example 3: "Link recordings to GA4"

Pass the GA client ID as an attribute so analysts can search recordings by it.

```typescript
const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!
window.gtag('get', gaId, 'client_id', (clientId: string) => {
  window.hj('identify', null, { ga_client_id: clientId })
})
```

Run it after both scripts have loaded (for example inside the `onLoad` of the GA script).

## Guidelines

- Load the script in production only; use a second Hotjar site for staging if you need it there.
- Hotjar is a tracking tool: ask for consent where the law requires it and start the script only after consent in those regions.
- Never put personal data in event names, tags or attributes.
- Plans limit daily sessions and survey responses; sampling is configured per site in the dashboard.
- The `hj` function queues calls made before the script finishes loading, so calling it early is safe; the npm package's `isReady()` tells you when the script is live.
- Use Hotjar to find where to look (rage clicks, dead zones); use analytics for numbers.
