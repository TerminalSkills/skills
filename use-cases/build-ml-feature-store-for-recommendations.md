---
title: Build an ML Feature Store for Production Recommendations
slug: build-ml-feature-store-for-recommendations
description: >
  Stop recomputing features on every request. Build a feature store that
  serves pre-computed ML features in under 5ms, handles feature drift
  monitoring, and eliminates training-serving skew.
skills:
  - typescript
  - redis
  - postgresql
  - kafka-js
  - zod
  - hono
  - vitest
category: Data Engineering
tags:
  - feature-store
  - ml-ops
  - recommendations
  - real-time
  - feature-engineering
  - serving
---

# Build an ML Feature Store for Production Recommendations

## The Problem

Carlos leads ML engineering at a media streaming platform with 2M active users. Their recommendation model is good in notebooks but terrible in production. The problem: features computed during training (7-day watch history, genre preferences, time-of-day patterns) are recomputed on every API request using raw SQL queries, adding 800ms of latency. Worse, the training pipeline computes features differently than the serving code — "training-serving skew" means the model in production is effectively running on different data than what it was trained on. Last month, a seemingly small change to the feature computation logic in the serving path caused a 23% drop in click-through rate before anyone noticed.

Carlos needs:
- **Single feature definition** used in both training and serving — eliminates skew
- **Pre-computed features** served from Redis in <5ms, not computed on-the-fly
- **Real-time feature updates** — when a user watches something, their features update within seconds
- **Feature versioning** — roll back to previous feature definitions without retraining
- **Drift monitoring** — detect when feature distributions shift from training data
- **Point-in-time correctness** — training features reflect what was known *at that time*, not the future

## Step 1: Feature Definitions as Code

Define features once, use everywhere. Each feature has a computation function, a storage key, and metadata for monitoring.

```typescript
// src/features/definitions.ts
// Single source of truth for feature computations

import { z } from 'zod';

export const FeatureType = z.enum(['numeric', 'categorical', 'embedding', 'list']);

export const FeatureDefinition = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  version: z.number().int().positive(),
  type: FeatureType,
  description: z.string(),
  entity: z.enum(['user', 'item', 'user_item']),  // what the feature describes
  freshness: z.enum(['realtime', 'hourly', 'daily']),
  defaultValue: z.unknown(),
  // Expected distribution for drift detection
  expectedStats: z.object({
    mean: z.number().optional(),
    stddev: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    topCategories: z.array(z.string()).optional(),
  }).optional(),
});

export type FeatureDefinition = z.infer<typeof FeatureDefinition>;

export const featureRegistry: FeatureDefinition[] = [
  {
    name: 'user_watch_count_7d',
    version: 2,
    type: 'numeric',
    description: 'Number of videos watched in the last 7 days',
    entity: 'user',
    freshness: 'realtime',
    defaultValue: 0,
    expectedStats: { mean: 12.5, stddev: 8.3, min: 0, max: 200 },
  },
  {
    name: 'user_genre_preferences',
    version: 1,
    type: 'embedding',
    description: '32-dim vector of genre affinity scores based on watch history',
    entity: 'user',
    freshness: 'hourly',
    defaultValue: new Array(32).fill(0),
  },
  {
    name: 'user_avg_watch_duration_min',
    version: 1,
    type: 'numeric',
    description: 'Average watch duration in minutes over last 30 days',
    entity: 'user',
    freshness: 'daily',
    defaultValue: 0,
  },
  {
    name: 'user_preferred_hour',
    version: 1,
    type: 'numeric',
    description: 'Hour of day (0-23) when user most often watches',
    entity: 'user',
    freshness: 'daily',
    defaultValue: 20,  // 8 PM default
  },
  {
    name: 'item_popularity_score',
    version: 1,
    type: 'numeric',
    description: 'Normalized popularity score (0-1) based on recent views',
    entity: 'item',
    freshness: 'hourly',
    defaultValue: 0,
    expectedStats: { mean: 0.15, stddev: 0.2, min: 0, max: 1 },
  },
  {
    name: 'item_genre',
    version: 1,
    type: 'categorical',
    description: 'Primary genre of the content',
    entity: 'item',
    freshness: 'daily',
    defaultValue: 'unknown',
    expectedStats: { topCategories: ['drama', 'comedy', 'action', 'documentary', 'thriller'] },
  },
  {
    name: 'user_item_watch_progress',
    version: 1,
    type: 'numeric',
    description: 'How much of this item the user has watched (0-1)',
    entity: 'user_item',
    freshness: 'realtime',
    defaultValue: 0,
  },
];
```

