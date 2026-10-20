---
name: plausible
category: data-ai
version: 1.1.0
description: >-
  Plausible is a privacy-first, cookie-free web analytics service that you can
  self-host (Community Edition) or use as Plausible Cloud. Covers the tracking
  snippet, custom event goals, the Next.js integration, a first-party proxy,
  self-hosting with Docker Compose and the Stats API v2. Use when the user wants
  website analytics without cookie banners, a Google Analytics replacement, or
  traffic data pulled through an API.
author: terminal-skills
tags: [plausible, analytics, privacy, web-analytics, gdpr, self-hosted]
license: Apache-2.0
compatibility: 'platform: linux, platform: macos, platform: windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags: [plausible, analytics, privacy, web-analytics, gdpr]
  repository: https://github.com/plausible/analytics
---

# Plausible Analytics

## Overview

Plausible is an open-source, cookie-free web analytics tool. It collects no personal data, so most sites need no consent banner. It runs as a hosted service (Plausible Cloud, plausible.io) or as the self-hosted Community Edition (CE, backed by ClickHouse and PostgreSQL).

Two things changed since older tutorials. The tracking snippet is now a per-site script `pa-XXXXX.js` initialised with `plausible.init()`; the old `data-domain` scripts with extension filenames such as `script.hash.outbound-links.js` are legacy. The Stats API is `POST /api/v2/query`; the `GET /api/v1/stats/*` endpoints in old guides belong to the previous generation. On Cloud, custom properties, revenue tracking and the Stats API need the Business plan; CE includes them.

## Instructions

### 1. Install the snippet

Add the site in Plausible, then copy the snippet from Site settings, General, Tracking, Site installation. The `pa-` id is unique to your site, so never invent one. On CE the script is served from your own `BASE_URL`.

```html
<!-- index.html, inside <head> -->
<script async src="https://plausible.io/js/pa-Xq3mB7vLk2.js"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>
```

Outbound links, file downloads and form submissions are switched on in the site settings (Default tracking) and need no snippet change. Options that live in the snippet go to `plausible.init({...})`: `hashBasedRouting`, `customProperties`, `endpoint`, `captureOnLocalhost` (off by default, so nothing is recorded on localhost), `autoCapturePageviews`, `transformRequest`.

For bundled apps use the npm package `@plausible-analytics/tracker` (the old `plausible-tracker` is archived). It works only in the browser, so call it from client code:

```bash
npm install @plausible-analytics/tracker
```

```javascript
// src/analytics.js
import { init, track } from '@plausible-analytics/tracker'

init({ domain: 'bluefinbikes.com' })   // SPA pageviews are captured automatically
track('Signup', { props: { tier: 'startup' } })
```

### 2. Custom events and goals

An event shows in the dashboard only after you create a goal with the same name (Site settings, Goals, Add goal, Custom event).

Without JavaScript, add a CSS class to the element; a space in the name is written `+`:

```html
<button class="plausible-event-name=Newsletter+Signup">Subscribe</button>
```

From JavaScript, with the snippet installed:

```javascript
plausible('Purchase', {
  props: { plan: 'pro' },                          // custom properties
  revenue: { amount: 49.0, currency: 'USD' },      // needs a revenue goal
})
```

Never put personal data (emails, names, user ids) into properties; individual values cannot be deleted later.

### 3. Next.js

`next-plausible` 4.x takes the script URL from the dashboard (earlier versions took `domain`):

```tsx
// app/layout.tsx
import PlausibleProvider from 'next-plausible'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PlausibleProvider src="https://plausible.io/js/pa-Xq3mB7vLk2.js">
          {children}
        </PlausibleProvider>
      </body>
    </html>
  )
}
```

```tsx
// components/pricing-button.tsx
'use client'
import { usePlausible } from 'next-plausible'

type Events = { 'Plan Selected': { plan: string; price: number } }

export function PricingButton({ plan, price }: { plan: string; price: number }) {
  const plausible = usePlausible<Events>()
  return <button onClick={() => plausible('Plan Selected', { props: { plan, price } })}>Choose {plan}</button>
}
```

The provider renders the script only in production builds. To proxy through your own domain, wrap the config in `next.config.js`: `module.exports = withPlausibleProxy({ src: 'https://plausible.io/js/pa-Xq3mB7vLk2.js' })({})` (imported from `next-plausible`; works with `next start`, not with a static export).

### 4. Stats API v2

Create a Stats API key in account settings, API Keys. A key is scoped to one team and limited to 600 requests per hour. Send a JSON query; `site_id` is the domain as added in Plausible, and the host is plausible.io or your CE `BASE_URL`.

