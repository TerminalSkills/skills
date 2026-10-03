---
name: cookie-consent
description: >-
  Implement GDPR and ePrivacy-compliant cookie consent: a banner with equal Accept and Reject
  buttons, per-category choices, stored consent records, consent-gated analytics with Google
  Consent Mode v2, and Global Privacy Control. Use when adding a cookie banner, managing marketing
  consent, achieving GDPR compliance for EU users, or integrating consent with analytics platforms.
license: Apache-2.0
compatibility: "JavaScript/TypeScript. Works with React, Next.js 13+ (App Router) and vanilla JS."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["cookie-consent", "gdpr", "privacy", "eprivacy", "consent-management"]
  use-cases:
    - "Add a GDPR-compliant cookie banner to a Next.js app"
    - "Implement consent-gated Google Analytics loading"
    - "Detect and honor Global Privacy Control (GPC) signal"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cookie Consent

## Overview

The ePrivacy Directive (implemented in national law; the UK has PECR) requires prior consent before storing or reading non-essential data on a user's device, and the GDPR defines what valid consent is. GDPR fines reach EUR 20 million or 4% of global annual turnover, whichever is higher; national regulators (CNIL, the Italian Garante, the Dutch AP and others) actively fine cookie banners that make rejecting harder than accepting.

**Strictly necessary** storage needs no consent: login session, CSRF token, shopping cart, load balancing, and a preference the user explicitly set (for example a language switch they just clicked). **Everything else needs consent first**: analytics, advertising, personalization, embedded third-party media.

This skill is engineering guidance, not legal advice; have counsel check the wording and your cookie list.

| Category | Examples | Consent needed |
|----------|----------|----------------|
| Strictly necessary | Auth session, CSRF token, cart | No |
| Functional | Remembered preferences not explicitly chosen, chat widgets | Yes |
| Analytics | Google Analytics 4, Mixpanel, Hotjar | Yes |
| Marketing | Meta Pixel, Google Ads, retargeting | Yes |

## Instructions

Valid consent (GDPR Art. 4(11) and 7) is **freely given, specific, informed, unambiguous and withdrawable**. In practice:

1. Inventory every cookie, local-storage key and third-party script by category (scan with a browser's devtools or a crawler).
2. Block non-essential scripts until consent exists: no pre-ticked boxes, no "scroll means consent".
3. Show "Accept all" and "Reject all" on the first layer with equal prominence, plus "Customize".
4. Explain each category and link the privacy and cookie policies.
5. Store a consent record: version, timestamp, choices, source. Let users reopen the settings and withdraw as easily as they gave consent (a persistent "Cookie settings" link in the footer).
6. Re-ask when the policy version changes or after a fixed period (6 months is common; regulators such as the CNIL accept up to 13 months).

### Consent store (shared by everything else)

```typescript
// lib/consent.ts
export interface ConsentPreferences {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}
export interface ConsentRecord {
  version: string;
  timestamp: string;
  preferences: ConsentPreferences;
  source: 'banner' | 'settings' | 'gpc';
}

export const CONSENT_VERSION = '2026-10-01';
const KEY = 'consent_v2';

export function getConsent(): ConsentRecord | null {
  try {
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${KEY}=`));
    return raw ? JSON.parse(decodeURIComponent(raw.slice(KEY.length + 1))) : null;
  } catch {
    return null;
  }
}

export function saveConsent(preferences: ConsentPreferences, source: ConsentRecord['source']): void {
  const record: ConsentRecord = { version: CONSENT_VERSION, timestamp: new Date().toISOString(), preferences, source };
  const maxAge = 60 * 60 * 24 * 180; // 6 months
  document.cookie = `${KEY}=${encodeURIComponent(JSON.stringify(record))}; max-age=${maxAge}; path=/; SameSite=Lax; Secure`;
  void fetch('/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
    keepalive: true,
  }).catch(() => {}); // best-effort audit trail
  applyConsent(preferences);
}

export function applyConsent(p: ConsentPreferences): void {
  window.gtag?.('consent', 'update', {
    analytics_storage: p.analytics ? 'granted' : 'denied',
    ad_storage: p.marketing ? 'granted' : 'denied',
    ad_user_data: p.marketing ? 'granted' : 'denied',
    ad_personalization: p.marketing ? 'granted' : 'denied',
  });
  if (p.analytics) loadScript('ga4', `https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`);
  // marketing pixels: load only when p.marketing is true, using the same loadScript helper
}

function loadScript(id: string, src: string): void {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}
```

### Google Consent Mode v2 (default denied)

Put this inline in `<head>` before any Google tag. Since 2024, EEA advertisers using Google ads or measurement features must send all four signals (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`).

```javascript
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;
gtag('consent', 'default', {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
});
gtag('js', new Date());
gtag('config', 'G-4F7K2M9QXB');  // your GA4 measurement ID
```

GA4 does not store IP addresses, so the old `anonymize_ip` flag does nothing, and `_gid`/`_gat` are Universal Analytics cookies; GA4 sets `_ga` and `_ga_` plus the measurement ID suffix. On withdrawal, send `consent update` with `denied`, delete those cookies on your domain, and set `window['ga-disable-G-4F7K2M9QXB'] = true`.

### Banner component (React / Next.js)

