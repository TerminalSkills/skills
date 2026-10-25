---
name: launchdarkly
description: >-
  LaunchDarkly is a hosted feature flag service: it evaluates flags in your
  app so you can roll features out gradually, target segments and switch
  features off without a deploy. Use when a user asks to implement feature
  flags, roll out features gradually, run an A/B test, control access by user
  segment, or add a kill switch, with the Node.js or React SDK.
license: Apache-2.0
compatibility: 'Node.js 14+ server SDK; React 18+ web SDK; other languages have their own SDKs'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/launchdarkly/js-core
  tags: "launchdarkly, feature-flags, feature-toggles, ab-testing, rollout"
---

# LaunchDarkly

## Overview

LaunchDarkly is the industry-standard feature flag platform. Control feature rollouts, A/B tests, and entitlements without deploying new code. Supports gradual rollouts, targeting rules, and instant kill switches.

## Instructions

### Step 1: Setup

```bash
npm install @launchdarkly/node-server-sdk   # server (Node.js 14+), current 9.x
npm install @launchdarkly/react-sdk         # React web, current 4.x
```

`launchdarkly-react-client-sdk` (3.x) is the old name of the React package and is no longer developed; its README points to `@launchdarkly/react-sdk`. Its API (`withLDProvider`, `asyncWithLDProvider`) differs from the 4.x API below.

Credentials differ by SDK: the server SDK uses the environment's **SDK key** (secret, server only), the browser SDK uses the **client-side ID** (public). Never ship the SDK key to a browser. A flag used from React must have "Available on client-side SDKs" enabled in its settings, otherwise the browser never receives it.

### Step 2: Server-Side Flags

Create one client per process and reuse it. Evaluation reads locally cached rules, so `variation` makes no network call.

```typescript
// lib/flags.ts
import * as LaunchDarkly from '@launchdarkly/node-server-sdk'

const client = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY!)
// resolves when the first flag payload arrives; rejects on timeout or a bad key
await client.waitForInitialization({ timeout: 5 }).catch((err) => {
  console.error('LaunchDarkly not ready, serving defaults:', err.message)
})

export async function getFlag(flagKey: string, user: { key: string; email?: string; plan?: string }) {
  // attributes sit at the top level of a context (the old user-object `custom` map is not used)
  const context = { kind: 'user', key: user.key, email: user.email, plan: user.plan }
  return client.variation(flagKey, context, false) // false = value served if the flag is missing or the SDK is down
}

const showNewDashboard = await getFlag('new-dashboard', { key: 'user-8841', plan: 'pro' })
```

`client.variationDetail(...)` also returns the reason for a value (rule match, fallthrough, error), which helps when a flag does not behave as expected. Call `await client.flush()` before a short-lived process (script, serverless handler) exits so queued analytics events are sent, and `client.close()` on shutdown. `LaunchDarkly.init(key, { offline: true })` evaluates everything to defaults without network access, useful in unit tests.

### Step 3: React Client

In v4 you build a provider with `createLDReactProvider` at the app entry, then read flags with one hook per type. `useFlags` still exists but is deprecated.

```tsx
// main.tsx
import { createLDReactProvider } from '@launchdarkly/react-sdk'
import { createRoot } from 'react-dom/client'
import App from './App'

const LDProvider = createLDReactProvider(import.meta.env.VITE_LD_CLIENT_SIDE_ID, {
  kind: 'user',
  key: 'user-8841',
  plan: 'pro',
})

createRoot(document.getElementById('root')!).render(
  <LDProvider>
    <App />
  </LDProvider>,
)
```

```tsx
// Checkout.tsx
import { useBoolVariation } from '@launchdarkly/react-sdk'

export function Checkout() {
  const newCheckout = useBoolVariation('new-checkout', false)
  return newCheckout ? <NewCheckout /> : <OldCheckout />
}
```

Other hooks: `useStringVariation`, `useNumberVariation`, `useJsonVariation`, the matching `...VariationDetail` variants, `useLDClient()` for `identify`/`track`, and `useInitializationStatus()` to show a loader until flags are ready. In Next.js, pass the client-side ID through a `NEXT_PUBLIC_` variable and render the provider from a client component; the package also ships a `/server` entry for React Server Components (see the React Web SDK reference).

When the user logs in, call `useLDClient()?.identify(newContext)` to re-evaluate for the new context.

### Step 4: Gradual Rollout

Configure in the LaunchDarkly dashboard, on the flag's targeting tab for each environment:
- **Percentage rollout** in the default rule: 10% → 25% → 50% → 100% over days or weeks. Users are bucketed by the context key, so a user keeps the same variation as the percentage grows.
- **Targeting rules**: match on context attributes (such as `plan` is `pro`) or segments, beta users first, then everyone.
- **Kill switch**: turn the flag's targeting off; every context then gets the "off" variation within seconds, with no deploy.

## Examples

**Request:** "Roll out the new dashboard to 10% of pro users."
Create a boolean flag `new-dashboard`, add a rule `plan is one of pro` serving a 10% rollout of `true`, set the default rule to `false`. The server code from Step 2 returns `true` for about one in ten pro users and `false` for everyone else.

**Request:** "Add a kill switch for the recommendations widget in React."
Create a flag `recommendations-enabled` with "Available on client-side SDKs" ticked, then:

```tsx
const enabled = useBoolVariation('recommendations-enabled', true)
return enabled ? <Recommendations /> : null
```

Switching the flag off in the dashboard hides the widget in open browser tabs without a reload, because the SDK streams changes.

## Guidelines

- Always set a safe default in every `variation` call: the app must work when LaunchDarkly is unreachable.
- Use multi-variate (string, number, JSON) flags for A/B tests and experiments, not only booleans.
- Do not put personal data in context attributes that you do not need for targeting; mark sensitive attributes as private in the SDK options.
- Create a single server client; calling `init` per request leaks connections and delays every request.
- Remove flags and their code once a rollout is finished; stale flags become hidden branches.
- Check LaunchDarkly's pricing page for current plans; an open-source alternative such as Unleash fits teams that want to self-host.