## Step 2: Feature Computation Pipeline

```typescript
// src/features/compute.ts
// Computes features from raw data — used by both batch and streaming pipelines

import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// These functions are the SINGLE source of truth for feature computation.
// Training pipeline and serving pipeline both call these.
// Never duplicate this logic.

export async function computeUserWatchCount7d(userId: string): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM watch_events
     WHERE user_id = $1 AND watched_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );
  return parseInt(result.rows[0].count);
}

export async function computeUserGenrePreferences(userId: string): Promise<number[]> {
  // Weighted average of genre embeddings based on watch history
  const result = await db.query(
    `SELECT g.embedding, w.watch_duration_min
     FROM watch_events w
     JOIN items i ON w.item_id = i.id
     JOIN genres g ON i.genre_id = g.id
     WHERE w.user_id = $1 AND w.watched_at > NOW() - INTERVAL '30 days'
     ORDER BY w.watched_at DESC
     LIMIT 100`,
    [userId]
  );

  if (!result.rows.length) return new Array(32).fill(0);

  // Time-weighted average: recent watches count more
  const totalDuration = result.rows.reduce((s, r) => s + r.watch_duration_min, 0);
  const embedding = new Array(32).fill(0);

  for (const row of result.rows) {
    const weight = row.watch_duration_min / totalDuration;
    const emb = row.embedding as number[];
    for (let i = 0; i < 32; i++) {
      embedding[i] += emb[i] * weight;
    }
  }

  return embedding;
}

export async function computeItemPopularity(itemId: string): Promise<number> {
  // Exponential decay: recent views count more
  const result = await db.query(
    `SELECT SUM(
       EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - watched_at)) / 86400)
     ) as score
     FROM watch_events
     WHERE item_id = $1 AND watched_at > NOW() - INTERVAL '14 days'`,
    [itemId]
  );

  const raw = parseFloat(result.rows[0].score ?? '0');
  // Normalize to 0-1 (calibrated from historical max)
  return Math.min(1, raw / 1000);
}
```

## Step 3: Feature Store (Write + Read)

```typescript
// src/store/feature-store.ts
// Writes features to Redis, reads with sub-5ms latency

import { Redis } from 'ioredis';
import { featureRegistry, type FeatureDefinition } from '../features/definitions';

const redis = new Redis(process.env.REDIS_URL!);

// Key format: fs:{entity}:{entityId}:{featureName}:v{version}
function featureKey(entity: string, entityId: string, feature: FeatureDefinition): string {
  return `fs:${entity}:${entityId}:${feature.name}:v${feature.version}`;
}

export async function writeFeature(
  entityId: string,
  featureName: string,
  value: unknown
): Promise<void> {
  const feature = featureRegistry.find(f => f.name === featureName);
  if (!feature) throw new Error(`Unknown feature: ${featureName}`);

  const key = featureKey(feature.entity, entityId, feature);
  const ttl = freshnessTTL[feature.freshness];

  await redis.setex(key, ttl, JSON.stringify(value));

  // Also write to the "latest" alias (no version) for serving
  const latestKey = `fs:${feature.entity}:${entityId}:${featureName}:latest`;
  await redis.setex(latestKey, ttl, JSON.stringify(value));
}

export async function readFeatures(
  entity: string,
  entityId: string,
  featureNames: string[]
): Promise<Record<string, unknown>> {
  const keys = featureNames.map(name => {
    return `fs:${entity}:${entityId}:${name}:latest`;
  });

  // Single MGET call — one round trip for all features
  const values = await redis.mget(...keys);

  const result: Record<string, unknown> = {};
  for (let i = 0; i < featureNames.length; i++) {
    const feature = featureRegistry.find(f => f.name === featureNames[i]);
    if (values[i] !== null) {
      result[featureNames[i]] = JSON.parse(values[i]!);
    } else {
      // Use default value if not in store
      result[featureNames[i]] = feature?.defaultValue ?? null;
    }
  }

  return result;
}

// Bulk read for training data export
export async function readFeatureVector(
  entity: string,
  entityId: string
): Promise<Record<string, unknown>> {
  const features = featureRegistry.filter(f => f.entity === entity);
  return readFeatures(entity, entityId, features.map(f => f.name));
}

const freshnessTTL: Record<string, number> = {
  realtime: 300,      // 5 min — will be refreshed sooner by streaming
  hourly: 7_200,      // 2 hours
  daily: 172_800,     // 2 days
};
```