```tsx
// components/CookieBanner.tsx
'use client';
import { useEffect, useState } from 'react';
import { CONSENT_VERSION, getConsent, saveConsent, applyConsent, type ConsentPreferences } from '@/lib/consent';

const NONE: ConsentPreferences = { functional: false, analytics: false, marketing: false };
const ALL: ConsentPreferences = { functional: true, analytics: true, marketing: true };

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPreferences>(NONE);

  useEffect(() => {
    const saved = getConsent();
    if (saved && saved.version === CONSENT_VERSION) applyConsent(saved.preferences);
    else if (navigator.globalPrivacyControl) saveConsent(NONE, 'gpc');
    else setOpen(true);
  }, []);

  const choose = (p: ConsentPreferences) => { saveConsent(p, 'banner'); setOpen(false); };
  if (!open) return null;

  return (
    <div role="dialog" aria-label="Cookie preferences" className="fixed inset-x-0 bottom-0 z-50 border-t bg-white p-6 shadow-lg">
      <p className="text-sm">We use cookies for analytics and marketing only with your consent. <a className="underline" href="/privacy">Privacy policy</a></p>
      {custom && (['functional', 'analytics', 'marketing'] as const).map((k) => (
        <label key={k} className="mt-2 flex gap-2 text-sm capitalize">
          <input type="checkbox" checked={prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} /> {k}
        </label>
      ))}
      <div className="mt-4 flex gap-2">
        <button className="rounded border px-4 py-2" onClick={() => choose(NONE)}>Reject all</button>
        <button className="rounded border px-4 py-2" onClick={() => (custom ? choose(prefs) : setCustom(true))}>{custom ? 'Save choices' : 'Customize'}</button>
        <button className="rounded border px-4 py-2" onClick={() => choose(ALL)}>Accept all</button>
      </div>
    </div>
  );
}
```

Give "Accept all" and "Reject all" identical styling. Mount the banner once in the root layout, and add a footer link that clears the saved record and reopens it.

### Global Privacy Control

GPC is a browser signal: `navigator.globalPrivacyControl === true` on the client and the `Sec-GPC: 1` request header on the server. It is legally an opt-out of sale and sharing in several US states (California and others), so treat it as "reject marketing" there; in the EU it is not a consent mechanism, but treating it as a rejection is the safe default (the banner above does this). Server-side detection in Next.js 16+ lives in `proxy.ts` (formerly `middleware.ts`, renamed in Next 16; a codemod exists):

```typescript
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.headers.get('sec-gpc') === '1') {
    response.cookies.set('gpc_optout', '1', { secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 180 });
  }
  return response;
}
export const config = { matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)' };
```

On Next.js 15 and earlier name the file `middleware.ts` and the function `middleware`.

### Consent record endpoint

```typescript
// app/api/consent/route.ts
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

export async function POST(req: Request) {
  const { version, timestamp, preferences, source } = await req.json();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  await db.consentRecords.create({
    consentVersion: version,
    consentedAt: timestamp,
    preferences,
    source,
    // Keep only what you can justify: a salted hash lets you match a dispute without storing the raw IP
    ipHash: createHash('sha256').update(ip + process.env.CONSENT_HASH_SALT).digest('hex'),
    userAgent: req.headers.get('user-agent'),
  });
  return new NextResponse(null, { status: 204 });
}
```

`db` is your data layer. Records are personal data: set a retention period and mention them in the privacy policy.

## CMP platforms (instead of building your own)

| Platform | Notes |
|----------|-------|
| Cookiebot (Usercentrics) | Automatic cookie scanning, Consent Mode integration |
| Usercentrics | Large EU customer base, TCF support |
| OneTrust | Enterprise suite |
| Osano, Termly, CookieYes | Smaller sites, hosted banner and policy generators |

Check current pricing on each site. If you serve ads through Google AdSense or Ad Manager to EEA or UK users, Google requires a CMP that is certified by Google and uses the IAB Transparency and Consent Framework. TCF is now v2.3: since 28 February 2026 consent strings without the `disclosedVendors` segment are invalid, so use a CMP that has upgraded.

## Examples

### Example 1: Banner and gated GA4 on Next.js

User: "Add a GDPR cookie banner to our Next.js site and make Google Analytics wait for consent."

Create `lib/consent.ts`, `components/CookieBanner.tsx` and `app/api/consent/route.ts` as above, put the Consent Mode default snippet in the root layout `<head>`, and mount `<CookieBanner />`. Verify in devtools: on first load no `_ga` cookie and no request to `googletagmanager.com/gtag/js`; after "Accept all" the script loads and `_ga` appears; after "Reject all" nothing is set.

### Example 2: Honor Global Privacy Control

User: "Respect the GPC signal from Brave and Firefox users."

Add the `navigator.globalPrivacyControl` check in the banner effect and the `proxy.ts` header check. Test with `curl -H "Sec-GPC: 1" -I http://localhost:3000/` and confirm `gpc_optout=1` is set; with the Brave browser (GPC on by default) confirm no banner appears and marketing stays denied.

## Guidelines

- Nothing non-essential may load or set cookies before consent: test with an empty profile and the network tab, not by reading the code.
- Reject must be as easy as accept; do not use dark patterns (hidden reject link, grayed button, cookie walls).
- Consent is per purpose; do not bundle categories.
- Keep the cookie list and policy in sync with what the scan finds; third-party tags added through a tag manager are the usual surprise.
- Withdrawal must work: deleting cookies alone is not enough, also stop the scripts and send the Consent Mode `denied` update.
- Embedded YouTube, maps and social widgets set cookies too; load them on click or use privacy-enhanced modes.
- US state laws (CCPA/CPRA and others) work on opt-out, not opt-in; geolocation-based banners need legal review.
- Test with the EU region really applying (use the region list in Consent Mode defaults or a test CMP configuration); do not rely on your own country's behaviour.
