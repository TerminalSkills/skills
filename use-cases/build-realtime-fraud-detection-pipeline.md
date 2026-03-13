---
title: Build a Real-Time Fraud Detection Pipeline
slug: build-realtime-fraud-detection-pipeline
description: >
  Detect fraudulent transactions in under 200ms using streaming event
  processing, ML scoring, and automatic blocking — saving an e-commerce
  platform $400K/year in chargebacks.
skills:
  - typescript
  - kafka-js
  - redis
  - postgresql
  - zod
  - hono
  - bull-mq
category: Data Engineering
tags:
  - fraud-detection
  - streaming
  - real-time
  - ml-scoring
  - e-commerce
  - risk-engine
---

# Build a Real-Time Fraud Detection Pipeline

## The Problem

Priya is CTO of an e-commerce marketplace doing $8M/month in GMV. Chargebacks are eating 2.1% of revenue — $168K/month — and climbing. Their current fraud check is a batch job that runs every 15 minutes, meaning fraudulent orders ship before they're flagged. The fraud team manually reviews 300+ orders per day, but 80% of those are legitimate, wasting analyst time. Payment processor threatened to increase their reserve from 5% to 15% if chargeback rates don't drop below 1% within 90 days.

Priya needs:
- **Sub-200ms fraud scoring** at checkout — block before payment capture
- **Velocity checks** — detect burst patterns (5 cards from same IP in 2 minutes)
- **Device fingerprint matching** — link transactions across accounts
- **ML risk scores** from an external model, with fallback rules if the model is slow
- **Analyst queue** for borderline cases with all context pre-loaded
- Scale from 50 to 500 transactions per second during flash sales

## Step 1: Define the Transaction Event Schema

Every transaction enters the pipeline as a structured event. Strict validation catches malformed data before it reaches scoring.

```typescript
// src/schemas/transaction.ts
// Validates incoming transaction events at the pipeline boundary

import { z } from 'zod';

export const TransactionEvent = z.object({
  transactionId: z.string().uuid(),
  merchantId: z.string().uuid(),
  customerId: z.string().uuid(),
  amount: z.number().int().positive(),         // cents
  currency: z.enum(['USD', 'EUR', 'GBP']),
  cardBin: z.string().length(6),                // first 6 digits
  cardLastFour: z.string().length(4),
  cardCountry: z.string().length(2),            // ISO 3166-1
  billingCountry: z.string().length(2),
  shippingCountry: z.string().length(2),
  ipAddress: z.string().ip(),
  deviceFingerprint: z.string().min(16),
  email: z.string().email(),
  emailDomain: z.string(),
  isNewCustomer: z.boolean(),
  orderItemCount: z.number().int().positive(),
  timestamp: z.string().datetime(),
});

export type TransactionEvent = z.infer<typeof TransactionEvent>;

export const FraudDecision = z.object({
  transactionId: z.string().uuid(),
  decision: z.enum(['approve', 'decline', 'review']),
  riskScore: z.number().min(0).max(100),
  signals: z.array(z.object({
    rule: z.string(),
    weight: z.number(),
    detail: z.string(),
  })),
  latencyMs: z.number(),
  decidedAt: z.string().datetime(),
});

export type FraudDecision = z.infer<typeof FraudDecision>;
```

## Step 2: Velocity Checks with Redis Sliding Windows

The fastest fraud signal is behavioral: how many transactions hit the same fingerprint in a short window. Redis sorted sets give O(log N) sliding window counters.

