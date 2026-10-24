---
name: mixpanel
description: >-
  Mixpanel is a product analytics service for tracking events, building
  funnels and retention reports, and segmenting users. Use when a user asks to
  add Mixpanel tracking to a web app, send server-side events from Node.js or
  Python, identify users, set up company-level group analytics, import
  historical events, or pull data out with the Query and Export APIs.
license: Apache-2.0
compatibility: "mixpanel-browser 2.x, mixpanel (Node.js) 0.24, mixpanel (Python) 5.x; a Mixpanel project token; service account for import/export/query"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: [mixpanel, analytics, product-analytics, funnels, retention]
---

# Mixpanel

## Overview

Mixpanel stores events (`track`) and user or group profiles (`people.set`, group profiles). Three credentials exist and are easy to mix up:

- **Project token**: public, goes in browser code and in the server SDKs' `init`; it can only send data.
- **Service account** (username, secret, project id): private; required for `/import`, the Export API and the Query API.
- **Data residency**: EU projects must send to `api-eu.mixpanel.com` (browser: `api_host: 'https://api-eu.mixpanel.com'`) and query `eu.mixpanel.com`; US is the default. Sending to the wrong region silently loses data.

## Instructions

### Step 1: Browser SDK

```bash
npm install mixpanel-browser
```

```typescript
// lib/mixpanel.ts
import mixpanel from 'mixpanel-browser'

export function initMixpanel() {
  mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!, {
    debug: process.env.NODE_ENV === 'development',
    api_host: 'https://api-eu.mixpanel.com',   // remove for US projects
    track_pageview: 'url-with-path',
    persistence: 'localStorage',
    // batch_requests (true), batch_size (50) and batch_flush_interval_ms (5000) are already the defaults
  })
}
```

Call `initMixpanel()` once on the client (for example in a `useEffect` in the root layout), never during server rendering.

```typescript
// lib/mixpanel-events.ts
import mixpanel from 'mixpanel-browser'

export function identifyUser(userId: string, traits: { email: string; name: string; plan: string }) {
  mixpanel.identify(userId)   // call on login/signup; anonymous activity before it is merged into this user
  mixpanel.people.set({ $email: traits.email, $name: traits.name, plan: traits.plan })
}

export function trackPurchase(plan: string, amount: number, currency: string) {
  mixpanel.track('Purchase', { plan, amount, currency })
}

export function resetUser() {
  mixpanel.reset()            // on logout
}
```

`mixpanel.people.track_charge()` is deprecated and does nothing in current versions; record revenue as an event property (as above) and chart it in Mixpanel.

### Step 2: Server SDK, Node.js

```bash
npm install mixpanel
```

```typescript
// lib/mixpanel-server.ts
import Mixpanel from 'mixpanel'

const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN!, {
  host: 'api-eu.mixpanel.com',   // omit for US
})

export function trackSubscription(userId: string, plan: string, mrr: number) {
  mixpanel.track('Subscription Started', { distinct_id: userId, plan, mrr, currency: 'usd' })
  mixpanel.people.set(userId, { plan, mrr })
}
```

Historical or backfilled events go through `/import`, which needs service account credentials:

```typescript
const { ServiceAccountCredentials } = Mixpanel
const credentials = new ServiceAccountCredentials(
  process.env.MIXPANEL_SA_USER!, process.env.MIXPANEL_SA_SECRET!, process.env.MIXPANEL_PROJECT_ID!)
const importer = Mixpanel.init(process.env.MIXPANEL_TOKEN!, { credentials })
importer.import('Purchase', new Date('2026-09-01T10:00:00Z'),
  { distinct_id: 'u_1042', amount: 49, $insert_id: 'ord-1001' })
```

### Step 3: Server SDK, Python

```bash
pip install mixpanel
```

```python
import os
from mixpanel import Mixpanel, Consumer, ServiceAccountCredentials

credentials = ServiceAccountCredentials(
    username=os.environ["MIXPANEL_SA_USER"],
    secret=os.environ["MIXPANEL_SA_SECRET"],
    project_id=os.environ["MIXPANEL_PROJECT_ID"],
)
# EU projects: pass api_host. The credentials are used for import_data.
mp = Mixpanel(os.environ["MIXPANEL_TOKEN"],
              consumer=Consumer(api_host="api-eu.mixpanel.com", credentials=credentials))

mp.track("u_1042", "Sign Up", {"method": "google"})
mp.people_set("u_1042", {"$email": "maya@shopfront.dev", "plan": "pro"})
mp.group_set("company", "northwind", {"$name": "Northwind Traders", "seats": 50})
# Past event: api_key is deprecated, pass None; timestamp is UTC seconds. Use $insert_id so retries do not duplicate.
mp.import_data(None, "u_1042", "Purchase", 1788256800, {"amount": 49, "$insert_id": "ord-1001"})
```

