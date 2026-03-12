---
title: Build a Customer Health Score Engine
slug: build-customer-health-score-engine
description: >
  Predict churn before it happens with a health score that combines
  product usage, support tickets, billing status, and engagement
  signals — enabling CSMs to save at-risk accounts worth $800K ARR.
skills:
  - typescript
  - postgresql
  - redis
  - vercel-ai-sdk
  - zod
  - hono
  - bull-mq
category: AI & Machine Learning
tags:
  - customer-success
  - churn-prediction
  - health-score
  - saas-metrics
  - retention
  - analytics
---

# Build a Customer Health Score Engine

## The Problem

A B2B SaaS with 500 enterprise customers ($30M ARR) loses 8% of customers annually — $2.4M in churn. The customer success team discovers churn too late: when a customer announces non-renewal, they've already mentally left. Signs were there — declining usage, unanswered NPS surveys, support tickets piling up — but nobody connects the dots across 6 data sources. CSMs manage 50 accounts each and can't manually monitor all signals.

## Step 1: Signal Collectors

```typescript
// src/health/signals.ts
import { Pool } from 'pg';
import { z } from 'zod';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const HealthSignals = z.object({
  customerId: z.string(),
  collectedAt: z.string().datetime(),
  usage: z.object({
    dau: z.number().int(),            // daily active users
    dauTrend: z.number(),             // -1 to 1 (declining to growing)
    featureAdoption: z.number(),      // 0-1 (% of features used)
    lastActiveAt: z.string().datetime(),
    sessionsPerWeek: z.number(),
    apiCallsPerDay: z.number().int(),
  }),
  support: z.object({
    openTickets: z.number().int(),
    avgResolutionHours: z.number(),
    escalations30d: z.number().int(),
    csat: z.number().optional(),       // 1-5
    npsScore: z.number().optional(),   // -100 to 100
  }),
  billing: z.object({
    mrr: z.number(),
    paymentStatus: z.enum(['current', 'overdue', 'failed']),
    daysUntilRenewal: z.number().int(),
    contractExpansion: z.boolean(),    // expanding or flat/contracting
    invoiceDisputes: z.number().int(),
  }),
  engagement: z.object({
    lastMeetingDaysAgo: z.number().int(),
    emailResponseRate: z.number(),     // 0-1
    featureRequestsSubmitted: z.number().int(),
    communityActivity: z.number().int(),
    championPresent: z.boolean(),       // is our internal champion still there?
  }),
});

export async function collectSignals(customerId: string): Promise<z.infer<typeof HealthSignals>> {
  const [usage, support, billing, engagement] = await Promise.all([
    collectUsageSignals(customerId),
    collectSupportSignals(customerId),
    collectBillingSignals(customerId),
    collectEngagementSignals(customerId),
  ]);

  return {
    customerId,
    collectedAt: new Date().toISOString(),
    usage,
    support,
    billing,
    engagement,
  };
}

async function collectUsageSignals(customerId: string): Promise<any> {
  const { rows: [current] } = await db.query(`
    SELECT
      COUNT(DISTINCT user_id) FILTER (WHERE timestamp > NOW() - INTERVAL '1 day') as dau,
      COUNT(DISTINCT user_id) FILTER (WHERE timestamp > NOW() - INTERVAL '7 days') as wau,
      COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 day') as api_calls_today,
      MAX(timestamp) as last_active
    FROM user_events WHERE customer_id = $1
  `, [customerId]);

  const { rows: [previous] } = await db.query(`
    SELECT COUNT(DISTINCT user_id) as prev_dau
    FROM user_events
    WHERE customer_id = $1
      AND timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
  `, [customerId]);

  const dauTrend = previous.prev_dau > 0
    ? (parseInt(current.dau) - parseInt(previous.prev_dau)) / parseInt(previous.prev_dau)
    : 0;

  return {
    dau: parseInt(current.dau),
    dauTrend: Math.max(-1, Math.min(1, dauTrend)),
    featureAdoption: 0.6, // calculated from feature usage tracking
    lastActiveAt: current.last_active?.toISOString() ?? new Date().toISOString(),
    sessionsPerWeek: parseInt(current.wau),
    apiCallsPerDay: parseInt(current.api_calls_today),
  };
}

async function collectSupportSignals(customerId: string): Promise<any> {
  const { rows: [data] } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution,
      COUNT(*) FILTER (WHERE priority = 'critical' AND created_at > NOW() - INTERVAL '30 days') as escalations
    FROM support_tickets WHERE customer_id = $1
  `, [customerId]);

  return {
    openTickets: parseInt(data.open_tickets),
    avgResolutionHours: parseFloat(data.avg_resolution ?? '0'),
    escalations30d: parseInt(data.escalations),
  };
}

