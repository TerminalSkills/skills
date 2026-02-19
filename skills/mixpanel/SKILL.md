---
name: mixpanel
category: analytics
version: 1.0.0
description: >-
  Product analytics with Mixpanel — event tracking, funnels, retention analysis,
  user segmentation, and A/B testing. Covers JavaScript SDK for frontend tracking,
  server-side tracking with Node.js and Python, identity management, group
  analytics, and the Query API. Use when tasks involve tracking user behavior in
  web or mobile apps, building conversion funnels, analyzing retention curves,
  or running experiments.
author: terminal-skills
tags: [mixpanel, analytics, product-analytics, funnels, retention, ab-testing]
license: Apache-2.0
compatibility:
  - platform: linux
  - platform: macos
  - platform: windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: analytics
  tags: [mixpanel, analytics, product-analytics, funnels, retention]
---

# Mixpanel

Product analytics for tracking user behavior. Event-based data model with funnels, retention, flows, and experimentation.

## JavaScript SDK Setup

```typescript
// lib/mixpanel.ts — Initialize Mixpanel JS SDK for a web application.
// Configures persistence, cross-subdomain tracking, and debug mode.
import mixpanel from 'mixpanel-browser'

export function initMixpanel() {
  mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!, {
    debug: process.env.NODE_ENV === 'development',
    track_pageview: 'url-with-path',
    persistence: 'localStorage',
    ignore_dnt: false,
    batch_requests: true,
    batch_size: 50,
    batch_flush_interval_ms: 5000,
  })
}
```

```typescript
// lib/mixpanel-events.ts — Typed event tracking helpers for Mixpanel.
// Centralizes event names and properties for consistency.
import mixpanel from 'mixpanel-browser'

export function identifyUser(userId: string, traits: Record<string, any>) {
  mixpanel.identify(userId)
  mixpanel.people.set({
    $email: traits.email,
    $name: traits.name,
    plan: traits.plan,
    company: traits.company,
    signed_up_at: traits.createdAt,
  })
}

export function trackSignup(method: string, referrer?: string) {
  mixpanel.track('Sign Up', {
    method,
    referrer: referrer || 'direct',
  })
  mixpanel.people.set_once({ 'First Sign Up Date': new Date().toISOString() })
}

export function trackFeatureUsed(feature: string, details?: Record<string, any>) {
  mixpanel.track('Feature Used', {
    feature,
    ...details,
  })
  mixpanel.people.increment('total_feature_uses')
}

export function trackPurchase(plan: string, amount: number, currency: string) {
  mixpanel.track('Purchase', { plan, amount, currency })
  mixpanel.people.track_charge(amount, { plan })
}

export function trackOnboardingStep(step: number, stepName: string, completed: boolean) {
  mixpanel.track('Onboarding Step', {
    step_number: step,
    step_name: stepName,
    completed,
  })
}

export function resetUser() {
  mixpanel.reset()
}
```

## Server-Side Tracking — Node.js

```typescript
// lib/mixpanel-server.ts — Server-side Mixpanel tracking with Node.js.
// Use for backend events like payments, API calls, and webhook handlers.
import Mixpanel from 'mixpanel'

const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN!, {
  host: 'api-eu.mixpanel.com', // Use 'api.mixpanel.com' for US residency
})

export function trackServerEvent(
  userId: string,
  event: string,
  properties: Record<string, any> = {}
) {
  mixpanel.track(event, {
    distinct_id: userId,
    ...properties,
  })
}

export function trackSubscription(userId: string, plan: string, mrr: number) {
  mixpanel.track('Subscription Started', {
    distinct_id: userId,
    plan,
    mrr,
    currency: 'usd',
  })
  mixpanel.people.set(userId, {
    plan,
    mrr,
    subscription_date: new Date().toISOString(),
  })
}

export function trackChurn(userId: string, reason: string, daysActive: number) {
  mixpanel.track('Subscription Cancelled', {
    distinct_id: userId,
    reason,
    days_active: daysActive,
  })
  mixpanel.people.set(userId, { plan: 'free', churned: true })
}
```

## Server-Side Tracking — Python

```python
# mixpanel_server.py — Server-side Mixpanel tracking with Python.
# Use for data pipelines, backend services, and batch imports.
from mixpanel import Mixpanel, Consumer

# Batch consumer for high-throughput tracking
mp = Mixpanel(
    'your_project_token',
    consumer=Consumer()  # Default consumer sends immediately
)

def track_event(user_id: str, event: str, properties: dict = None):
    """Track a single event."""
    mp.track(user_id, event, properties or {})

def update_user_profile(user_id: str, properties: dict):
    """Set properties on a user profile."""
    mp.people_set(user_id, properties)

def track_revenue(user_id: str, amount: float, properties: dict = None):
    """Track a revenue event on the user profile."""
    mp.people_track_charge(user_id, amount, properties or {})

def import_historical_event(user_id: str, event: str, timestamp: int, properties: dict):
    """Import a past event with a specific Unix timestamp.
    Requires the API secret for import endpoints."""
    import requests
    import base64
    import json

    data = {
        'event': event,
        'properties': {
            'distinct_id': user_id,
            'time': timestamp,
            **properties,
        }
    }
    encoded = base64.b64encode(json.dumps([data]).encode()).decode()
    requests.post(
        'https://api.mixpanel.com/import',
        params={'strict': 1},
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + base64.b64encode(b'your_api_secret:').decode(),
        },
        json=[data]
    )
```

## Group Analytics

```typescript
// lib/mixpanel-groups.ts — Group analytics for B2B SaaS.
// Track events at the company/workspace level in addition to user level.
import mixpanel from 'mixpanel-browser'

export function setUserCompany(companyId: string, companyName: string) {
  mixpanel.set_group('company', companyId)
  mixpanel.get_group('company', companyId).set({
    $name: companyName,
    plan: 'enterprise',
    seats: 50,
  })
}

export function trackCompanyEvent(
  companyId: string,
  event: string,
  properties: Record<string, any> = {}
) {
  mixpanel.track_with_groups(event, properties, { company: companyId })
}
```

## Query API

```python
# mixpanel_query.py — Query Mixpanel data via the Insights API.
# Export event data, funnel results, and retention tables.
import requests
from datetime import date, timedelta

PROJECT_ID = 'your_project_id'
SA_USERNAME = 'your_service_account_username'
SA_SECRET = 'your_service_account_secret'

def query_insights(event: str, from_date: date, to_date: date) -> dict:
    """Query event counts from the Insights API."""
    r = requests.get(
        f'https://mixpanel.com/api/2.0/insights',
        auth=(SA_USERNAME, SA_SECRET),
        params={
            'project_id': PROJECT_ID,
            'bookmark': None,
        },
        json={
            'params': {
                'event': [event],
                'type': 'general',
                'from_date': from_date.isoformat(),
                'to_date': to_date.isoformat(),
            }
        }
    )
    return r.json()

def export_raw_events(from_date: date, to_date: date) -> list:
    """Export raw event data for a date range."""
    r = requests.get(
        'https://data.mixpanel.com/api/2.0/export',
        auth=(SA_USERNAME, SA_SECRET),
        params={
            'from_date': from_date.isoformat(),
            'to_date': to_date.isoformat(),
            'project_id': PROJECT_ID,
        },
        stream=True
    )
    import json
    events = []
    for line in r.iter_lines():
        if line:
            events.append(json.loads(line))
    return events
```