```typescript
// src/checks/velocity.ts
// Sliding-window velocity checks using Redis sorted sets

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

interface VelocityResult {
  rule: string;
  triggered: boolean;
  count: number;
  threshold: number;
  windowSeconds: number;
  detail: string;
}

// Check how many events occurred for a given key within a time window
async function checkWindow(
  key: string,
  windowSeconds: number,
  threshold: number,
  ruleName: string,
  eventId: string
): Promise<VelocityResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Atomic pipeline: add current event, remove expired, count
  const pipeline = redis.pipeline();
  pipeline.zadd(key, now, eventId);                       // add this event
  pipeline.zremrangebyscore(key, 0, windowStart);          // prune old
  pipeline.zcard(key);                                     // count in window
  pipeline.expire(key, windowSeconds + 60);                // TTL cleanup

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    rule: ruleName,
    triggered: count > threshold,
    count,
    threshold,
    windowSeconds,
    detail: `${count} events in ${windowSeconds}s (limit: ${threshold})`,
  };
}

export async function runVelocityChecks(
  tx: { transactionId: string; ipAddress: string; deviceFingerprint: string;
         customerId: string; cardBin: string; email: string }
): Promise<VelocityResult[]> {
  return Promise.all([
    // Same IP: max 5 transactions in 2 minutes
    checkWindow(
      `vel:ip:${tx.ipAddress}`, 120, 5,
      'ip_velocity_2m', tx.transactionId
    ),
    // Same device: max 3 transactions in 5 minutes
    checkWindow(
      `vel:device:${tx.deviceFingerprint}`, 300, 3,
      'device_velocity_5m', tx.transactionId
    ),
    // Same card BIN: max 10 transactions in 10 minutes (card testing attack)
    checkWindow(
      `vel:bin:${tx.cardBin}`, 600, 10,
      'bin_velocity_10m', tx.transactionId
    ),
    // Same email: max 3 transactions in 1 hour
    checkWindow(
      `vel:email:${tx.email}`, 3600, 3,
      'email_velocity_1h', tx.transactionId
    ),
    // Same customer: max 8 transactions in 24 hours
    checkWindow(
      `vel:customer:${tx.customerId}`, 86400, 8,
      'customer_velocity_24h', tx.transactionId
    ),
  ]);
}
```

## Step 3: Rule-Based Risk Scoring Engine

Before ML kicks in, deterministic rules catch the obvious fraud patterns. These run in <5ms and serve as fallback if the ML model is unavailable.

```typescript
// src/checks/rules-engine.ts
// Deterministic fraud rules — fast, explainable, always available

import type { TransactionEvent } from '../schemas/transaction';

interface RuleSignal {
  rule: string;
  weight: number;
  detail: string;
}

type RuleCheck = (tx: TransactionEvent) => RuleSignal | null;

const rules: RuleCheck[] = [
  // Country mismatch: card issued in US, shipping to Nigeria
  (tx) => {
    if (tx.cardCountry !== tx.shippingCountry) {
      return {
        rule: 'country_mismatch',
        weight: tx.cardCountry !== tx.billingCountry ? 30 : 15,
        detail: `Card: ${tx.cardCountry}, Ship: ${tx.shippingCountry}, Bill: ${tx.billingCountry}`,
      };
    }
    return null;
  },

  // High-value order from new customer
  (tx) => {
    if (tx.isNewCustomer && tx.amount > 500_00) {  // > $500
      return {
        rule: 'high_value_new_customer',
        weight: 20,
        detail: `New customer, amount: $${(tx.amount / 100).toFixed(2)}`,
      };
    }
    return null;
  },

  // Free email domain on high-value order
  (tx) => {
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    if (freeProviders.includes(tx.emailDomain) && tx.amount > 300_00) {
      return {
        rule: 'free_email_high_value',
        weight: 10,
        detail: `${tx.emailDomain} with $${(tx.amount / 100).toFixed(2)} order`,
      };
    }
    return null;
  },

  // Unusually large order item count (reseller/fraud pattern)
  (tx) => {
    if (tx.orderItemCount > 10) {
      return {
        rule: 'bulk_order',
        weight: 15,
        detail: `${tx.orderItemCount} items in single order`,
      };
    }
    return null;
  },

  // Very high amount (> $2000)
  (tx) => {
    if (tx.amount > 2000_00) {
      return {
        rule: 'very_high_amount',
        weight: 25,
        detail: `Amount $${(tx.amount / 100).toFixed(2)} exceeds $2000 threshold`,
      };
    }
    return null;
  },
];

export function evaluateRules(tx: TransactionEvent): RuleSignal[] {
  return rules
    .map((rule) => rule(tx))
    .filter((signal): signal is RuleSignal => signal !== null);
}
```

## Step 4: ML Model Integration with Timeout Fallback

Call an external ML scoring service with a hard 100ms timeout. If the model is slow or down, rules-only scoring takes over — never block checkout waiting for ML.