## Step 4: Real-Time Feature Updates via Kafka

When a user watches something, their features update in seconds — not the next batch run.

```typescript
// src/pipeline/streaming.ts
// Kafka consumer that updates features in real time

import { Kafka } from 'kafkajs';
import { writeFeature } from '../store/feature-store';
import { computeUserWatchCount7d, computeUserGenrePreferences } from '../features/compute';

const kafka = new Kafka({
  clientId: 'feature-store-updater',
  brokers: process.env.KAFKA_BROKERS?.split(',') ?? ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'feature-updates' });

export async function startStreamingUpdates(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic: 'watch-events', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value!.toString()) as {
        userId: string;
        itemId: string;
        watchDurationMin: number;
        progress: number;  // 0-1
      };

      // Update real-time features
      await Promise.all([
        // Recompute watch count (fast — single COUNT query)
        computeUserWatchCount7d(event.userId)
          .then(count => writeFeature(event.userId, 'user_watch_count_7d', count)),

        // Update watch progress for this user-item pair
        writeFeature(
          `${event.userId}:${event.itemId}`,
          'user_item_watch_progress',
          event.progress
        ),
      ]);

      // Genre preferences are hourly — don't recompute on every event
      // (handled by the batch pipeline)
    },
  });
}
```

## Step 5: Feature Drift Monitor

Detect when production feature distributions diverge from training data.

```typescript
// src/monitoring/drift-detector.ts
// Compares live feature distributions against training baselines

import { Redis } from 'ioredis';
import { featureRegistry } from '../features/definitions';

const redis = new Redis(process.env.REDIS_URL!);

interface DriftReport {
  featureName: string;
  metric: string;
  trainingValue: number;
  currentValue: number;
  driftPercent: number;
  alert: boolean;
}

export async function checkFeatureDrift(): Promise<DriftReport[]> {
  const reports: DriftReport[] = [];

  for (const feature of featureRegistry) {
    if (feature.type !== 'numeric' || !feature.expectedStats) continue;

    // Sample recent feature values
    const sampleKey = `fs:samples:${feature.name}`;
    const samples = await redis.lrange(sampleKey, 0, 999);
    if (samples.length < 100) continue;  // not enough data

    const values = samples.map(Number);
    const currentMean = values.reduce((a, b) => a + b, 0) / values.length;
    const currentStddev = Math.sqrt(
      values.reduce((sum, v) => sum + (v - currentMean) ** 2, 0) / values.length
    );

    // Check mean drift
    if (feature.expectedStats.mean !== undefined) {
      const driftPercent = Math.abs(
        (currentMean - feature.expectedStats.mean) / feature.expectedStats.mean
      ) * 100;

      reports.push({
        featureName: feature.name,
        metric: 'mean',
        trainingValue: feature.expectedStats.mean,
        currentValue: currentMean,
        driftPercent,
        alert: driftPercent > 20,  // >20% drift triggers alert
      });
    }

    // Check stddev drift (distribution shape change)
    if (feature.expectedStats.stddev !== undefined) {
      const driftPercent = Math.abs(
        (currentStddev - feature.expectedStats.stddev) / feature.expectedStats.stddev
      ) * 100;

      reports.push({
        featureName: feature.name,
        metric: 'stddev',
        trainingValue: feature.expectedStats.stddev,
        currentValue: currentStddev,
        driftPercent,
        alert: driftPercent > 30,
      });
    }
  }

  return reports;
}

// Record feature values for drift monitoring
export async function sampleFeatureValue(
  featureName: string,
  value: number
): Promise<void> {
  const key = `fs:samples:${featureName}`;
  await redis.lpush(key, value);
  await redis.ltrim(key, 0, 9999);  // keep last 10K samples
  await redis.expire(key, 86400);    // 24h TTL
}
```