```python
# plausible_api.py
import os
import requests

HOST = os.environ.get('PLAUSIBLE_HOST', 'https://plausible.io')
SITE_ID = 'bluefinbikes.com'
HEADERS = {'Authorization': f"Bearer {os.environ['PLAUSIBLE_API_KEY']}"}

def query(**body):
    r = requests.post(f'{HOST}/api/v2/query', headers=HEADERS,
                      json={'site_id': SITE_ID, **body}, timeout=30)
    r.raise_for_status()
    return r.json()['results']

# aggregate: one row, metrics in the order requested
totals = query(metrics=['visitors', 'pageviews', 'bounce_rate', 'visit_duration'], date_range='30d')

# breakdown: add dimensions; each row has "dimensions" and "metrics"
top_pages = query(metrics=['visitors', 'pageviews'], dimensions=['event:page'],
                  date_range='30d', order_by=[['visitors', 'desc']],
                  pagination={'limit': 10})

# filters are [operator, dimension, values]
sources = query(metrics=['visitors'], dimensions=['visit:source'], date_range='7d',
                filters=[['is', 'visit:country_name', ['Germany']]])
```

A result row looks like `{"metrics": [1420, 3310], "dimensions": ["/pricing"]}`. Dimensions such as `time:day` give a timeseries. The metric `percentage` requires non-empty dimensions, and `time_on_page` requires an `event:page` dimension or filter.

### 5. Proxy through your domain

Ad blockers drop some requests to plausible.io. Serve the script and the event endpoint from your own domain. Nginx fragment (use the `pa-` URL from your snippet):

```nginx
# inside the server block for bluefinbikes.com
resolver 9.9.9.9;   # needed because proxy_pass uses variables
set $plausible_script_url https://plausible.io/js/pa-Xq3mB7vLk2.js;
set $plausible_event_url  https://plausible.io/api/event;

location = /js/script.js {
    proxy_pass $plausible_script_url;
    proxy_set_header Host plausible.io;
}
location = /api/event {
    proxy_pass $plausible_event_url;
    proxy_set_header Host plausible.io;
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Then change the snippet to `src="/js/script.js"` and `plausible.init({ endpoint: "/api/event" })`.

### 6. Self-hosting (Community Edition v3)

Use the official repository, which ships the matching PostgreSQL, ClickHouse and config files, instead of a hand-written compose file. Needs 2 GB of RAM and a CPU with SSE 4.2 or NEON. Check the latest tag at github.com/plausible/community-edition (v3.2.1 when this was written).

```bash
git clone -b v3.2.1 --single-branch https://github.com/plausible/community-edition plausible-ce
cd plausible-ce
echo "BASE_URL=https://plausible.bluefinbikes.com" >> .env
echo "SECRET_KEY_BASE=$(openssl rand -base64 48)" >> .env
echo "HTTP_PORT=80" >> .env
echo "HTTPS_PORT=443" >> .env
cat > compose.override.yml <<'EOF'
services:
  plausible:
    ports:
      - 80:80
      - 443:443
EOF
docker compose up -d
```

With both ports set, Plausible obtains a Let's Encrypt certificate for the `BASE_URL` host, whose DNS record must already point at the server. Behind your own reverse proxy choose other ports. To try it locally use `BASE_URL=http://localhost:8000`, `HTTP_PORT=80` and the override port mapping `8000:80`. Open `BASE_URL` and register the first user, then set `DISABLE_REGISTRATION=true`. To upgrade, check out the next tag, read its release notes, then `docker compose pull && docker compose up -d`.

## Examples

**"Add privacy-friendly analytics to my Astro site, no cookie banner."** Add the site in Plausible Cloud, paste the two-part snippet from Site installation into the layout's `<head>`, deploy, and open the live site once. The dashboard shows the visit within a minute. If not, check for an ad blocker, and remember that localhost is ignored by default.

**"Count newsletter signups as a goal."** Add `class="plausible-event-name=Newsletter+Signup"` to the button and create a custom event goal named `Newsletter Signup`. After a click on the live site the Goals panel shows unique and total conversions.

**"Give me last week's top 10 pages as JSON."** Run the `top_pages` query above with `date_range='7d'`. The result is a list of rows like `{"metrics": [212, 340], "dimensions": ["/pricing"]}`, ordered by visitors.

## Guidelines

- Copy the snippet from the dashboard; do not guess the `pa-` id, and do not write `data-domain` scripts for new installs (the legacy form still works on old sites).
- Events with no matching goal are stored but not shown in Goals; goal names are case-sensitive.
- Keep the Stats API key in an environment variable or secret store, never in browser code; it can read every site of its team.
- A proxy must forward the visitor IP in `X-Forwarded-For`; otherwise the bot filter silently drops events while the API still answers 202.
- Plausible deliberately has no per-user tracking or session replay. For identified-user funnels use a product analytics tool.
- When self-hosting, back up both the PostgreSQL and ClickHouse volumes.
