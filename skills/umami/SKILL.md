---
name: umami
description: >-
  Umami is an open-source, cookie-free web analytics platform: a Google
  Analytics alternative that is self-hosted with Docker and PostgreSQL or used
  as Umami Cloud. Use when someone asks to "track website analytics", "Umami",
  "privacy-friendly analytics", "self-hosted analytics", "GDPR analytics",
  "replace Google Analytics", or "website traffic tracking without cookies".
  Covers self-hosting, the tracking script and its options, custom events,
  identifying sessions, API keys and the stats API.
license: Apache-2.0
compatibility: "Umami 3.x (checked on 3.4.0): Docker, or Node.js 18.18+ with pnpm, and PostgreSQL 12.14+ (MySQL was dropped in v3); or Umami Cloud. The tracker works on any website."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["analytics", "umami", "privacy", "tracking", "open-source"]
  repository: https://github.com/umami-software/umami
---

# Umami

## Overview

Umami is a privacy-focused web analytics platform — tracks page views, visitors, and custom events without cookies or personal data collection, so no cookie notice is needed for it. Self-hostable on your own infrastructure (one Next.js app plus PostgreSQL), or use Umami Cloud. Clean dashboard, real-time stats, and an API for programmatic access. Version 3 removed MySQL support, renamed several API values and added API keys for self-hosted installs.

## When to Use

- Need website analytics without cookie consent banners
- Want to self-host analytics on your infrastructure
- Simple, clean analytics without the complexity of GA4
- API access to analytics data for dashboards/reporting

## Instructions

### Self-Host Setup

```yaml
# compose.yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:3.4.0
    ports:
      - "127.0.0.1:${UMAMI_PORT:-3000}:3000"   # localhost only until the default password is changed and a proxy is in front
    environment:
      DATABASE_URL: postgresql://umami:${POSTGRES_PASSWORD}@db:5432/umami
      APP_SECRET: ${APP_SECRET}
    depends_on:
      db:
        condition: service_healthy
    init: true
    restart: always
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - umami-db-data:/var/lib/postgresql/data
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami -d umami"]
      interval: 5s
      timeout: 5s
      retries: 5
volumes:
  umami-db-data:
```

```bash
printf 'POSTGRES_PASSWORD=%s\nAPP_SECRET=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > .env
chmod 600 .env
docker compose up -d
curl -s http://localhost:3000/api/heartbeat     # {"ok":true} once migrations have run
```

The first start creates the tables and a login `admin` / `umami`. Sign in at `http://localhost:3000`, change that password at once, then add the site under Websites to get its website ID. Put a TLS-terminating reverse proxy in front before using it from a public site. The repository's own `docker-compose.yml` works too, but ships a placeholder `APP_SECRET` and database password that must be replaced. Without Docker: clone the repo, set `DATABASE_URL` in `.env`, then `pnpm install && pnpm build && pnpm start`.

Upgrade with `docker compose pull && docker compose up -d` after raising the image tag; after a major upgrade run `ANALYZE;` in PostgreSQL. An installation still on MySQL must migrate its data to PostgreSQL before moving to v3 (see "Migrate MySQL to PostgreSQL" in the docs).

### Add Tracking Script

```html
<!-- Add to your site's <head>; on Umami Cloud the src is https://cloud.umami.is/script.js -->
<script
  defer
  src="https://stats.northwind.dev/script.js"
  data-website-id="6fec7a5d-5da4-48c9-9d13-44b33cf0af4b"
></script>
```