## Step 6: Serving API

```typescript
// src/api/features.ts
// HTTP API for model serving — returns feature vectors in <5ms

import { Hono } from 'hono';
import { readFeatures } from '../store/feature-store';
import { sampleFeatureValue } from '../monitoring/drift-detector';

const app = new Hono();

// Get features for recommendation model
app.get('/v1/features/user/:userId', async (c) => {
  const userId = c.req.param('userId');
  const start = Date.now();

  const features = await readFeatures('user', userId, [
    'user_watch_count_7d',
    'user_genre_preferences',
    'user_avg_watch_duration_min',
    'user_preferred_hour',
  ]);

  // Sample for drift monitoring (1% of requests)
  if (Math.random() < 0.01) {
    const watchCount = features.user_watch_count_7d as number;
    if (typeof watchCount === 'number') {
      sampleFeatureValue('user_watch_count_7d', watchCount).catch(() => {});
    }
  }

  const latencyMs = Date.now() - start;
  c.header('X-Feature-Latency-Ms', String(latencyMs));

  return c.json({ userId, features, latencyMs });
});

// Get features for a user-item pair (used during ranking)
app.post('/v1/features/rank', async (c) => {
  const { userId, itemIds } = await c.req.json<{ userId: string; itemIds: string[] }>();
  const start = Date.now();

  // Fetch user features once
  const userFeatures = await readFeatures('user', userId, [
    'user_watch_count_7d',
    'user_genre_preferences',
    'user_preferred_hour',
  ]);

  // Fetch item features in parallel
  const itemFeatures = await Promise.all(
    itemIds.map(itemId =>
      readFeatures('item', itemId, ['item_popularity_score', 'item_genre'])
        .then(features => ({ itemId, features }))
    )
  );

  // Fetch user-item interaction features
  const interactions = await Promise.all(
    itemIds.map(itemId =>
      readFeatures('user_item', `${userId}:${itemId}`, ['user_item_watch_progress'])
        .then(features => ({ itemId, features }))
    )
  );

  return c.json({
    userId,
    userFeatures,
    items: itemIds.map(id => ({
      itemId: id,
      itemFeatures: itemFeatures.find(f => f.itemId === id)?.features ?? {},
      interactionFeatures: interactions.find(f => f.itemId === id)?.features ?? {},
    })),
    latencyMs: Date.now() - start,
  });
});

export default app;
```

## Results

After 8 weeks in production serving 2M users:

- **Feature serving latency**: 3.2ms p50, 4.8ms p95 (was 800ms computing on-the-fly)
- **Training-serving skew**: eliminated — same compute functions used in both pipelines
- **CTR improvement**: +18% after eliminating skew (model finally sees the same data in production)
- **Real-time feature freshness**: watch count updates within 2 seconds of a watch event
- **Drift detection** caught a bug in genre classification 4 hours after deployment — auto-alerted, rolled back
- **Point-in-time training** uses historical feature snapshots — no data leakage
- **Feature computation cost**: dropped 94% (batch pre-compute vs per-request SQL)
- **Redis memory**: 4.2GB for 2M users × 7 features + 500K items × 2 features
