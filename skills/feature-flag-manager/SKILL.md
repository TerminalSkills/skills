---
name: feature-flag-manager
description: >-
  When the user needs to implement feature flags, gradual rollouts, or experiment
  bucketing. Use when the user mentions "feature flag," "feature toggle,"
  "gradual rollout," "canary release," "percentage rollout," "kill switch,"
  "user bucketing," "experiment assignment," or "dark launch." Covers flag
  evaluation, deterministic user assignment, targeting rules, and flag lifecycle
  management. For experiment design, see ab-test-setup. For event tracking,
  see analytics-tracking.
license: Apache-2.0
compatibility: "Any backend language"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["feature-flags", "rollout", "experimentation", "deployment"]
---

# Feature Flag Manager

## Overview

Implements feature flag systems for controlled rollouts and A/B testing. Covers flag definition, deterministic user bucketing (same user always sees the same variant), attribute-based targeting, percentage rollouts, and flag lifecycle management. Builds self-hosted solutions — no third-party dependencies.

## Instructions

### 1. Flag Definition Schema

```typescript
interface FeatureFlag {
  key: string;              // "checkout-redesign"
  type: 'boolean' | 'multivariate';
  enabled: boolean;         // Global kill switch
  variants: string[];       // ["control", "new-checkout"]
  allocation: number[];     // [50, 50] — percentage per variant
  targeting?: TargetingRule[];
  createdAt: Date;
  updatedAt: Date;
}

interface TargetingRule {
  attribute: string;        // "plan", "country", "signupDate"
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains';
  values: any[];
  allocation?: number[];    // Override allocation for this segment
}
```

Store flags in database with in-memory cache (refresh every 30 seconds or on webhook).

### 2. Deterministic Bucketing

Use MurmurHash3 for stable, uniform distribution:

```typescript
import murmurhash from 'murmurhash';

function assignVariant(flagKey: string, userId: string, variants: string[], allocation: number[]): string {
  const hash = murmurhash.v3(flagKey + ':' + userId);
  const bucket = hash % 10000; // 0-9999 for 0.01% granularity
  
  let cumulative = 0;
  for (let i = 0; i < variants.length; i++) {
    cumulative += allocation[i] * 100; // Convert percentage to basis points
    if (bucket < cumulative) return variants[i];
  }
  return variants[0]; // Fallback to first variant
}
```

Properties:
- **Deterministic**: Same user + same flag = same variant, always
- **Independent**: Different flags produce independent assignments
- **Uniform**: MurmurHash3 distributes evenly across buckets
- **Stable on resize**: Changing 50/50 to 70/30 keeps most users in their original bucket

### 3. Flag Evaluation Pipeline

```
evaluateFlag(flagKey, userId, userAttributes):
  1. Load flag config from cache
  2. If flag.enabled === false → return default variant (control)
  3. Check targeting rules in order:
     - If user matches a rule → use that rule's allocation
     - If no rules match → use default allocation
  4. Compute bucket via deterministic hash
  5. Map bucket to variant via allocation percentages
  6. Log assignment event (for analytics)
  7. Return variant name
```

### 4. Server-Side Integration

```typescript
// Express middleware — evaluate all active flags per request
app.use((req, res, next) => {
  const userId = req.user?.id || req.cookies.anonymousId;
  const attributes = {
    plan: req.user?.plan,
    country: req.headers['cf-ipcountry'],
    signupDate: req.user?.createdAt,
  };
  req.flags = evaluateAllFlags(userId, attributes);
  next();
});

// In route handler
app.get('/checkout', (req, res) => {
  if (req.flags['checkout-redesign'] === 'new-checkout') {
    return renderNewCheckout(req, res);
  }
  return renderCurrentCheckout(req, res);
});
```

### 5. Flag Lifecycle

```
1. CREATED — Flag defined, enabled=false, no traffic
2. TESTING — Enabled for internal users via targeting (email contains @company.com)
3. RAMPING — Gradual rollout: 5% → 25% → 50% → 100%
4. DECIDED — Experiment concluded, winner at 100%
5. ARCHIVED — Flag code removed, config kept for audit trail
```

Track lifecycle in database. Alert when flags are in DECIDED state for > 14 days (cleanup reminder).

### 6. Admin API

```
GET    /api/flags                    — List all flags
POST   /api/flags                    — Create flag
PATCH  /api/flags/:key               — Update allocation/targeting
PATCH  /api/flags/:key/toggle        — Enable/disable (kill switch)
GET    /api/flags/:key/assignments   — View user distribution
DELETE /api/flags/:key               — Archive flag
```

## Examples

### Example 1: Boolean Feature Flag

**Prompt**: "Add a feature flag for our new search bar. Roll out to 10% of users first."

**Output**: Flag definition with boolean type, 90/10 allocation, evaluation middleware, and admin toggle endpoint.

### Example 2: Multi-Variant Experiment

**Prompt**: "Test three pricing page layouts: current, simplified, and detailed. Only for US users on free plan."

**Output**: Multivariate flag with targeting rules (country=US, plan=free), three-way allocation (34/33/33), bucketing implementation, and assignment logging for analytics.

## Guidelines

- **Always use server-side evaluation** — client-side flags leak experiment details and flicker
- **Hash with experiment key** — ensures independent randomization across experiments
- **Cache flag configs** — don't query database on every request; 30s TTL is fine
- **Log every assignment** — needed for experiment analysis; include flag, variant, userId, timestamp
- **Build a kill switch** — `enabled: false` must immediately disable the flag globally
- **Clean up old flags** — stale flags become tech debt; alert after 14 days post-decision
- **Test the bucketing** — verify distribution is uniform with 10K+ simulated users before shipping
- **Support anonymous users** — use a cookie-based anonymous ID for pre-login bucketing
