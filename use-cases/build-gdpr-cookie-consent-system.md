---
title: "Build a GDPR Cookie Consent System"
description: "Build a GDPR and ePrivacy cookie consent system with equal accept and reject buttons, an append-only consent log, consent-gated scripts with Google Consent Mode v2, GPC handling and easy withdrawal."
skills: [prisma, cookie-consent, gdpr-compliance]
difficulty: intermediate
time_estimate: "6 hours"
tags: [gdpr, privacy, cookies, compliance, consent, legal]
---

# Build a GDPR Cookie Consent System

**Persona:** You're a SaaS developer who just got an email from an EU user saying your cookie banner is non-compliant. A hosted consent platform is one option, but you want the consent flow and its audit trail inside your own Next.js app.

This is engineering guidance, not legal advice. Have counsel review the banner wording, your cookie list and the retention period.

## The Rules the Design Follows

- Consent must be freely given, specific, informed and unambiguous (GDPR Art. 4(11)), and withdrawing must be as easy as giving it (Art. 7(3)): hence a Reject button beside Accept, no pre-ticked boxes, and a footer link to reopen the settings. Non-essential storage and scripts need consent first (ePrivacy Directive).
- GPC is sent as the `Sec-GPC: 1` header and exposed as `navigator.globalPrivacyControl`. California's CCPA rules require businesses to honor it as an opt-out of sale or sharing; in the EU it is not the consent mechanism, so the banner still asks. Forcing marketing off is a conservative choice.
- Keep the log minimal: random visitor ID, choices, policy version, keyed IP hash. No raw IP.

## 1. Consent Schema (Prisma 7)

Prisma 7 is the stable line (Prisma 8 is a release candidate). It uses the `prisma-client` generator with an explicit output path and a driver adapter, and 7.10 reads its config from `prisma7.config.ts`.

Install with `npm install @prisma/client@7 @prisma/adapter-pg` and `npm install -D prisma@7`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
datasource db {
  provider = "postgresql"
}

// Append-only log: every choice and every withdrawal is a new row.
model ConsentEvent {
  id          String   @id @default(cuid())
  visitorId   String   // random ID from an HttpOnly cookie, not a user profile
  version     String   // policy version the visitor saw, e.g. "2026-10-01"
  analytics   Boolean  @default(false)
  marketing   Boolean  @default(false)
  preferences Boolean  @default(false)
  source      String   // "banner" | "settings" | "withdrawal"
  gpc         Boolean  @default(false)
  ipHash      String?  // HMAC of the IP, never the raw address
  createdAt   DateTime @default(now())
  @@index([visitorId, createdAt])
}
```

Create `prisma7.config.ts` with `defineConfig({ schema: "prisma/schema.prisma", datasource: { url: process.env["DATABASE_URL"] } })` from `prisma/config`, and `lib/prisma.ts` exporting `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })` (imports: `PrismaPg` from `@prisma/adapter-pg`, `PrismaClient` from `../generated/prisma/client`).

Run `export DATABASE_URL=...` and `npx prisma migrate dev` against your own Postgres, and set `IP_SALT` to a long random secret.

## 2. Shared Consent Helpers

The browser cookie is what gates scripts; the database row is the audit trail. A stored choice from an older `CONSENT_VERSION` is ignored, so visitors are asked again after you change the policy.

```typescript
// lib/consent.ts
export const CONSENT_VERSION = "2026-10-01";
export const COOKIE = "consent_v1";
const MAX_AGE = 60 * 60 * 24 * 180; // ask again after 6 months

export interface Prefs { analytics: boolean; marketing: boolean; preferences: boolean }
export interface Stored extends Prefs { version: string }
export type Source = "banner" | "settings" | "withdrawal";

export const NONE: Prefs = { analytics: false, marketing: false, preferences: false };
export const ALL: Prefs = { analytics: true, marketing: true, preferences: true };
declare global {
  interface Window { dataLayer: unknown[]; gtag: (...args: unknown[]) => void }
}

