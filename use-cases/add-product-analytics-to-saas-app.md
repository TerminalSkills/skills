---
title: Add Product Analytics to a SaaS App
slug: add-product-analytics-to-saas-app
description: Deploy PostHog self-hosted, instrument event tracking for a Next.js SaaS app, build onboarding funnels, and add session replay to debug UX issues.
skills:
  - posthog
  - nextjs
  - docker-compose
category: data-ai
tags:
  - product-analytics
  - posthog
  - event-tracking
  - funnels
  - session-replay
  - saas
---

# Add Product Analytics to a SaaS App

Mateo's team shipped a project management tool three months ago. They have 2,000 users, but they're flying blind — no idea which features people actually use, where users drop off during onboarding, or why the free-to-paid conversion rate sits at 3%. They've decided to deploy PostHog self-hosted (they handle sensitive project data and need to keep analytics in-house) and instrument their Next.js app with event tracking, funnels, and session replay.

## Step 1 — Deploy PostHog Self-Hosted with Docker Compose

The team runs their infrastructure on a single VPS with Docker Compose. PostHog needs PostgreSQL, Redis, ClickHouse, and Kafka — the official Docker Compose file bundles everything.

```yaml
# docker-compose.posthog.yml — PostHog self-hosted stack.
# Sits alongside the existing app stack. Uses a dedicated network.
version: '3.8'

services:
  posthog:
    image: posthog/posthog:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://posthog:${POSTHOG_DB_PASSWORD}@posthog-db:5432/posthog
      REDIS_URL: redis://posthog-redis:6379/
      CLICKHOUSE_HOST: posthog-clickhouse
      KAFKA_HOSTS: posthog-kafka:9092
      SECRET_KEY: ${POSTHOG_SECRET_KEY}
      SITE_URL: https://analytics.projectflow.io
      IS_BEHIND_PROXY: 'true'
    ports:
      - '127.0.0.1:8000:8000'
    depends_on:
      - posthog-db
      - posthog-redis
      - posthog-clickhouse
      - posthog-kafka
    networks:
      - posthog-net

  posthog-db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: posthog
      POSTGRES_USER: posthog
      POSTGRES_PASSWORD: ${POSTHOG_DB_PASSWORD}
    volumes:
      - posthog-pg-data:/var/lib/postgresql/data
    networks:
      - posthog-net

  posthog-redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - posthog-redis-data:/data
    networks:
      - posthog-net

  posthog-clickhouse:
    image: clickhouse/clickhouse-server:23.8
    restart: unless-stopped
    volumes:
      - posthog-ch-data:/var/lib/clickhouse
    networks:
      - posthog-net

  posthog-kafka:
    image: bitnami/kafka:3.5
    restart: unless-stopped
    environment:
      KAFKA_CFG_ZOOKEEPER_CONNECT: posthog-zookeeper:2181
      ALLOW_PLAINTEXT_LISTENER: 'yes'
    depends_on:
      - posthog-zookeeper
    networks:
      - posthog-net

  posthog-zookeeper:
    image: bitnami/zookeeper:3.8
    restart: unless-stopped
    environment:
      ALLOW_ANONYMOUS_LOGIN: 'yes'
    volumes:
      - posthog-zk-data:/bitnami/zookeeper
    networks:
      - posthog-net

volumes:
  posthog-pg-data:
  posthog-redis-data:
  posthog-ch-data:
  posthog-zk-data:

networks:
  posthog-net:
    driver: bridge
```

```bash
# deploy-posthog.sh — Generate secrets and bring up the PostHog stack.
# Run once on the server to initialize PostHog.
#!/bin/bash
set -euo pipefail

export POSTHOG_SECRET_KEY=$(openssl rand -hex 32)
export POSTHOG_DB_PASSWORD=$(openssl rand -hex 16)

# Save secrets
cat > .env.posthog <<EOF
POSTHOG_SECRET_KEY=$POSTHOG_SECRET_KEY
POSTHOG_DB_PASSWORD=$POSTHOG_DB_PASSWORD
EOF

# Start the stack
docker compose -f docker-compose.posthog.yml --env-file .env.posthog up -d

# Wait for PostHog to be ready
echo "Waiting for PostHog..."
until curl -sf http://localhost:8000/_health > /dev/null 2>&1; do
  sleep 5
done
echo "PostHog is running. Set up your account at http://localhost:8000"
```

Mateo puts Caddy in front of PostHog to handle TLS:

