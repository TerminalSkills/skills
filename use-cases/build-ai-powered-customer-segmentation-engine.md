---
title: Build an AI-Powered Customer Segmentation Engine
slug: build-ai-powered-customer-segmentation-engine
description: Build a customer segmentation system that uses embeddings and clustering to automatically discover user segments from behavioral data, enabling targeted marketing and product decisions.
skills:
  - typescript
  - openai
  - postgresql
  - redis
  - hono
category: data-ai
tags:
  - segmentation
  - clustering
  - ai
  - marketing
  - analytics
---

# Build an AI-Powered Customer Segmentation Engine

## The Problem

Anya leads growth at a 35-person SaaS with 25,000 users. Marketing sends the same email to everyone because they only have two segments: "free" and "paid." The email open rate is 12% and click-through is 1.8%. Product decisions are based on averages that represent nobody — the "average user" sessions/week is 3.2, but in reality half the users log in 8+ times weekly and half haven't logged in for a month. The sales team wastes time chasing leads that look identical on paper but have completely different needs. AI-powered segmentation from actual behavioral data would reveal natural user clusters and enable targeted engagement that could lift conversion by 40%.

## Step 1: Build the Behavioral Feature Extractor

The system extracts behavioral features from raw event data — login frequency, feature usage, engagement patterns. These features become the input for clustering.

```typescript
// src/features/extractor.ts — Extract behavioral features from user event data
import { pool } from "../db";

export interface UserFeatureVector {
  userId: string;
  accountId: string;
  plan: string;
  features: {
    // Engagement metrics
    sessionsPerWeek: number;
    avgSessionDurationMinutes: number;
    daysSinceLastLogin: number;
    loginDayVariance: number;        // consistency of usage (low = habitual)
    
    // Feature adoption
    featuresUsed: number;            // out of total available
    advancedFeaturesUsed: number;    // complex features (API, integrations, etc.)
    topFeatureCategory: string;      // "analytics" | "collaboration" | "automation"
    
    // Collaboration signals
    teamSize: number;
    invitesSent: number;
    sharedItemsCount: number;
    
    // Value metrics
    projectCount: number;
    dataVolumeMB: number;
    apiCallsPerWeek: number;
    
    // Support behavior
    supportTicketsLastQuarter: number;
    npsScore: number | null;
    
    // Growth signals
    weekOverWeekGrowth: number;      // positive = growing engagement
    trialDaysRemaining: number | null;
  };
}

export async function extractFeatures(userId: string): Promise<UserFeatureVector> {
  const { rows: [user] } = await pool.query(
    `SELECT u.id, u.account_id, u.plan, u.created_at, 
            a.team_size, a.plan as account_plan
     FROM users u JOIN accounts a ON u.account_id = a.id
     WHERE u.id = $1`,
    [userId]
  );

  // Engagement: sessions and timing
  const { rows: [engagement] } = await pool.query(`
    SELECT 
      COUNT(DISTINCT DATE(created_at)) / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 604800) as sessions_per_week,
      AVG(duration_seconds) / 60.0 as avg_session_minutes,
      EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400 as days_since_last,
      STDDEV(EXTRACT(DOW FROM created_at)) as login_day_variance
    FROM sessions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
  `, [userId]);

  // Feature usage
  const { rows: [featureUsage] } = await pool.query(`
    SELECT 
      COUNT(DISTINCT feature_name) as features_used,
      COUNT(DISTINCT feature_name) FILTER (WHERE feature_category = 'advanced') as advanced_used,
      MODE() WITHIN GROUP (ORDER BY feature_category) as top_category
    FROM feature_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, [userId]);

  // Content and API usage
  const { rows: [usage] } = await pool.query(`
    SELECT 
      COUNT(*) as project_count,
      COALESCE(SUM(data_size_bytes) / 1048576.0, 0) as data_volume_mb,
      (SELECT COUNT(*) FROM api_calls WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') as api_calls_week
    FROM projects WHERE owner_id = $1
  `, [userId]);

  // Collaboration
  const { rows: [collab] } = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE type = 'invite_sent') as invites_sent,
      COUNT(*) FILTER (WHERE type = 'item_shared') as shared_items
    FROM activity_log WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
  `, [userId]);

  // Growth trend
  const { rows: [growth] } = await pool.query(`
    WITH weekly AS (
      SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as events
      FROM feature_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '8 weeks'
      GROUP BY 1 ORDER BY 1
    )
    SELECT CASE WHEN COUNT(*) >= 2 
      THEN (LAST_VALUE(events) OVER (ORDER BY week) - FIRST_VALUE(events) OVER (ORDER BY week))::float 
           / NULLIF(FIRST_VALUE(events) OVER (ORDER BY week), 0) * 100
      ELSE 0 END as wow_growth
    FROM weekly
  `, [userId]);

  // Support
  const { rows: [support] } = await pool.query(`
    SELECT COUNT(*) as tickets, 
           (SELECT score FROM nps_responses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1) as nps
    FROM support_tickets WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
  `, [userId]);

  return {
    userId,
    accountId: user.account_id,
    plan: user.plan,
    features: {
      sessionsPerWeek: parseFloat(engagement?.sessions_per_week || 0),
      avgSessionDurationMinutes: parseFloat(engagement?.avg_session_minutes || 0),
      daysSinceLastLogin: parseFloat(engagement?.days_since_last || 999),
      loginDayVariance: parseFloat(engagement?.login_day_variance || 10),
      featuresUsed: parseInt(featureUsage?.features_used || 0),
      advancedFeaturesUsed: parseInt(featureUsage?.advanced_used || 0),
      topFeatureCategory: featureUsage?.top_category || "unknown",
      teamSize: user.team_size || 1,
      invitesSent: parseInt(collab?.invites_sent || 0),
      sharedItemsCount: parseInt(collab?.shared_items || 0),
      projectCount: parseInt(usage?.project_count || 0),
      dataVolumeMB: parseFloat(usage?.data_volume_mb || 0),
      apiCallsPerWeek: parseInt(usage?.api_calls_week || 0),
      supportTicketsLastQuarter: parseInt(support?.tickets || 0),
      npsScore: support?.nps ? parseInt(support.nps) : null,
      weekOverWeekGrowth: parseFloat(growth?.wow_growth || 0),
      trialDaysRemaining: null,
    },
  };
}

// Batch extract features for all users (for clustering)
export async function extractAllFeatures(): Promise<UserFeatureVector[]> {
  const { rows: users } = await pool.query(
    "SELECT id FROM users WHERE last_active_at > NOW() - INTERVAL '90 days'"
  );

  const features: UserFeatureVector[] = [];
  const batchSize = 50;

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((u) => extractFeatures(u.id))
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled") features.push(result.value);
    }
  }

  return features;
}
```

