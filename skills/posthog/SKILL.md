---
name: posthog
category: analytics
version: 1.0.0
description: >-
  Open-source product analytics with PostHog — event tracking, funnels, cohorts,
  session replay, feature flags, and experimentation. Self-host with Docker or
  use PostHog Cloud. Covers JavaScript SDK for frontend tracking, Python SDK for
  backend events, autocapture configuration, custom event taxonomies, and
  funnel/retention analysis. Use when tasks involve adding product analytics,
  understanding user behavior, debugging UX with session replay, or rolling out
  features with feature flags.
author: terminal-skills
tags: [posthog, analytics, product-analytics, session-replay, feature-flags, funnels]
license: Apache-2.0
compatibility:
  - platform: linux
  - platform: macos
  - platform: windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: analytics
  tags: [posthog, analytics, product-analytics, session-replay, feature-flags]
---

# PostHog

Open-source product analytics platform. Track events, build funnels, watch session replays, and manage feature flags — self-hosted or on PostHog Cloud.

## Self-Hosting with Docker Compose

```yaml
# docker-compose.yml — PostHog self-hosted stack.
# Runs PostHog with PostgreSQL, Redis, ClickHouse, Kafka, and worker processes.
version: '3'

services:
  posthog:
    image: posthog/posthog:latest
    environment:
      DATABASE_URL: postgres://posthog:posthog@db:5432/posthog
      REDIS_URL: redis://redis:6379/
      CLICKHOUSE_HOST: clickhouse
      KAFKA_HOSTS: kafka:9092
      SECRET_KEY: '<generate-a-secret-key>'
      SITE_URL: https://analytics.example.com
    ports:
      - '8000:8000'
    depends_on:
      - db
      - redis
      - clickhouse
      - kafka

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: posthog
      POSTGRES_USER: posthog
      POSTGRES_PASSWORD: posthog
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  clickhouse:
    image: clickhouse/clickhouse-server:23.8
    volumes:
      - clickhouse-data:/var/lib/clickhouse

  kafka:
    image: bitnami/kafka:3.5
    environment:
      KAFKA_CFG_ZOOKEEPER_CONNECT: zookeeper:2181
      ALLOW_PLAINTEXT_LISTENER: 'yes'
    depends_on:
      - zookeeper

  zookeeper:
    image: bitnami/zookeeper:3.8
    environment:
      ALLOW_ANONYMOUS_LOGIN: 'yes'

volumes:
  postgres-data:
  redis-data:
  clickhouse-data:
```

```bash
# deploy.sh — Start the PostHog stack.
docker compose up -d
# Wait for PostHog to be ready
until curl -sf http://localhost:8000/_health; do sleep 5; done
echo "PostHog is running at http://localhost:8000"
```

## JavaScript SDK — Frontend Event Tracking

```typescript
// lib/posthog.ts — Initialize PostHog JS SDK in a web app.
// Supports autocapture, custom events, and session recording.
import posthog from 'posthog-js'

export function initPostHog() {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      recordCrossOriginIframes: true,
    },
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        posthog.debug()
      }
    },
  })
}
```

```typescript
// lib/posthog-events.ts — Custom event tracking helpers.
// Define a typed event layer so tracking calls are consistent across the app.
import posthog from 'posthog-js'

export function trackSignup(method: 'google' | 'github' | 'email') {
  posthog.capture('user_signed_up', {
    method,
    $set: { signup_method: method },
  })
}

export function trackFeatureUsed(feature: string, metadata?: Record<string, any>) {
  posthog.capture('feature_used', {
    feature_name: feature,
    ...metadata,
  })
}

export function trackOnboardingStep(step: number, stepName: string) {
  posthog.capture('onboarding_step_completed', {
    step_number: step,
    step_name: stepName,
  })
}

export function identifyUser(userId: string, properties: Record<string, any>) {
  posthog.identify(userId, properties)
}
```

## Python SDK — Backend Event Tracking