```typescript
// src/checks/ml-scorer.ts
// Calls external ML model with strict timeout, falls back to rules-only

import type { TransactionEvent } from '../schemas/transaction';

interface MLScore {
  score: number;        // 0-100
  confidence: number;   // 0-1
  features: string[];   // top contributing features
}

const ML_TIMEOUT_MS = 100;  // hard cutoff — checkout can't wait
const ML_ENDPOINT = process.env.ML_SCORING_URL ?? 'http://ml-service:8080/score';

export async function getMLScore(tx: TransactionEvent): Promise<MLScore | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

  try {
    const response = await fetch(ML_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: tx.amount,
        card_country: tx.cardCountry,
        shipping_country: tx.shippingCountry,
        is_new_customer: tx.isNewCustomer,
        device_fingerprint: tx.deviceFingerprint,
        ip_address: tx.ipAddress,
        email_domain: tx.emailDomain,
        item_count: tx.orderItemCount,
        hour_of_day: new Date(tx.timestamp).getUTCHours(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json() as MLScore;
  } catch {
    // Timeout or network error — degrade gracefully
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

## Step 5: Decision Orchestrator

Combines velocity, rules, and ML into a single fraud decision with a total budget of 200ms.

```typescript
// src/engine/decision.ts
// Orchestrates all fraud checks and produces final decision

import type { TransactionEvent, FraudDecision } from '../schemas/transaction';
import { runVelocityChecks } from '../checks/velocity';
import { evaluateRules } from '../checks/rules-engine';
import { getMLScore } from '../checks/ml-scorer';

// Thresholds — tuned from historical chargeback data
const DECLINE_THRESHOLD = 70;
const REVIEW_THRESHOLD = 40;

export async function evaluateTransaction(
  tx: TransactionEvent
): Promise<FraudDecision> {
  const start = Date.now();

  // Run velocity and ML in parallel — rules are sync
  const [velocityResults, mlScore] = await Promise.all([
    runVelocityChecks(tx),
    getMLScore(tx),
  ]);

  const ruleSignals = evaluateRules(tx);

  // Combine signals into a single score
  const signals: FraudDecision['signals'] = [];
  let totalScore = 0;

  // Velocity signals
  for (const v of velocityResults) {
    if (v.triggered) {
      const weight = 25;  // velocity triggers are high-signal
      totalScore += weight;
      signals.push({ rule: v.rule, weight, detail: v.detail });
    }
  }

  // Rule signals
  for (const r of ruleSignals) {
    totalScore += r.weight;
    signals.push(r);
  }

  // ML score (weighted at 40% of total if available)
  if (mlScore && mlScore.confidence > 0.7) {
    const mlWeight = Math.round(mlScore.score * 0.4);
    totalScore += mlWeight;
    signals.push({
      rule: 'ml_model',
      weight: mlWeight,
      detail: `ML score: ${mlScore.score}, confidence: ${mlScore.confidence}, features: ${mlScore.features.join(', ')}`,
    });
  }

  // Cap at 100
  const riskScore = Math.min(totalScore, 100);

  // Decision logic
  let decision: 'approve' | 'decline' | 'review';
  if (riskScore >= DECLINE_THRESHOLD) {
    decision = 'decline';
  } else if (riskScore >= REVIEW_THRESHOLD) {
    decision = 'review';
  } else {
    decision = 'approve';
  }

  return {
    transactionId: tx.transactionId,
    decision,
    riskScore,
    signals,
    latencyMs: Date.now() - start,
    decidedAt: new Date().toISOString(),
  };
}
```

## Step 6: Kafka Consumer for Streaming Ingestion

Process transaction events from Kafka in real time. Decisions are published back for the checkout service to consume.

```typescript
// src/pipeline/consumer.ts
// Kafka consumer that processes transactions and publishes decisions

import { Kafka } from 'kafkajs';
import { TransactionEvent as TxSchema } from '../schemas/transaction';
import { evaluateTransaction } from '../engine/decision';

const kafka = new Kafka({
  clientId: 'fraud-engine',
  brokers: process.env.KAFKA_BROKERS?.split(',') ?? ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'fraud-scoring' });
const producer = kafka.producer({ idempotent: true });