```Caddyfile
# Caddyfile — Reverse proxy for PostHog with automatic HTTPS.
analytics.projectflow.io {
    reverse_proxy localhost:8000
}
```

## Step 2 — Install the PostHog SDK in Next.js

The app is a Next.js 14 App Router project. PostHog needs to initialize on the client side and persist across route changes.

```typescript
// lib/posthog.ts — PostHog client initialization for Next.js.
// Configured with autocapture, session recording, and development debug mode.
import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY!
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST!

export function initPostHog() {
  if (typeof window === 'undefined') return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: false, // We handle this manually for App Router
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
        email: false,
      },
      maskTextSelector: '[data-ph-mask]',
    },
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug()
    },
  })
}

export { posthog }
```

```typescript
// components/posthog-provider.tsx — PostHog context provider for React.
// Wraps the app to initialize tracking and capture page views on navigation.
'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { initPostHog, posthog } from '@/lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initPostHog()
      initialized.current = true
    }
  }, [])

  useEffect(() => {
    if (!initialized.current) return
    const url = `${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams])

  return <>{children}</>
}
```

```typescript
// app/layout.tsx — Root layout with PostHog provider.
// Wraps the entire app so every page gets tracking.
import { PostHogProvider } from '@/components/posthog-provider'
import { Suspense } from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
      </body>
    </html>
  )
}
```

## Step 3 — Instrument Key Feature Events

Mateo's team defines a tracking plan: the events that matter for understanding user behavior and measuring conversions. They create a typed event layer to keep tracking consistent.

```typescript
// lib/analytics.ts — Centralized event tracking for the ProjectFlow app.
// Every tracked interaction goes through this module for consistency.
import { posthog } from '@/lib/posthog'

// --- Authentication events ---

export function trackSignup(method: 'google' | 'github' | 'email') {
  posthog.capture('user_signed_up', {
    method,
  })
  posthog.people.set({ signup_method: method })
}

export function trackLogin(method: string) {
  posthog.capture('user_logged_in', { method })
}

// --- Onboarding events ---

export function trackOnboardingStarted() {
  posthog.capture('onboarding_started')
}

export function trackOnboardingStep(step: number, stepName: string) {
  posthog.capture('onboarding_step_completed', {
    step_number: step,
    step_name: stepName,
  })
}

export function trackOnboardingCompleted(totalTimeSeconds: number) {
  posthog.capture('onboarding_completed', {
    total_time_seconds: totalTimeSeconds,
  })
}

// --- Core feature events ---

export function trackProjectCreated(templateUsed: boolean) {
  posthog.capture('project_created', { template_used: templateUsed })
}

export function trackTaskCreated(projectId: string, hasDeadline: boolean, hasAssignee: boolean) {
  posthog.capture('task_created', {
    project_id: projectId,
    has_deadline: hasDeadline,
    has_assignee: hasAssignee,
  })
}

export function trackInviteSent(role: string) {
  posthog.capture('team_invite_sent', { role })
}

export function trackViewSwitched(view: 'board' | 'list' | 'timeline' | 'calendar') {
  posthog.capture('view_switched', { view_type: view })
}

// --- Upgrade events ---

export function trackUpgradePromptShown(trigger: string) {
  posthog.capture('upgrade_prompt_shown', { trigger })
}

export function trackUpgradeStarted(plan: string) {
  posthog.capture('upgrade_started', { plan })
}

export function trackUpgradeCompleted(plan: string, amount: number) {
  posthog.capture('upgrade_completed', { plan, amount_usd: amount })
}

// --- User identification ---

export function identifyUser(
  userId: string,
  properties: { email: string; name: string; plan: string; createdAt: string }
) {
  posthog.identify(userId, {
    email: properties.email,
    name: properties.name,
    plan: properties.plan,
    created_at: properties.createdAt,
  })
}
```

Then they wire the events into the actual components:

```typescript
// app/(app)/onboarding/steps.tsx — Onboarding wizard with analytics tracking.
// Each step completion fires an event that feeds into the onboarding funnel.
'use client'
import { useState, useRef } from 'react'
import {
  trackOnboardingStarted,
  trackOnboardingStep,
  trackOnboardingCompleted,
} from '@/lib/analytics'

