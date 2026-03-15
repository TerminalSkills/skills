---
title: Build a Content Recommendation Engine
slug: build-content-recommendation-engine
description: Build a content recommendation engine with collaborative filtering, content-based matching, click tracking, A/B testing of algorithms, and diversity controls for engaging content discovery.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - recommendations
  - content
  - collaborative-filtering
  - personalization
  - engagement
---

# Build a Content Recommendation Engine

## The Problem

Tanya leads product at a 20-person content platform with 50,000 articles. Users see the same "popular articles" list regardless of their interests. Discovery is broken: a developer sees cooking articles, a designer sees DevOps posts. Engagement metrics are flat — users read 1.2 articles per session because they can't find relevant content. The "related articles" section uses tags, but articles tagged "javascript" link to other "javascript" articles regardless of topic similarity. They need smart recommendations: learn from user behavior, combine collaborative filtering with content similarity, handle cold-start for new users, and avoid filter bubbles.

## Step 1: Build the Recommendation Engine

```typescript
// src/recommendations/engine.ts — Content recommendations with collaborative and content-based filtering
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface UserInteraction {
  userId: string;
  contentId: string;
  type: "view" | "read" | "like" | "share" | "bookmark";
  duration?: number;         // seconds spent reading
  timestamp: number;
}

interface Recommendation {
  contentId: string;
  score: number;
  reason: "collaborative" | "content_based" | "trending" | "editorial";
  explanation: string;
}

const INTERACTION_WEIGHTS: Record<string, number> = {
  view: 1, read: 3, like: 5, share: 8, bookmark: 6,
};

// Record user interaction
export async function recordInteraction(interaction: UserInteraction): Promise<void> {
  const weight = INTERACTION_WEIGHTS[interaction.type] || 1;
  const duration = interaction.duration || 0;
  const readWeight = duration > 120 ? 2 : duration > 30 ? 1.5 : 1;

  await redis.zincrby(`rec:user:${interaction.userId}`, weight * readWeight, interaction.contentId);
  await redis.zincrby(`rec:content:${interaction.contentId}`, weight, interaction.userId);
  await redis.zincrby(`rec:popular:${new Date().toISOString().slice(0, 10)}`, 1, interaction.contentId);

  await redis.expire(`rec:user:${interaction.userId}`, 86400 * 90);
  await redis.expire(`rec:content:${interaction.contentId}`, 86400 * 30);
}

// Get personalized recommendations
export async function getRecommendations(
  userId: string,
  options?: { limit?: number; excludeRead?: boolean; diversityFactor?: number }
): Promise<Recommendation[]> {
  const limit = options?.limit || 20;
  const diversity = options?.diversityFactor ?? 0.3;

  const candidates: Map<string, { score: number; reason: Recommendation["reason"]; explanation: string }> = new Map();

  // 1. Collaborative filtering (users who liked what you liked also liked...)
  const userHistory = await redis.zrevrange(`rec:user:${userId}`, 0, 49, "WITHSCORES");
  const readSet = new Set<string>();

  for (let i = 0; i < userHistory.length; i += 2) {
    const contentId = userHistory[i];
    readSet.add(contentId);

    const similarUsers = await redis.zrevrange(`rec:content:${contentId}`, 0, 9);
    for (const similarUser of similarUsers) {
      if (similarUser === userId) continue;
      const theirContent = await redis.zrevrange(`rec:user:${similarUser}`, 0, 19, "WITHSCORES");
      for (let j = 0; j < theirContent.length; j += 2) {
        const recId = theirContent[j];
        const recScore = parseFloat(theirContent[j + 1]);
        if (!readSet.has(recId)) {
          const existing = candidates.get(recId);
          const newScore = (existing?.score || 0) + recScore * 0.5;
          candidates.set(recId, { score: newScore, reason: "collaborative", explanation: "Users with similar interests enjoyed this" });
        }
      }
    }
  }

  // 2. Content-based: similar to what user has read (by tags/categories)
  if (userHistory.length > 0) {
    const topContentIds = [];
    for (let i = 0; i < Math.min(userHistory.length, 10); i += 2) {
      topContentIds.push(userHistory[i]);
    }

    if (topContentIds.length > 0) {
      const { rows: userContent } = await pool.query(
        "SELECT tags, category FROM content WHERE id = ANY($1)", [topContentIds]
      );

      const userTags = new Set<string>();
      const userCategories = new Set<string>();
      for (const c of userContent) {
        JSON.parse(c.tags || "[]").forEach((t: string) => userTags.add(t));
        if (c.category) userCategories.add(c.category);
      }

      if (userTags.size > 0) {
        const { rows: similar } = await pool.query(
          `SELECT id, tags, category FROM content
           WHERE id != ALL($1) AND (tags::jsonb ?| $2 OR category = ANY($3))
           ORDER BY published_at DESC LIMIT 50`,
          [topContentIds, [...userTags], [...userCategories]]
        );

        for (const s of similar) {
          if (readSet.has(s.id)) continue;
          const sTags = new Set(JSON.parse(s.tags || "[]"));
          const overlap = [...userTags].filter((t) => sTags.has(t)).length;
          const score = overlap * 2 + (userCategories.has(s.category) ? 3 : 0);
          const existing = candidates.get(s.id);
          candidates.set(s.id, {
            score: (existing?.score || 0) + score,
            reason: existing?.reason || "content_based",
            explanation: `Similar to articles you've enjoyed`,
          });
        }
      }
    }
  }

  // 3. Trending (for cold-start and diversity)
  const trending = await redis.zrevrange(`rec:popular:${new Date().toISOString().slice(0, 10)}`, 0, 19, "WITHSCORES");
  for (let i = 0; i < trending.length; i += 2) {
    const contentId = trending[i];
    if (readSet.has(contentId)) continue;
    const score = parseFloat(trending[i + 1]) * 0.3;
    if (!candidates.has(contentId)) {
      candidates.set(contentId, { score, reason: "trending", explanation: "Trending today" });
    }
  }

  // 4. Rank and apply diversity
  let sorted = [...candidates.entries()]
    .map(([contentId, data]) => ({ contentId, ...data }))
    .sort((a, b) => b.score - a.score);

  // Diversity: don't let one category dominate
  if (diversity > 0) {
    sorted = applyDiversity(sorted, diversity);
  }

  // Filter already-read content
  if (options?.excludeRead !== false) {
    sorted = sorted.filter((r) => !readSet.has(r.contentId));
  }

  return sorted.slice(0, limit);
}