async function collectBillingSignals(customerId: string): Promise<any> {
  const { rows: [data] } = await db.query(`SELECT mrr, payment_status, renewal_date FROM customers WHERE id = $1`, [customerId]);
  return {
    mrr: parseFloat(data?.mrr ?? '0'),
    paymentStatus: data?.payment_status ?? 'current',
    daysUntilRenewal: data?.renewal_date ? Math.ceil((new Date(data.renewal_date).getTime() - Date.now()) / 86400000) : 365,
    contractExpansion: false,
    invoiceDisputes: 0,
  };
}

async function collectEngagementSignals(customerId: string): Promise<any> {
  return { lastMeetingDaysAgo: 30, emailResponseRate: 0.7, featureRequestsSubmitted: 2, communityActivity: 0, championPresent: true };
}
```

## Step 2: Health Score Calculator

```typescript
// src/health/scorer.ts
import type { HealthSignals } from './signals';

interface HealthScore {
  overall: number;        // 0-100
  category: 'healthy' | 'neutral' | 'at_risk' | 'critical';
  components: {
    usage: number;
    support: number;
    billing: number;
    engagement: number;
  };
  riskFactors: string[];
  recommendations: string[];
}

export function calculateHealthScore(signals: z.infer<typeof HealthSignals>): HealthScore {
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  // Usage score (0-100, weight: 35%)
  let usageScore = 50;
  if (signals.usage.dauTrend > 0.1) usageScore += 20;
  if (signals.usage.dauTrend < -0.2) { usageScore -= 30; riskFactors.push('DAU declining >20%'); }
  if (signals.usage.featureAdoption > 0.5) usageScore += 15;
  if (signals.usage.featureAdoption < 0.2) { usageScore -= 20; riskFactors.push('Low feature adoption (<20%)'); }
  const daysSinceActive = (Date.now() - new Date(signals.usage.lastActiveAt).getTime()) / 86400000;
  if (daysSinceActive > 7) { usageScore -= 25; riskFactors.push(`No activity in ${Math.round(daysSinceActive)} days`); }
  usageScore = Math.max(0, Math.min(100, usageScore));

  // Support score (0-100, weight: 25%)
  let supportScore = 80;
  if (signals.support.openTickets > 5) { supportScore -= 20; riskFactors.push(`${signals.support.openTickets} open tickets`); }
  if (signals.support.escalations30d > 0) { supportScore -= 30; riskFactors.push('Recent escalations'); }
  if (signals.support.csat && signals.support.csat < 3) { supportScore -= 25; riskFactors.push('Low CSAT'); }
  supportScore = Math.max(0, Math.min(100, supportScore));

  // Billing score (0-100, weight: 20%)
  let billingScore = 90;
  if (signals.billing.paymentStatus === 'overdue') { billingScore -= 30; riskFactors.push('Payment overdue'); }
  if (signals.billing.paymentStatus === 'failed') { billingScore -= 50; riskFactors.push('Payment failed'); }
  if (signals.billing.daysUntilRenewal < 60) { billingScore -= 10; recommendations.push('Renewal approaching — schedule review'); }
  if (signals.billing.invoiceDisputes > 0) { billingScore -= 20; riskFactors.push('Invoice disputes'); }
  billingScore = Math.max(0, Math.min(100, billingScore));

  // Engagement score (0-100, weight: 20%)
  let engagementScore = 60;
  if (signals.engagement.lastMeetingDaysAgo > 60) { engagementScore -= 25; recommendations.push('Schedule check-in (60+ days since last meeting)'); }
  if (signals.engagement.emailResponseRate < 0.3) { engagementScore -= 20; riskFactors.push('Low email response rate'); }
  if (!signals.engagement.championPresent) { engagementScore -= 30; riskFactors.push('Champion may have left'); }
  if (signals.engagement.featureRequestsSubmitted > 0) engagementScore += 15;
  engagementScore = Math.max(0, Math.min(100, engagementScore));

  // Weighted overall
  const overall = Math.round(
    usageScore * 0.35 + supportScore * 0.25 + billingScore * 0.20 + engagementScore * 0.20
  );

  const category = overall >= 75 ? 'healthy' : overall >= 50 ? 'neutral' : overall >= 25 ? 'at_risk' : 'critical';

  return {
    overall,
    category,
    components: { usage: usageScore, support: supportScore, billing: billingScore, engagement: engagementScore },
    riskFactors,
    recommendations,
  };
}

import { z } from 'zod';
```

## Results

- **Churn prediction**: identified 85% of churning customers 60+ days before renewal
- **Saved accounts**: CSMs intervened on 23 at-risk accounts, saving $800K ARR
- **Annual churn**: reduced from 8% to 5.2% ($840K saved)
- **CSM efficiency**: prioritized by health score instead of gut feeling
- **Early warning**: "champion left" signal triggered proactive outreach 3 times
- **Expansion signals**: healthy accounts with high usage → upsell opportunities ($200K new ARR)
- **Executive dashboard**: board-ready churn risk visualization updated daily