```python
# posthog_client.py — Server-side PostHog tracking with the Python SDK.
# Use for backend events that don't originate from a browser session.
from posthog import Posthog

posthog = Posthog(
    project_api_key='phc_your_project_key',
    host='https://analytics.example.com'  # or https://app.posthog.com
)

def track_subscription_created(user_id: str, plan: str, amount_cents: int):
    """Track when a user subscribes — fired from the Stripe webhook handler."""
    posthog.capture(
        distinct_id=user_id,
        event='subscription_created',
        properties={
            'plan': plan,
            'amount_cents': amount_cents,
            'currency': 'usd',
        }
    )

def track_api_call(user_id: str, endpoint: str, latency_ms: float):
    """Track API usage for metering and performance analysis."""
    posthog.capture(
        distinct_id=user_id,
        event='api_call',
        properties={
            'endpoint': endpoint,
            'latency_ms': latency_ms,
        }
    )

def update_user_properties(user_id: str, properties: dict):
    """Set person properties for segmentation and cohorts."""
    posthog.identify(user_id, properties)

# Flush events before process exit
def shutdown():
    posthog.shutdown()
```

## Feature Flags

```typescript
// lib/feature-flags.ts — Check PostHog feature flags client-side.
// Use for gradual rollouts, A/B tests, and beta features.
import posthog from 'posthog-js'

export function isFeatureEnabled(flag: string): boolean {
  return posthog.isFeatureEnabled(flag) ?? false
}

export function getFeatureFlagPayload(flag: string): any {
  return posthog.getFeatureFlagPayload(flag)
}

// React component usage example
export function useFeatureFlag(flag: string): boolean {
  // PostHog React SDK provides useFeatureFlagEnabled hook
  // import { useFeatureFlagEnabled } from 'posthog-js/react'
  // return useFeatureFlagEnabled(flag)
  return isFeatureEnabled(flag)
}
```

```python
# feature_flags_server.py — Server-side feature flag evaluation.
# Evaluate flags without a network call using local evaluation.
from posthog import Posthog

posthog = Posthog(
    project_api_key='phc_your_project_key',
    host='https://analytics.example.com',
    personal_api_key='phx_your_personal_api_key'  # Required for local evaluation
)

def check_flag(user_id: str, flag: str, properties: dict = None) -> bool:
    """Evaluate a feature flag for a user. Uses local evaluation when possible."""
    return posthog.feature_enabled(
        flag,
        distinct_id=user_id,
        person_properties=properties or {}
    )

def get_flag_variant(user_id: str, flag: str) -> str | None:
    """Get the multivariate flag variant for A/B testing."""
    return posthog.get_feature_flag(flag, distinct_id=user_id)
```

## Session Replay Configuration

```typescript
// lib/session-replay.ts — Configure session replay with privacy controls.
// Mask sensitive inputs and define recording triggers.
import posthog from 'posthog-js'

export function configureSessionReplay() {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
        color: false,
        date: false,
        email: true,
        tel: true,
      },
      maskTextSelector: '[data-ph-mask]',
      blockSelector: '[data-ph-block]',
      recordCrossOriginIframes: true,
    },
  })
}

// Manually control recording
export function startRecording() {
  posthog.startSessionRecording()
}

export function stopRecording() {
  posthog.stopSessionRecording()
}
```

## Funnel and Cohort Queries via API

```python
# posthog_api.py — Query PostHog API for funnels and cohorts.
# Use for building dashboards or exporting analytics data.
import requests

POSTHOG_HOST = 'https://analytics.example.com'
PERSONAL_API_KEY = 'phx_your_personal_api_key'
PROJECT_ID = '1'

headers = {'Authorization': f'Bearer {PERSONAL_API_KEY}'}

def create_funnel_insight(funnel_steps: list[dict]) -> dict:
    """Create a funnel insight via the API."""
    response = requests.post(
        f'{POSTHOG_HOST}/api/projects/{PROJECT_ID}/insights/',
        headers=headers,
        json={
            'name': 'Onboarding Funnel',
            'filters': {
                'insight': 'FUNNELS',
                'events': funnel_steps,
                'funnel_window_days': 14,
            }
        }
    )
    return response.json()

def get_cohort_users(cohort_id: int, limit: int = 100) -> list:
    """Fetch users in a cohort."""
    response = requests.get(
        f'{POSTHOG_HOST}/api/projects/{PROJECT_ID}/cohorts/{cohort_id}/persons/',
        headers=headers,
        params={'limit': limit}
    )
    return response.json()['results']

# Example: Create an onboarding funnel
funnel = create_funnel_insight([
    {'id': 'user_signed_up', 'type': 'events', 'order': 0},
    {'id': 'onboarding_step_completed', 'type': 'events', 'order': 1,
     'properties': [{'key': 'step_number', 'value': 3, 'type': 'event'}]},
    {'id': 'feature_used', 'type': 'events', 'order': 2},
])
```