## Step 2: Build the Clustering Engine

The system uses OpenAI embeddings to convert behavioral features into dense vectors, then applies k-means clustering to discover natural segments.

```typescript
// src/clustering/engine.ts — AI-powered clustering for automatic segmentation
import OpenAI from "openai";
import { UserFeatureVector } from "../features/extractor";
import { pool } from "../db";

const openai = new OpenAI();

interface Segment {
  id: string;
  name: string;           // AI-generated descriptive name
  description: string;    // AI-generated segment description
  size: number;
  avgFeatures: Record<string, number>;
  characteristics: string[];  // key differentiators
  recommendedActions: string[];
  userIds: string[];
}

export async function clusterUsers(
  features: UserFeatureVector[],
  k: number = 6
): Promise<Segment[]> {
  // Convert features to text descriptions for embedding
  const descriptions = features.map((f) => featureToText(f));

  // Get embeddings in batches
  const embeddings: number[][] = [];
  const batchSize = 100;

  for (let i = 0; i < descriptions.length; i += batchSize) {
    const batch = descriptions.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    embeddings.push(...response.data.map((d) => d.embedding));
  }

  // K-means clustering on embeddings
  const assignments = kMeansClustering(embeddings, k);

  // Group users by cluster
  const clusters = new Map<number, UserFeatureVector[]>();
  assignments.forEach((cluster, idx) => {
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster)!.push(features[idx]);
  });

  // Generate segment descriptions using AI
  const segments: Segment[] = [];

  for (const [clusterId, members] of clusters) {
    const avgFeatures = computeAverages(members);

    const naming = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "system",
        content: "You name and describe user segments for a SaaS product. Be specific and actionable. Respond in JSON: {name, description, characteristics: string[], recommendedActions: string[]}",
      }, {
        role: "user",
        content: `Segment of ${members.length} users with these average behaviors:\n${JSON.stringify(avgFeatures, null, 2)}`,
      }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const parsed = JSON.parse(naming.choices[0].message.content!);

    segments.push({
      id: `segment-${clusterId}`,
      name: parsed.name,
      description: parsed.description,
      size: members.length,
      avgFeatures,
      characteristics: parsed.characteristics,
      recommendedActions: parsed.recommendedActions,
      userIds: members.map((m) => m.userId),
    });
  }

  // Save segments to database
  for (const segment of segments) {
    await pool.query(
      `INSERT INTO user_segments (id, name, description, size, avg_features, characteristics, recommended_actions, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET name=$2, description=$3, size=$4, avg_features=$5, characteristics=$6, recommended_actions=$7, created_at=NOW()`,
      [segment.id, segment.name, segment.description, segment.size,
       JSON.stringify(segment.avgFeatures), segment.characteristics, segment.recommendedActions]
    );

    // Tag users with their segment
    for (const userId of segment.userIds) {
      await pool.query(
        "UPDATE users SET segment_id = $1 WHERE id = $2",
        [segment.id, userId]
      );
    }
  }

  return segments;
}

function featureToText(f: UserFeatureVector): string {
  return `User on ${f.plan} plan. ${f.features.sessionsPerWeek.toFixed(1)} sessions/week, ` +
    `${f.features.avgSessionDurationMinutes.toFixed(0)}min avg session. ` +
    `Uses ${f.features.featuresUsed} features (${f.features.advancedFeaturesUsed} advanced). ` +
    `Team size ${f.features.teamSize}, ${f.features.invitesSent} invites sent. ` +
    `${f.features.projectCount} projects, ${f.features.apiCallsPerWeek} API calls/week. ` +
    `${f.features.daysSinceLastLogin.toFixed(0)} days since last login. ` +
    `Growth trend: ${f.features.weekOverWeekGrowth > 0 ? "+" : ""}${f.features.weekOverWeekGrowth.toFixed(0)}%. ` +
    `${f.features.supportTicketsLastQuarter} support tickets.`;
}

function kMeansClustering(vectors: number[][], k: number, maxIterations: number = 100): number[] {
  const n = vectors.length;
  const dim = vectors[0].length;

  // Initialize centroids using k-means++
  const centroids: number[][] = [vectors[Math.floor(Math.random() * n)]];
  for (let i = 1; i < k; i++) {
    const distances = vectors.map((v) =>
      Math.min(...centroids.map((c) => euclideanDistance(v, c)))
    );
    const totalDist = distances.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalDist;
    for (let j = 0; j < n; j++) {
      rand -= distances[j];
      if (rand <= 0) { centroids.push([...vectors[j]]); break; }
    }
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let minCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(vectors[i], centroids[c]);
        if (dist < minDist) { minDist = dist; minCluster = c; }
      }
      if (assignments[i] !== minCluster) { assignments[i] = minCluster; changed = true; }
    }

    if (!changed) break;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      for (let d = 0; d < dim; d++) {
        centroids[c][d] = members.reduce((s, v) => s + v[d], 0) / members.length;
      }
    }
  }

  return assignments;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function computeAverages(members: UserFeatureVector[]): Record<string, number> {
  const keys = Object.keys(members[0].features).filter((k) => typeof (members[0].features as any)[k] === "number");
  const avgs: Record<string, number> = {};
  for (const key of keys) {
    avgs[key] = members.reduce((s, m) => s + ((m.features as any)[key] || 0), 0) / members.length;
    avgs[key] = Math.round(avgs[key] * 100) / 100;
  }
  return avgs;
}
```

## Step 3: Build the Segmentation API

The API exposes segments for marketing tools, product analytics, and sales CRM integration.

```typescript
// src/routes/segments.ts — Segmentation API for marketing and product teams
import { Hono } from "hono";
import { pool } from "../db";
import { clusterUsers } from "../clustering/engine";
import { extractAllFeatures } from "../features/extractor";

const app = new Hono();

// Get all segments with their characteristics
app.get("/segments", async (c) => {
  const { rows } = await pool.query(
    "SELECT * FROM user_segments ORDER BY size DESC"
  );
  return c.json({ segments: rows });
});

// Get which segment a specific user belongs to
app.get("/users/:id/segment", async (c) => {
  const { id } = c.req.param();
  const { rows } = await pool.query(
    `SELECT u.segment_id, s.name, s.description, s.characteristics, s.recommended_actions
     FROM users u LEFT JOIN user_segments s ON u.segment_id = s.id
     WHERE u.id = $1`,
    [id]
  );
  if (rows.length === 0) return c.json({ error: "User not found" }, 404);
  return c.json(rows[0]);
});

// Trigger re-clustering (weekly cron or manual)
app.post("/segments/recluster", async (c) => {
  const k = Number(c.req.query("k") || 6);
  const features = await extractAllFeatures();
  const segments = await clusterUsers(features, k);

  return c.json({
    segments: segments.map((s) => ({
      name: s.name,
      size: s.size,
      description: s.description,
      characteristics: s.characteristics,
    })),
    totalUsers: features.length,
  });
});

// Get users in a specific segment (for export to marketing tools)
app.get("/segments/:id/users", async (c) => {
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || 100);
  const offset = Number(c.req.query("offset") || 0);

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.plan, u.last_active_at
     FROM users u WHERE u.segment_id = $1
     ORDER BY u.last_active_at DESC LIMIT $2 OFFSET $3`,
    [id, limit, offset]
  );

  return c.json({ users: rows });
});

export default app;
```

## Results

After deploying AI-powered segmentation:

- **6 distinct segments discovered** — "Power Collaborators" (high team use), "API-First Builders" (heavy API, minimal UI), "At-Risk Champions" (formerly active, declining), "Exploring Trial Users," "Solo Power Users," "Dormant Accounts"
- **Email open rate jumped from 12% to 31%** — segment-specific messaging resonates; "API-First Builders" get developer-focused content, "At-Risk Champions" get re-engagement campaigns
- **Sales conversion improved 40%** — sales team now knows which segment a lead belongs to and tailors their pitch; "Power Collaborators" care about team features, "Solo Power Users" care about individual productivity
- **Churn prediction improved** — the "At-Risk Champions" segment flagged 89 users with declining engagement; proactive outreach saved 34 accounts worth $67K ARR
- **Clustering cost: $8/month** — embeddings for 25,000 users + GPT-4o-mini naming costs under $10; runs weekly on a cron schedule