The Python calls were run against a local stub server: `track` posts to `/track`, `people_set` to `/engage`, `group_set` to `/groups`, and `import_data` to `/import?project_id=...` with Basic auth.

### Step 4: Group analytics (B2B)

Enable the group key (for example `company`) in Mixpanel project settings first.

```typescript
import mixpanel from 'mixpanel-browser'

export function setUserCompany(companyId: string, companyName: string) {
  mixpanel.set_group('company', companyId)
  mixpanel.get_group('company', companyId).set({ $name: companyName, plan: 'enterprise' })
}

export function trackCompanyEvent(companyId: string, event: string, properties = {}) {
  mixpanel.track_with_groups(event, properties, { company: companyId })
}
```

### Step 5: Query and Export APIs

Authenticate with the service account (HTTP Basic) and pass `project_id`. The Insights endpoint only reads a saved report (`bookmark_id` is required), so for ad-hoc counts use Segmentation, and use Export for raw events.

```python
import json, os, requests
from datetime import date

AUTH = (os.environ["MIXPANEL_SA_USER"], os.environ["MIXPANEL_SA_SECRET"])
PROJECT_ID = os.environ["MIXPANEL_PROJECT_ID"]

def daily_counts(event: str, start: date, end: date) -> dict:
    r = requests.get("https://eu.mixpanel.com/api/query/segmentation", auth=AUTH, timeout=60, params={
        "project_id": PROJECT_ID, "event": event, "type": "general", "unit": "day",
        "from_date": start.isoformat(), "to_date": end.isoformat()})
    r.raise_for_status()
    return r.json()["data"]["values"][event]

def export_events(start: date, end: date):
    r = requests.get("https://data-eu.mixpanel.com/api/2.0/export", auth=AUTH, stream=True, timeout=300, params={
        "project_id": PROJECT_ID, "from_date": start.isoformat(), "to_date": end.isoformat()})
    r.raise_for_status()
    for line in r.iter_lines():          # JSONL: one event per line
        if line:
            yield json.loads(line)
```

Use `mixpanel.com` and `data.mixpanel.com` for US projects. Mixpanel marks the Segmentation endpoint as maintenance-mode (still working, not for new long-term integrations); prefer saved reports or Export for anything lasting. `event` in Segmentation is a single name; Export accepts a JSON array in `event`.

## Examples

### Example 1: Track a signup funnel

Request: "Track Sign Up, Onboarding Step and Purchase so I can build a funnel."

Call `identifyUser` on login, `mixpanel.track('Sign Up', { method })` after account creation, `mixpanel.track('Onboarding Step', { step_number, step_name })` per step and `trackPurchase` on payment. In Mixpanel, Funnels > pick the three events in order. In development, `debug: true` prints each request to the console, and Events > Live View shows them arriving.

### Example 2: Daily signups for the last week

Request: "How many Sign Up events per day this week?" (with `daily_counts` from Step 5 saved as `mixpanel_query.py`)

```console
$ python -c "from mixpanel_query import daily_counts; from datetime import date,timedelta as d; print(daily_counts('Sign Up', date.today()-d(days=6), date.today()))"
{'2026-10-18': 41, '2026-10-19': 57, ...}   # your own numbers
```

## Guidelines

- Keep the service account secret and the project token in environment variables; only the token may reach the browser.
- Pick one naming style for events (`Sign Up`, `Feature Used`) and properties, and wrap `track` in typed helpers; renaming later splits history.
- Always send `$insert_id` when importing so reruns are deduplicated.
- Never put emails or other personal data in event properties unless you need them; use `people.set` and respect `opt_out_tracking()` for consent.
- Browser tracking is blocked by many ad blockers; send business-critical events (payments) from the server.
- Query and export endpoints are rate limited; cache results instead of polling.