export function readStored(): Stored | null {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(COOKIE + "="));
    if (!raw) return null;
    const v = JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1))) as Stored;
    return v.version === CONSENT_VERSION ? v : null; // new policy version: ask again
  } catch {
    return null;
  }
}

export function writeStored(p: Prefs) {
  const v: Stored = { ...p, version: CONSENT_VERSION };
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(v))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`;
}

export async function logConsent(p: Prefs, source: Source) {
  await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, source, version: CONSENT_VERSION }),
    keepalive: true,
  }).catch(() => {}); // the browser cookie is the source of truth for gating
}
const sig = (a: boolean, m: boolean) => {
  const g = (b: boolean) => (b ? "granted" : "denied");
  return { analytics_storage: g(a), ad_storage: g(m), ad_user_data: g(m), ad_personalization: g(m) };
};

export const gpcOn = () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

// Google Consent Mode v2: all four signals start denied; the GA4 script is only
// added once analytics is granted.
export function applyConsent(p: Prefs) {
  if (!window.dataLayer) {
    window.dataLayer = [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", sig(false, false));
  }
  window.gtag("consent", "update", sig(p.analytics, p.marketing));
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (p.analytics && id && !document.getElementById("ga4")) {
    const s = document.createElement("script");
    s.id = "ga4";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", id);
  }
}
```

## 3. Consent API

`cookies()` is async in current Next.js. The visitor ID is HttpOnly and random, and GPC is read from the request header on the server, so the client cannot talk the server out of it.

```typescript
// app/api/consent/route.ts
import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
const VERSION = "2026-10-01";
const SOURCES = ["banner", "settings", "withdrawal"];

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !SOURCES.includes(b.source) || b.version !== VERSION) {
    return Response.json({ error: "invalid consent payload" }, { status: 400 });
  }
  const jar = await cookies(); // async since Next 15
  const visitorId = jar.get("visitor_id")?.value ?? randomUUID();
  jar.set("visitor_id", visitorId, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  const gpc = req.headers.get("sec-gpc") === "1";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  await prisma.consentEvent.create({
    data: {
      visitorId,
      version: VERSION,
      analytics: b.analytics === true,
      marketing: gpc ? false : b.marketing === true, // GPC opts out of sale/sharing
      preferences: b.preferences === true,
      source: b.source,
      gpc,
      ipHash: ip ? createHmac("sha256", process.env.IP_SALT!).update(ip).digest("hex") : null,
    },
  });
  return Response.json({ ok: true });
}
```

## 4. Provider With GPC and Withdrawal

One provider holds the state, so the banner, the footer link and the script gating all see the same choice. Scripts that are already running cannot be unloaded, so a withdrawal removes the `_ga` cookies and reloads the page.

```tsx
// components/ConsentProvider.tsx
"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ALL, NONE, applyConsent, gpcOn, logConsent, readStored, writeStored, type Prefs, type Source } from "@/lib/consent";
interface Ctx {
  prefs: Prefs | null;      // null until the visitor has chosen
  open: boolean;            // banner / settings panel visible
  setOpen: (v: boolean) => void;
  choose: (p: Prefs, source?: Source) => void;
  rejectAll: () => void;
  acceptAll: () => void;
}
const ConsentCtx = createContext<Ctx | null>(null);
export const useConsent = () => {
  const c = useContext(ConsentCtx);
  if (!c) throw new Error("wrap the app in <ConsentProvider>");
  return c;
};

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      const p = gpcOn() ? { ...stored, marketing: false } : stored; // GPC wins over an old "accept all"
      setPrefs(p);
      applyConsent(p);
    } else {
      setOpen(true);
    }
  }, []);
  function choose(p: Prefs, source: Source = "banner") {
    const final = gpcOn() ? { ...p, marketing: false } : p;
    const withdrew = prefs && (prefs.analytics || prefs.marketing) && !final.analytics && !final.marketing;
    writeStored(final);
    void logConsent(final, source);
    setPrefs(final);
    setOpen(false);
    if (withdrew) {
      // Loaded scripts cannot be unloaded: expire the GA cookies (set on the parent domain too) and reload.
      const parts = location.hostname.split(".");
      const domains = ["", ...parts.slice(0, -1).map((_, i) => `; Domain=${parts.slice(i).join(".")}`)];
      document.cookie.split("; ").map((c) => c.split("=")[0]).filter((n) => n === "_ga" || n.startsWith("_ga_"))
        .forEach((n) => domains.forEach((d) => (document.cookie = `${n}=; Max-Age=0; Path=/${d}`)));
      location.reload();
    } else {
      applyConsent(final);
    }
  }
  return (
    <ConsentCtx.Provider value={{ prefs, open, setOpen, choose,
      rejectAll: () => choose(NONE, prefs ? "withdrawal" : "banner"), acceptAll: () => choose(ALL) }}>
      {children}
    </ConsentCtx.Provider>
  );
}
```

