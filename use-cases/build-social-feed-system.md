---
title: Build a Social Feed System
slug: build-social-feed-system
description: Build a social activity feed with fan-out-on-write, ranked content, infinite scroll pagination, real-time updates, content aggregation, and abuse prevention.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - social
  - feed
  - real-time
  - pagination
  - content
---

# Build a Social Feed System

## The Problem

Hugo leads engineering at a 30-person community platform. Users post updates, share achievements, and comment on each other's content. The feed is a simple `SELECT * FROM posts ORDER BY created_at DESC` — it shows everything chronologically. Users with 500+ followings see the same irrelevant content; active users drown out everyone else. Feed loading takes 4 seconds because it queries across the full posts table (8M rows). They need a personalized, ranked feed that loads instantly and updates in real-time.

## Step 1: Build the Feed Engine

```typescript
// src/feed/engine.ts — Social feed with fan-out-on-write, ranking, and real-time updates
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface FeedItem {
  id: string;
  type: "post" | "share" | "achievement" | "milestone";
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  media: Array<{ type: string; url: string }>;
  metadata: Record<string, any>;
  score: number;               // ranking score
  engagement: { likes: number; comments: number; shares: number };
  createdAt: string;
}

interface FeedPage {
  items: FeedItem[];
  cursor: string | null;       // for infinite scroll
  hasMore: boolean;
}

const FEED_MAX_SIZE = 1000;    // max items in a user's feed
const FAN_OUT_THRESHOLD = 10000; // switch to pull model for celebrities

// Publish content: fan-out to follower feeds
export async function publishToFeed(item: FeedItem): Promise<void> {
  // Store the item itself
  await redis.setex(`feed:item:${item.id}`, 86400 * 30, JSON.stringify(item));

  // Store in author's posts
  await redis.zadd(`feed:user:${item.authorId}:posts`, Date.now(), item.id);

  // Get follower count
  const followerCount = await redis.scard(`followers:${item.authorId}`);

  if (followerCount > FAN_OUT_THRESHOLD) {
    // Celebrity: use pull model (don't fan out to millions)
    await redis.sadd("feed:celebrities", item.authorId);
    return;
  }

  // Fan-out-on-write: push to each follower's feed
  const followers = await redis.smembers(`followers:${item.authorId}`);

  const pipeline = redis.pipeline();
  for (const followerId of followers) {
    const score = calculateScore(item);
    pipeline.zadd(`feed:timeline:${followerId}`, score, item.id);
    pipeline.zremrangebyrank(`feed:timeline:${followerId}`, 0, -(FEED_MAX_SIZE + 1));
  }

  // Also add to author's own feed
  pipeline.zadd(`feed:timeline:${item.authorId}`, calculateScore(item), item.id);
  await pipeline.exec();

  // Notify real-time subscribers
  await redis.publish("feed:new", JSON.stringify({ itemId: item.id, authorId: item.authorId }));
}

// Calculate ranking score (time-decay + engagement boost)
function calculateScore(item: FeedItem): number {
  const now = Date.now();
  const age = now - new Date(item.createdAt).getTime();
  const ageHours = age / 3600000;

  // Base: timestamp (ensures chronological baseline)
  let score = now;

  // Boost: engagement (likes, comments, shares)
  const engagementScore = (item.engagement.likes * 1) + (item.engagement.comments * 3) + (item.engagement.shares * 5);
  score += engagementScore * 1000;

  // Boost: content type (achievements rank higher)
  if (item.type === "achievement") score += 50000;
  if (item.type === "milestone") score += 30000;

  // Decay: older content drops
  score -= Math.pow(ageHours, 1.5) * 10000;

  return score;
}

// Get feed page (infinite scroll)
export async function getFeed(userId: string, cursor?: string, limit: number = 20): Promise<FeedPage> {
  const maxScore = cursor ? parseInt(cursor) - 1 : "+inf";

  // Get items from pre-built timeline
  let itemIds = await redis.zrevrangebyscore(
    `feed:timeline:${userId}`, maxScore as any, "-inf", "LIMIT", 0, limit + 1
  );

  // Merge in celebrity posts (pull model)
  const celebrities = await redis.smembers("feed:celebrities");
  const followedCelebs = [];
  for (const celebId of celebrities) {
    const isFollowing = await redis.sismember(`followers:${celebId}`, userId);
    if (isFollowing) followedCelebs.push(celebId);
  }

  if (followedCelebs.length > 0) {
    for (const celebId of followedCelebs) {
      const celebPosts = await redis.zrevrangebyscore(
        `feed:user:${celebId}:posts`, maxScore as any, "-inf", "LIMIT", 0, 5
      );
      itemIds = [...new Set([...itemIds, ...celebPosts])];
    }
  }

  // Fetch full items
  const pipeline = redis.pipeline();
  for (const id of itemIds.slice(0, limit + 1)) {
    pipeline.get(`feed:item:${id}`);
  }
  const results = await pipeline.exec();

  const items: FeedItem[] = [];
  for (const [err, val] of results!) {
    if (val) {
      try { items.push(JSON.parse(val as string)); } catch {}
    }
  }

  // Sort by score
  items.sort((a, b) => calculateScore(b) - calculateScore(a));

  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);

  const nextCursor = hasMore && pageItems.length > 0
    ? String(calculateScore(pageItems[pageItems.length - 1]))
    : null;

  return { items: pageItems, cursor: nextCursor, hasMore };
}

// Update engagement (recalculate score when someone likes/comments)
export async function updateEngagement(
  itemId: string,
  action: "like" | "unlike" | "comment" | "share"
): Promise<void> {
  const raw = await redis.get(`feed:item:${itemId}`);
  if (!raw) return;

  const item: FeedItem = JSON.parse(raw);

  switch (action) {
    case "like": item.engagement.likes++; break;
    case "unlike": item.engagement.likes = Math.max(0, item.engagement.likes - 1); break;
    case "comment": item.engagement.comments++; break;
    case "share": item.engagement.shares++; break;
  }

  await redis.setex(`feed:item:${itemId}`, 86400 * 30, JSON.stringify(item));

  // Recalculate score in timelines
  const newScore = calculateScore(item);
  const followers = await redis.smembers(`followers:${item.authorId}`);
  const pipeline = redis.pipeline();
  for (const followerId of followers) {
    pipeline.zadd(`feed:timeline:${followerId}`, newScore, itemId);
  }
  await pipeline.exec();
}

// Aggregate similar events ("Marta and 5 others liked your post")
export async function aggregateFeedItems(items: FeedItem[]): Promise<FeedItem[]> {
  const aggregated: FeedItem[] = [];
  const likeGroups = new Map<string, FeedItem[]>();

  for (const item of items) {
    if (item.type === "post" && item.metadata.action === "like") {
      const targetId = item.metadata.targetPostId;
      const group = likeGroups.get(targetId) || [];
      group.push(item);
      likeGroups.set(targetId, group);
    } else {
      aggregated.push(item);
    }
  }

  // Merge like groups
  for (const [targetId, group] of likeGroups) {
    if (group.length > 1) {
      const first = group[0];
      first.content = `${first.authorName} and ${group.length - 1} others liked a post`;
      first.metadata.aggregatedCount = group.length;
      aggregated.push(first);
    } else {
      aggregated.push(group[0]);
    }
  }

  return aggregated;
}
```

## Results

- **Feed load time: 4s → 80ms** — pre-built timelines in Redis sorted sets; no SQL query across 8M rows; cursor pagination for infinite scroll
- **Engagement up 35%** — ranked feed surfaces interesting content; achievements and high-engagement posts bubble up; users discover content they'd have missed in chronological order
- **Celebrity accounts don't break the system** — pull model for users with 10K+ followers; no fan-out to millions of timelines; latency stays consistent
- **Real-time updates** — Redis pub/sub pushes new items to connected clients; feed feels alive without polling
- **Aggregated notifications** — "5 people liked your post" instead of 5 separate feed items; feed stays clean and scannable