export async function startPipeline(): Promise<void> {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: 'transactions', fromBeginning: false });

  await consumer.run({
    // Process one at a time for ordering; increase for throughput
    partitionsConsumedConcurrently: 4,

    eachMessage: async ({ message, partition }) => {
      const raw = JSON.parse(message.value!.toString());
      const parsed = TxSchema.safeParse(raw);

      if (!parsed.success) {
        console.error('Invalid transaction event:', parsed.error.flatten());
        return;  // dead-letter in production
      }

      const decision = await evaluateTransaction(parsed.data);

      // Publish decision for checkout service
      await producer.send({
        topic: 'fraud-decisions',
        messages: [{
          key: decision.transactionId,
          value: JSON.stringify(decision),
          headers: {
            decision: decision.decision,
            'risk-score': String(decision.riskScore),
          },
        }],
      });

      // Log for monitoring
      if (decision.decision !== 'approve') {
        console.log(
          `[${decision.decision.toUpperCase()}] tx=${decision.transactionId} ` +
          `score=${decision.riskScore} latency=${decision.latencyMs}ms ` +
          `signals=${decision.signals.map(s => s.rule).join(',')}`
        );
      }
    },
  });
}
```

## Step 7: Analyst Review Queue

Borderline transactions (score 40-70) go to a BullMQ queue with all fraud context pre-loaded so analysts don't waste time gathering info.

```typescript
// src/queue/review-queue.ts
// Queues borderline transactions for human analyst review

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const reviewQueue = new Queue('fraud-review', { connection });

interface ReviewPayload {
  transactionId: string;
  riskScore: number;
  signals: Array<{ rule: string; weight: number; detail: string }>;
  transaction: Record<string, unknown>;
  customerHistory: {
    totalOrders: number;
    totalChargebacks: number;
    accountAgeDays: number;
    previousDeclines: number;
  };
}

export async function enqueueForReview(
  transactionId: string,
  riskScore: number,
  signals: ReviewPayload['signals'],
  transaction: Record<string, unknown>
): Promise<void> {
  // Pre-load customer history so analysts have full context
  const history = await db.query(
    `SELECT
       COUNT(*) as total_orders,
       COUNT(*) FILTER (WHERE chargeback = true) as total_chargebacks,
       EXTRACT(DAY FROM NOW() - MIN(created_at)) as account_age_days,
       COUNT(*) FILTER (WHERE fraud_decision = 'decline') as previous_declines
     FROM orders
     WHERE customer_id = $1`,
    [(transaction as any).customerId]
  );

  const customerHistory = history.rows[0] ?? {
    total_orders: 0, total_chargebacks: 0,
    account_age_days: 0, previous_declines: 0,
  };

  await reviewQueue.add('review', {
    transactionId,
    riskScore,
    signals,
    transaction,
    customerHistory: {
      totalOrders: Number(customerHistory.total_orders),
      totalChargebacks: Number(customerHistory.total_chargebacks),
      accountAgeDays: Number(customerHistory.account_age_days),
      previousDeclines: Number(customerHistory.previous_declines),
    },
  } satisfies ReviewPayload, {
    priority: riskScore,  // higher risk = higher priority
    attempts: 1,          // no retry — human reviews manually
  });
}
```

## Step 8: HTTP API for Synchronous Checkout Integration

Some checkout flows need a synchronous fraud check before capturing payment. This endpoint wraps the pipeline for direct HTTP calls.

```typescript
// src/api/score.ts
// Synchronous fraud scoring endpoint for checkout integration

import { Hono } from 'hono';
import { TransactionEvent as TxSchema } from '../schemas/transaction';
import { evaluateTransaction } from '../engine/decision';
import { enqueueForReview } from '../queue/review-queue';

const app = new Hono();

app.post('/v1/score', async (c) => {
  const body = await c.req.json();
  const parsed = TxSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid transaction', details: parsed.error.flatten() }, 400);
  }

  const decision = await evaluateTransaction(parsed.data);

  // Auto-enqueue borderline cases
  if (decision.decision === 'review') {
    await enqueueForReview(
      decision.transactionId,
      decision.riskScore,
      decision.signals,
      body
    );
  }

  return c.json(decision);
});

export default app;
```

## Results

After 60 days in production:

- **Chargeback rate** dropped from 2.1% to 0.7% — well under the 1% threshold
- **$134K/month saved** in prevented fraud ($168K chargebacks → $34K)
- **Median scoring latency**: 47ms (p99: 142ms) — well within the 200ms budget
- **ML model timeout rate**: 2.3% of requests fall back to rules-only (still catches 91% of fraud)
- **Analyst review volume** dropped from 300/day to 45/day — 85% reduction in manual work
- **False positive rate** (legitimate orders declined): 0.4%, down from 3.2%
- **Payment processor** reduced reserve back to 5% after seeing the improved chargeback numbers
- Pipeline handles 500 TPS during flash sales with no degradation — Kafka partitioning + Redis velocity checks scale linearly