```tsx
// Next.js — app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          src="https://stats.northwind.dev/script.js"
          data-website-id="6fec7a5d-5da4-48c9-9d13-44b33cf0af4b"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

Page views, including client-side navigations in single-page apps, are tracked automatically. Optional attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-domains="northwind.dev,www.northwind.dev"` | Only track on these hostnames (keeps staging and localhost out) |
| `data-host-url="https://stats.northwind.dev"` | Send data to another host than the one serving the script |
| `data-auto-pageview="false"` | No automatic page views; call `umami.track()` yourself (v3.2+) |
| `data-auto-track="false"` | Disable automatic tracking entirely; send everything with `umami.track()` |
| `data-do-not-track="true"` | Respect the browser's Do Not Track setting |
| `data-exclude-search="true"`, `data-exclude-hash="true"` | Drop query strings or hashes from recorded URLs |
| `data-tag="pricing-layout-b"` | Tag events for filtering and A/B tests |
| `data-performance="true"` | Collect Core Web Vitals (v3.1+) |
| `data-before-send="scrubPayload"` | Global function `(type, payload)` that returns the payload, or a falsy value to cancel |

### Custom Event Tracking

```typescript
// The tracker defines window.umami; it is undefined when an ad blocker stops the script
declare global {
  interface Window {
    umami?: {
      track(event?: string | object, data?: Record<string, unknown>): void;
      identify(id: string | object, data?: Record<string, unknown>): void;
    };
  }
}

// Track button clicks
document.getElementById("signup-btn")?.addEventListener("click", () => {
  window.umami?.track("signup-click", { plan: "pro", source: "header" });
});

// Attach your own ID and properties to the current session after login
window.umami?.identify("user_8f3k2", { plan: "pro", company: "Northwind" });
```

```tsx
// Declarative alternative: no JavaScript, every value is stored as a string
<button data-umami-event="pricing-click" data-umami-event-plan="pro">Choose Pro</button>
```

Use one method per element, not both: an element with `data-umami-event` does not fire its other click listeners. Event names are limited to 50 characters; event data allows strings up to 500 characters and at most 50 properties.

### API Access

Create an API key under Settings → API keys (shown once; self-hosted keys start with `umami_`) and send it as a Bearer token. Base URL: `https://stats.northwind.dev/api` when self-hosting, `https://api.umami.is/v1` on Umami Cloud (limit: 50 calls per 15 seconds per key).

```typescript
// umami-report.ts — weekly numbers from the Umami API
const UMAMI_API = process.env.UMAMI_API_URL!;
const headers = { Authorization: `Bearer ${process.env.UMAMI_API_KEY}`, Accept: "application/json" };

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${UMAMI_API}${path}?${query}`, { headers });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const websiteId = process.env.UMAMI_WEBSITE_ID!;
const endAt = Date.now();
const startAt = endAt - 7 * 24 * 60 * 60 * 1000;   // milliseconds

const stats = await get<{ pageviews: number; visitors: number; visits: number; bounces: number; totaltime: number }>(
  `/websites/${websiteId}/stats`, { startAt, endAt });
const topPages = await get<{ x: string; y: number }[]>(
  `/websites/${websiteId}/metrics`, { startAt, endAt, type: "path", limit: 5 });
const daily = await get<{ pageviews: { x: string; y: number }[]; sessions: { x: string; y: number }[] }>(
  `/websites/${websiteId}/pageviews`, { startAt, endAt, unit: "day", timezone: "Europe/Berlin" });

console.log(`${stats.visitors} visitors, ${stats.pageviews} pageviews, bounce rate ${Math.round((stats.bounces / Math.max(stats.visits, 1)) * 100)}%`);
for (const page of topPages) console.log(`${String(page.y).padStart(6)}  ${page.x}`);
console.log(daily.pageviews.map((d) => `${d.x.slice(0, 10)}=${d.y}`).join(" "));
```

- `GET /websites` lists sites and their IDs; `GET /websites/{id}/active` returns visitors in the last 5 minutes.
- `metrics` needs `type`: `path`, `entry`, `exit`, `title`, `query`, `referrer`, `domain`, `channel`, `event`, `browser`, `os`, `device`, `country`, `region`, `city`, `language`, `utmSource`, `utmCampaign` and others. The v2 value `type=url` now returns `400 Bad request`; use `path`.
- `/metrics/expanded` returns page views, visitors, visits, bounces and total time per row.
- Dates are `startAt`/`endAt` in Unix milliseconds. The API reference also lists `startDate`/`endDate` (ISO 8601), but on 3.4.0 they answered HTTP 500.
- Without an API key, `POST /api/auth/login` with a JSON body holding `username` and `password` returns a temporary `token` for the same header (self-hosted only).

Server-side events go to `POST /api/send` with no authentication, but with a real browser-like `User-Agent`; requests that look like bots are answered `{"beep":"boop"}` and not recorded:

```bash
curl -s -X POST https://stats.northwind.dev/api/send \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' \
  -d '{"type":"event","payload":{"website":"6fec7a5d-5da4-48c9-9d13-44b33cf0af4b","hostname":"docs.northwind.dev","url":"/checkout","name":"purchase","data":{"plan":"pro","revenue":49}}}'