const STEPS = [
  { name: 'Create Workspace', component: CreateWorkspaceStep },
  { name: 'Invite Team', component: InviteTeamStep },
  { name: 'Create First Project', component: CreateProjectStep },
  { name: 'Add First Task', component: AddTaskStep },
]

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const startTime = useRef(Date.now())

  // Track onboarding start on mount
  useState(() => {
    trackOnboardingStarted()
  })

  function handleStepComplete() {
    trackOnboardingStep(currentStep + 1, STEPS[currentStep].name)

    if (currentStep === STEPS.length - 1) {
      const totalSeconds = Math.round((Date.now() - startTime.current) / 1000)
      trackOnboardingCompleted(totalSeconds)
      // Redirect to dashboard
      return
    }

    setCurrentStep((s) => s + 1)
  }

  const StepComponent = STEPS[currentStep].component

  return (
    <div className="max-w-xl mx-auto py-12">
      <div className="mb-8">
        <p className="text-sm text-gray-500">
          Step {currentStep + 1} of {STEPS.length}
        </p>
        <h2 className="text-2xl font-bold">{STEPS[currentStep].name}</h2>
      </div>
      <StepComponent onComplete={handleStepComplete} />
    </div>
  )
}
```

## Step 4 — Build the Onboarding Funnel

With events flowing, Mateo creates a funnel in PostHog to see where users drop off during onboarding. He uses the PostHog API to set this up programmatically so it's reproducible:

```python
# scripts/setup_funnels.py — Create PostHog insights for onboarding analysis.
# Run once to set up the dashboards the team needs.
import requests

POSTHOG_HOST = 'https://analytics.projectflow.io'
API_KEY = 'phx_your_personal_api_key'
PROJECT_ID = '1'

headers = {'Authorization': f'Bearer {API_KEY}'}

# Onboarding funnel
onboarding_funnel = requests.post(
    f'{POSTHOG_HOST}/api/projects/{PROJECT_ID}/insights/',
    headers=headers,
    json={
        'name': 'Onboarding Funnel',
        'description': 'Tracks user progression through the 4-step onboarding wizard',
        'filters': {
            'insight': 'FUNNELS',
            'events': [
                {'id': 'user_signed_up', 'type': 'events', 'order': 0, 'name': 'Signed Up'},
                {'id': 'onboarding_started', 'type': 'events', 'order': 1, 'name': 'Started Onboarding'},
                {'id': 'onboarding_step_completed', 'type': 'events', 'order': 2, 'name': 'Created Workspace',
                 'properties': [{'key': 'step_name', 'value': 'Create Workspace', 'type': 'event'}]},
                {'id': 'onboarding_step_completed', 'type': 'events', 'order': 3, 'name': 'Invited Team',
                 'properties': [{'key': 'step_name', 'value': 'Invite Team', 'type': 'event'}]},
                {'id': 'onboarding_step_completed', 'type': 'events', 'order': 4, 'name': 'Created Project',
                 'properties': [{'key': 'step_name', 'value': 'Create First Project', 'type': 'event'}]},
                {'id': 'onboarding_completed', 'type': 'events', 'order': 5, 'name': 'Completed Onboarding'},
            ],
            'funnel_window_days': 7,
            'funnel_viz_type': 'steps',
        }
    }
)
print(f"Onboarding funnel created: {onboarding_funnel.json().get('short_id')}")

# Free-to-paid conversion funnel
conversion_funnel = requests.post(
    f'{POSTHOG_HOST}/api/projects/{PROJECT_ID}/insights/',
    headers=headers,
    json={
        'name': 'Free to Paid Conversion',
        'description': 'Tracks the journey from signup to paid subscription',
        'filters': {
            'insight': 'FUNNELS',
            'events': [
                {'id': 'user_signed_up', 'type': 'events', 'order': 0},
                {'id': 'onboarding_completed', 'type': 'events', 'order': 1},
                {'id': 'project_created', 'type': 'events', 'order': 2},
                {'id': 'team_invite_sent', 'type': 'events', 'order': 3},
                {'id': 'upgrade_prompt_shown', 'type': 'events', 'order': 4},
                {'id': 'upgrade_completed', 'type': 'events', 'order': 5},
            ],
            'funnel_window_days': 30,
        }
    }
)
print(f"Conversion funnel created: {conversion_funnel.json().get('short_id')}")

