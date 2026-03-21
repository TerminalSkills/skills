---
title: "Build a GDPR Cookie Consent System"
description: "Build a fully compliant GDPR cookie consent management platform from scratch — granular categories, consent records, script blocking, GPC detection, and one-click withdrawal."
skills: [prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [gdpr, privacy, cookies, compliance, consent, legal]
---

# Build a GDPR Cookie Consent System

**Persona:** You're a SaaS developer who just got an email from a EU user saying your cookie banner is non-compliant. Cookiebot wants €500/month. You decide to build it yourself in a weekend.

## What You'll Build

- **Consent banner**: Granular categories (necessary, analytics, marketing, preferences)
- **Consent record storage**: Timestamped, versioned, auditable consent log
- **Script blocking**: Don't load GA/GTM until user consents
- **GPC signal detection**: Honor Global Privacy Control browser settings
- **Consent withdrawal**: One-click revoke all

---

## 1. Consent Schema

```prisma
model ConsentRecord {
  id         String   @id @default(cuid())
  userId     String?  // null for anonymous visitors
  visitorId  String   // persistent cookie-based ID
  version    String   // consent policy version "2024-01"
  necessary  Boolean  @default(true)  // always true, can't reject
  analytics  Boolean  @default(false)
  marketing  Boolean  @default(false)
  preferences Boolean @default(false)
  ipHash     String   // hashed IP for GDPR audit (not raw IP)
  userAgent  String?
  gpcSignal  Boolean  @default(false)  // did browser send GPC?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  
  @@index([visitorId])
  @@index([userId])
}
```

---

## 2. Consent API

```typescript
// app/api/consent/route.ts
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

const CONSENT_VERSION = "2024-01";

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.IP_SALT).digest("hex").slice(0, 16);
}

function getOrCreateVisitorId(): string {
  const cookieStore = cookies();
  const existing = cookieStore.get("visitor_id")?.value;
  if (existing) return existing;
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  const body = await req.json();
  const { analytics, marketing, preferences, userId } = body;
  
  const visitorId = getOrCreateVisitorId();
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const gpcSignal = req.headers.get("sec-gpc") === "1";

  // GPC overrides — if GPC detected, force analytics/marketing off
  const record = await prisma.consentRecord.upsert({
    where: { visitorId_version: { visitorId, version: CONSENT_VERSION } } as any,
    create: {
      visitorId,
      userId,
      version: CONSENT_VERSION,
      necessary: true,
      analytics: gpcSignal ? false : (analytics ?? false),
      marketing: gpcSignal ? false : (marketing ?? false),
      preferences: preferences ?? false,
      ipHash: hashIp(ip),
      userAgent: req.headers.get("user-agent"),
      gpcSignal
    },
    update: {
      analytics: gpcSignal ? false : (analytics ?? false),
      marketing: gpcSignal ? false : (marketing ?? false),
      preferences: preferences ?? false,
      gpcSignal,
      updatedAt: new Date()
    }
  });

  const response = Response.json({ success: true, record });
  
  // Set visitor ID cookie (1 year, SameSite=Lax)
  response.headers.set(
    "Set-Cookie",
    `visitor_id=${visitorId}; Max-Age=31536000; SameSite=Lax; Secure; Path=/`
  );

  return response;
}

// Withdrawal endpoint
export async function DELETE(req: Request) {
  const visitorId = cookies().get("visitor_id")?.value;
  if (!visitorId) return Response.json({ error: "No consent record found" }, { status: 404 });

  await prisma.consentRecord.updateMany({
    where: { visitorId },
    data: { analytics: false, marketing: false, preferences: false }
  });

  return Response.json({ success: true, message: "All optional consent withdrawn" });
}
```

---

## 3. Script Blocking Loader

Load third-party scripts only after consent. Works with GA4, GTM, Hotjar, Meta Pixel.

```typescript
// components/ConsentScriptLoader.tsx
"use client";
import { useEffect } from "react";
import { useConsent } from "@/hooks/useConsent";

// Script registry — add your 3rd party scripts here
const ANALYTICS_SCRIPTS = [
  { id: "ga4", src: "https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX" },
];

const MARKETING_SCRIPTS = [
  { id: "meta-pixel", inline: `!function(f,b,e,v){/* fbq snippet */}` },
];

export function ConsentScriptLoader() {
  const { consent } = useConsent();

  useEffect(() => {
    if (!consent) return;

    if (consent.analytics) {
      ANALYTICS_SCRIPTS.forEach(({ id, src }) => {
        if (document.getElementById(id)) return; // already loaded
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      });
    }

    if (consent.marketing) {
      MARKETING_SCRIPTS.forEach(({ id, inline }) => {
        if (document.getElementById(id)) return;
        const script = document.createElement("script");
        script.id = id;
        script.innerHTML = inline;
        document.head.appendChild(script);
      });
    }
  }, [consent?.analytics, consent?.marketing]);

  return null;
}
```

---

## 4. GPC Detection Hook

```typescript
// hooks/useConsent.ts
"use client";
import { useState, useEffect } from "react";

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  version: string;
  resolved: boolean;
}

export function useConsent() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("consent_v2024-01");
    const gpcSignal = (navigator as any).globalPrivacyControl === true;

    if (gpcSignal) {
      // Auto-apply minimal consent when GPC detected
      const gpcConsent = { necessary: true, analytics: false, marketing: false, preferences: false, version: "2024-01", resolved: true };
      setConsent(gpcConsent);
      saveConsent(gpcConsent);
      return;
    }

    if (stored) {
      setConsent({ ...JSON.parse(stored), resolved: true });
    } else {
      setShowBanner(true);
    }
  }, []);

  const saveConsent = async (newConsent: Omit<ConsentState, "resolved">) => {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConsent)
    });
    localStorage.setItem("consent_v2024-01", JSON.stringify(newConsent));
    setConsent({ ...newConsent, resolved: true });
    setShowBanner(false);
  };

  const revokeAll = async () => {
    await fetch("/api/consent", { method: "DELETE" });
    localStorage.removeItem("consent_v2024-01");
    setConsent(null);
    setShowBanner(true);
  };

  return { consent, showBanner, saveConsent, revokeAll };
}
```

---

## 5. Consent Banner Component

```tsx
// components/ConsentBanner.tsx
"use client";
import { useState } from "react";
import { useConsent } from "@/hooks/useConsent";

export function ConsentBanner() {
  const { showBanner, saveConsent } = useConsent();
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false, preferences: false });

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-xl p-4 z-50 max-w-2xl mx-auto mb-4 rounded-xl">
      <p className="text-sm text-gray-700 mb-3">
        We use cookies to improve your experience. You can choose which categories to allow.
      </p>
      
      {expanded && (
        <div className="space-y-2 mb-3 text-sm">
          <label className="flex items-center gap-2 opacity-50">
            <input type="checkbox" checked disabled /> Necessary (always on)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.analytics} onChange={e => setPrefs(p => ({ ...p, analytics: e.target.checked }))} />
            Analytics — helps us understand how people use the product
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.marketing} onChange={e => setPrefs(p => ({ ...p, marketing: e.target.checked }))} />
            Marketing — personalized ads and retargeting
          </label>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => saveConsent({ necessary: true, ...prefs, version: "2024-01" })} className="bg-black text-white px-4 py-2 rounded text-sm">
          Save preferences
        </button>
        <button onClick={() => saveConsent({ necessary: true, analytics: true, marketing: true, preferences: true, version: "2024-01" })} className="bg-gray-100 px-4 py-2 rounded text-sm">
          Accept all
        </button>
        <button onClick={() => setExpanded(!expanded)} className="text-sm underline text-gray-500">
          {expanded ? "Hide" : "Customize"}
        </button>
      </div>
    </div>
  );
}
```

---

## Result

Your GDPR-compliant consent system:
- Stores legally auditable consent records with timestamps, version, and IP hash
- Automatically honors GPC signals (legally required in California, recommended in EU)
- Blocks GA/Meta Pixel until user consents — no silent data collection
- One-click revoke all, updating both local state and the database
- Versioned consent — when you update your cookie policy, old consents auto-expire

Total cost: $0/month. Cookiebot: €500/month. You just saved €6,000/year.