```

## Examples

### Example 1: Add privacy-friendly analytics to a SaaS

**User prompt:** "Add analytics to our SaaS without cookies or consent banners."

Start the stack from "Self-Host Setup", then create the website and an API key from the terminal instead of the UI:

```bash
UMAMI=http://localhost:3000
TOKEN=$(curl -s -X POST $UMAMI/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$UMAMI_ADMIN_PASSWORD\"}" | jq -r .token)
curl -s -X POST $UMAMI/api/websites -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Northwind Docs","domain":"docs.northwind.dev"}' | jq '{id, name, domain}'
curl -s -X POST $UMAMI/api/me/api-keys -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"report-script"}' | jq -r .key
```

**Result:** the second call prints `{"id": "6fec7a5d-5da4-48c9-9d13-44b33cf0af4b", "name": "Northwind Docs", "domain": "docs.northwind.dev"}`; that `id` goes into `data-website-id`. The third prints the API key once (`umami_…`). After the script tag and `signup-click` events from "Custom Event Tracking" are deployed, the Events page lists `signup-click` with its `plan` property.

### Example 2: Pull the weekly numbers for a report

**User prompt:** "Pull our Umami data for the last 7 days: visitors, top pages and a daily series."

```bash
export UMAMI_API_URL=https://stats.northwind.dev/api UMAMI_WEBSITE_ID=6fec7a5d-5da4-48c9-9d13-44b33cf0af4b
node umami-report.ts        # UMAMI_API_KEY comes from the secret store; Node.js 24 runs .ts files directly
```

**Result:**

```
4415 visitors, 15171 pageviews, bounce rate 63%
  2140  /pricing
  1873  /docs/install
   962  /
2026-09-24=2011 2026-09-25=2290 2026-09-26=2154 …
```

## Guidelines

- **No cookies** — the tracker stores nothing that identifies a visitor, so Umami itself needs no cookie notice; other scripts on the page may still need one.
- **Change the defaults** — replace the `admin` / `umami` password and set a unique `APP_SECRET` before the instance is reachable from the internet. A password change invalidates existing login tokens.
- **PostgreSQL only** — v3 does not run on MySQL; use PostgreSQL 12.14 or newer and keep the database in UTC.
- **Ad blockers** — blocklists often block `script.js` and `/api/send`. Self-hosted: set `TRACKER_SCRIPT_NAME` and `COLLECT_API_ENDPOINT` to custom names, or proxy the script through the site's own domain. Always call `window.umami?.track`, never bare `umami.track`.
- **Exclude yourself** — run `localStorage.setItem('umami.disabled', 1)` in the browser console on each site; use `data-domains` to keep development hosts out.
- **`data-umami-event` attribute** — track clicks without JavaScript; use `umami.track(name, data)` when values must be numbers or booleans.
- **Keep keys server-side** — API keys and login tokens read all analytics the owner can see; never ship them in frontend code. The website ID is public by design.
- **Small script** — `script.js` is about 4.8 KB (2.3 KB gzipped) in 3.4.0; load it with `defer`.
- **Multi-site** — one instance tracks many websites; teams share access to them.
- **AI assistants** — set `MCP_ENABLED=1` to expose a read-only `/mcp` endpoint that accepts an API key.
- **When not to use** — Umami does not do ad-platform attribution, user-level marketing audiences or session stitching across devices; products built around those need a different tool.