# Weekly retention
retention = requests.post(
    f'{POSTHOG_HOST}/api/projects/{PROJECT_ID}/insights/',
    headers=headers,
    json={
        'name': 'Weekly Retention',
        'description': 'Are users coming back week over week?',
        'filters': {
            'insight': 'RETENTION',
            'target_entity': {'id': 'user_signed_up', 'type': 'events'},
            'returning_entity': {'id': '$pageview', 'type': 'events'},
            'retention_type': 'retention_first_time',
            'total_intervals': 8,
            'period': 'Week',
        }
    }
)
print(f"Retention insight created: {retention.json().get('short_id')}")
```

## Step 5 — Add Session Replay for UX Debugging

Session replay is already enabled from the SDK config in Step 2. Now Mateo configures it to be useful — linking recordings to specific users and events so the team can find relevant sessions quickly.

```typescript
// lib/posthog-replay.ts — Session replay helpers for targeted debugging.
// Tag recordings and control capture for specific scenarios.
import { posthog } from '@/lib/posthog'

export function tagSessionWithError(error: Error, context: string) {
  /**
   * When an error occurs, tag the recording so the team can find it.
   * These sessions show up when filtering recordings by the error tag.
   */
  posthog.capture('$exception', {
    $exception_message: error.message,
    $exception_type: error.name,
    context,
  })
}

export function markSessionAsHighValue(reason: string) {
  /**
   * Flag sessions from paying users or users hitting upgrade flows.
   * The team reviews these weekly to understand what drives conversions.
   */
  posthog.capture('high_value_session', { reason })
}
```

```typescript
// components/error-boundary.tsx — React error boundary with PostHog session tagging.
// Captures errors and links them to the session recording for debugging.
'use client'
import { Component, ReactNode } from 'react'
import { tagSessionWithError } from '@/lib/posthog-replay'

interface Props {
  children: ReactNode
  fallback: ReactNode
}

interface State {
  hasError: boolean
}

export class AnalyticsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    tagSessionWithError(error, 'react-error-boundary')
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
```

## Step 6 — Backend Event Tracking for Subscriptions

Some events happen server-side — Stripe webhooks for payments, API usage metering, and background jobs. The team adds the Python SDK to their FastAPI backend.

```python
# app/analytics.py — Server-side PostHog tracking for the FastAPI backend.
# Captures events that originate from webhooks and background processes.
from posthog import Posthog

posthog_client = Posthog(
    project_api_key='phc_your_project_key',
    host='https://analytics.projectflow.io'
)

def track_subscription_event(user_id: str, event: str, plan: str, amount_cents: int):
    """Track subscription lifecycle events from Stripe webhooks."""
    posthog_client.capture(
        distinct_id=user_id,
        event=event,
        properties={
            'plan': plan,
            'amount_cents': amount_cents,
            'currency': 'usd',
        }
    )

def track_api_usage(user_id: str, endpoint: str, latency_ms: float, status_code: int):
    """Track API call for usage metering and performance analysis."""
    posthog_client.capture(
        distinct_id=user_id,
        event='api_call',
        properties={
            'endpoint': endpoint,
            'latency_ms': latency_ms,
            'status_code': status_code,
        }
    )

def update_user_plan(user_id: str, plan: str, mrr_cents: int):
    """Update the user's plan in PostHog after a subscription change."""
    posthog_client.identify(
        distinct_id=user_id,
        properties={
            'plan': plan,
            'mrr_cents': mrr_cents,
        }
    )
```

```python
# app/webhooks/stripe.py — Stripe webhook handler with PostHog tracking.
# Fires analytics events for subscription lifecycle changes.
from fastapi import APIRouter, Request, HTTPException
import stripe
from app.analytics import track_subscription_event, update_user_plan

router = APIRouter()

@router.post('/webhooks/stripe')
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400)

    if event['type'] == 'customer.subscription.created':
        sub = event['data']['object']
        user_id = sub['metadata']['user_id']
        plan = sub['metadata']['plan']
        amount = sub['items']['data'][0]['price']['unit_amount']

        track_subscription_event(user_id, 'subscription_created', plan, amount)
        update_user_plan(user_id, plan, amount)

    elif event['type'] == 'customer.subscription.deleted':
        sub = event['data']['object']
        user_id = sub['metadata']['user_id']
        plan = sub['metadata']['plan']

        track_subscription_event(user_id, 'subscription_cancelled', plan, 0)
        update_user_plan(user_id, 'free', 0)

    return {'status': 'ok'}
```

After a week of data collection, Mateo's team discovers that 60% of users drop off at the "Invite Team" onboarding step — people signing up solo don't want to invite teammates yet. They make the step optional, and the onboarding completion rate jumps from 35% to 58%. Session replays show that users on the free plan keep clicking the timeline view (a paid feature), so they redesign the upgrade prompt to appear contextually when users interact with premium features instead of burying it in settings. The free-to-paid conversion rate climbs from 3% to 7% in the first month.
