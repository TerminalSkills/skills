---
name: launchdarkly
description: >-
  Manage feature flags with LaunchDarkly. Use when a user asks to implement
  feature flags, roll out features gradually, do A/B testing, control feature
  access by user segment, or implement kill switches for features.
license: Apache-2.0
compatibility: 'Any language — JS, Python, Go, Java, Ruby, .NET SDKs'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - launchdarkly
    - feature-flags
    - feature-toggles
    - ab-testing
    - rollout
---

# LaunchDarkly

## Overview

LaunchDarkly is the industry-standard feature flag platform. Control feature rollouts, A/B tests, and entitlements without deploying new code. Supports gradual rollouts, targeting rules, and instant kill switches.

## Instructions

### Step 1: Setup

```bash
npm install @launchdarkly/node-server-sdk     # server
npm install launchdarkly-react-client-sdk      # React
```

### Step 2: Server-Side Flags

```typescript
// lib/flags.ts — Feature flag evaluation on the server
import * as LaunchDarkly from '@launchdarkly/node-server-sdk'

const client = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY!)
await client.waitForInitialization()

export async function getFlag(flagKey: string, user: { key: string; email?: string; plan?: string }) {
  const context = {
    kind: 'user',
    key: user.key,
    email: user.email,
    custom: { plan: user.plan },
  }
  return client.variation(flagKey, context, false)    // false = default
}

// Usage
const showNewDashboard = await getFlag('new-dashboard', { key: userId, plan: 'pro' })
if (showNewDashboard) {
  return renderNewDashboard()
}
```

### Step 3: React Client

```tsx
// components/FeatureFlag.tsx — Client-side feature flags
import { withLDProvider, useFlags } from 'launchdarkly-react-client-sdk'

function App() {
  const { newCheckout, darkMode } = useFlags()
  return (
    <div className={darkMode ? 'dark' : ''}>
      {newCheckout ? <NewCheckout /> : <OldCheckout />}
    </div>
  )
}

export default withLDProvider({
  clientSideID: process.env.NEXT_PUBLIC_LD_CLIENT_ID!,
  context: { kind: 'user', key: userId, email: userEmail },
})(App)
```

### Step 4: Gradual Rollout

Configure in LaunchDarkly dashboard:
- **Percentage rollout**: 10% → 25% → 50% → 100% over days/weeks
- **Targeting rules**: enable for beta users first, then pro plan, then everyone
- **Kill switch**: instantly disable a feature if it causes issues

## Guidelines

- LaunchDarkly evaluates flags locally (SDK caches rules) — near-zero latency.
- Use multi-variate flags for A/B testing (not just boolean on/off).
- Pricing starts at $10/seat/month. For free alternative, consider Unleash (open-source).
- Always set meaningful defaults — the app should work even if LaunchDarkly is unreachable.