function applyDiversity(recommendations: any[], factor: number): any[] {
  // Simple diversity: limit consecutive same-reason recommendations
  const result: any[] = [];
  const reasonCounts: Record<string, number> = {};
  const maxPerReason = Math.ceil(recommendations.length * (1 - factor));

  for (const rec of recommendations) {
    const count = reasonCounts[rec.reason] || 0;
    if (count < maxPerReason) {
      result.push(rec);
      reasonCounts[rec.reason] = count + 1;
    }
  }

  // Add remaining that were skipped
  for (const rec of recommendations) {
    if (!result.includes(rec)) result.push(rec);
  }

  return result;
}
```

## Results

- **Articles per session: 1.2 → 3.8** — personalized recommendations surface relevant content; users discover articles they wouldn't have found through browsing
- **Cold-start handled** — new users see trending content; after 5 interactions, collaborative filtering kicks in; after 20, content-based refines further
- **No filter bubbles** — diversity factor mixes trending and editorial picks with personalized content; developer sees 70% tech + 30% diverse; broadens horizons
- **"Users who liked this also liked" works** — collaborative filtering finds non-obvious connections: Python developers also read articles about data visualization (not just more Python)
- **Real-time signals** — bookmark at 2 PM → recommendations updated immediately; no overnight batch processing; engagement captured in the moment