Wrap `app/layout.tsx` children in `<ConsentProvider>` and render `<ConsentBanner />` inside it.

## 5. Banner and Footer Link

```tsx
// components/ConsentBanner.tsx
"use client";
import { useState } from "react";
import { useConsent } from "./ConsentProvider";

export function ConsentBanner() {
  const { open, prefs, choose, acceptAll, rejectAll } = useConsent();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(prefs ?? { analytics: false, marketing: false, preferences: false });
  if (!open) return null;
  const btn = "rounded border px-4 py-2 text-sm font-medium"; // identical style for accept and reject
  return (
    <div role="dialog" aria-label="Cookie settings" className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 max-w-2xl rounded-xl border bg-white p-4 shadow-xl">
      <p className="mb-3 text-sm">
        We use optional cookies for analytics and marketing only if you agree. Necessary cookies are always on.
        See our <a className="underline" href="/cookies">cookie policy</a>.
      </p>
      {custom && (
        <div className="mb-3 space-y-2 text-sm">
          <label className="flex gap-2"><input type="checkbox" checked disabled /> Necessary (always on)</label>
          {(["analytics", "marketing", "preferences"] as const).map((k) => (
            <label key={k} className="flex gap-2">
              <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
              {k[0].toUpperCase() + k.slice(1)}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={acceptAll}>Accept all</button>
        <button className={btn} onClick={rejectAll}>Reject all</button>
        {custom
          ? <button className={btn} onClick={() => choose(draft, prefs ? "settings" : "banner")}>Save choices</button>
          : <button className={btn} onClick={() => setCustom(true)}>Customize</button>}
      </div>
    </div>
  );
}

// Put this in the footer so withdrawing is as easy as consenting.
export function CookieSettingsLink() {
  const { setOpen } = useConsent();
  return <button className="underline" onClick={() => setOpen(true)}>Cookie settings</button>;
}
```

## 6. Retention

The consent log is personal data too. Decide how long you need it as proof of consent, state that period in your privacy policy, and delete older rows on a schedule (`prisma.consentEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })` from a daily job).

## Verify It

In a fresh private window, the network tab must show no request to `googletagmanager.com` and no `_ga` cookie before you choose. "Reject all" adds one `consentEvent` row with all flags false and still loads nothing. Accepting analytics from "Cookie settings" loads `gtag/js`; rejecting again reloads the page and clears `_ga`. With GPC on, "Accept all" stores `marketing = false`, `gpc = true`. Bumping `CONSENT_VERSION` (client and route) shows the banner again.

Result: an append-only, versioned consent log with a keyed IP hash, equal-weight accept and reject, one-click withdrawal, no Google tag before consent, and the four Consent Mode v2 signals (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`) following the visitor's choice.

## Related Skills

- [prisma](/skills/prisma) - schema, adapter and migrations for the consent log
- [cookie-consent](/skills/cookie-consent) - banner rules, Consent Mode v2 and GPC details
- [gdpr-compliance](/skills/gdpr-compliance) - retention, PII audit and data subject requests around the log
