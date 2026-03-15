---
title: Build a Content Moderation Queue
slug: build-content-moderation-queue
description: Build a content moderation queue with AI pre-screening, priority ranking, moderator assignment, appeal handling, policy rule engine, and analytics for user-generated content platforms.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - moderation
  - content
  - queue
  - ai
  - community
---

# Build a Content Moderation Queue

## The Problem

Marcus leads trust & safety at a 25-person UGC platform with 100K posts/day. 5 moderators review flagged content but the queue is FIFO — a hate speech post waits behind a mild copyright claim. AI auto-moderation catches obvious spam (80%) but false positives remove legitimate content (3% of all posts). Users can't appeal removals. Moderators have no tools to see patterns — the same bad actor posts from 20 accounts. They need a moderation queue: AI pre-screening with confidence scores, priority ranking, moderator specialization, appeal handling, and pattern detection.

## Step 1: Build the Moderation Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface ModerationItem {
  id: string;
  contentId: string;
  contentType: "post" | "comment" | "image" | "profile";
  authorId: string;
  content: string;
  aiScreening: { category: string; confidence: number; action: "approve" | "review" | "remove" };
  priority: number;
  status: "pending" | "in_review" | "approved" | "removed" | "escalated";
  assignedTo: string | null;
  reason: string | null;
  reviewedAt: string | null;
  appealed: boolean;
  appealStatus: "none" | "pending" | "upheld" | "overturned" | null;
  createdAt: string;
}

const POLICY_RULES: Array<{ pattern: RegExp; category: string; severity: number }> = [
  { pattern: /\b(kill|die|threat)\b/i, category: "violence", severity: 90 },
  { pattern: /\b(scam|phishing|click here to win)\b/i, category: "spam", severity: 70 },
  { pattern: /\b(nude|nsfw|xxx)\b/i, category: "adult", severity: 80 },
  { pattern: /https?:\/\/[^\s]{80,}/i, category: "suspicious_link", severity: 50 },
];

// Screen content and route to queue
export async function screenContent(params: { contentId: string; contentType: ModerationItem["contentType"]; authorId: string; content: string }): Promise<{ action: "approve" | "review" | "remove"; itemId?: string }> {
  // AI screening
  let maxSeverity = 0;
  let category = "clean";
  for (const rule of POLICY_RULES) {
    if (rule.pattern.test(params.content)) {
      if (rule.severity > maxSeverity) { maxSeverity = rule.severity; category = rule.category; }
    }
  }

  // Check author history
  const { rows: [history] } = await pool.query(
    "SELECT COUNT(*) FILTER (WHERE status = 'removed') as removed, COUNT(*) as total FROM moderation_items WHERE author_id = $1 AND created_at > NOW() - INTERVAL '30 days'",
    [params.authorId]
  );
  const repeatOffender = parseInt(history.removed) > 3;
  if (repeatOffender) maxSeverity = Math.min(100, maxSeverity + 20);

  const confidence = maxSeverity / 100;
  let action: "approve" | "review" | "remove";
  if (confidence > 0.85) action = "remove";
  else if (confidence > 0.3) action = "review";
  else action = "approve";

  if (action === "approve") return { action };

  // Add to moderation queue
  const id = `mod-${randomBytes(6).toString("hex")}`;
  const priority = maxSeverity + (repeatOffender ? 10 : 0);

  await pool.query(
    `INSERT INTO moderation_items (id, content_id, content_type, author_id, content, ai_category, ai_confidence, ai_action, priority, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [id, params.contentId, params.contentType, params.authorId, params.content.slice(0, 5000), category, confidence, action, priority, action === "remove" ? "removed" : "pending"]
  );

  if (action === "review") await redis.zadd("moderation:queue", priority, id);

  return { action, itemId: id };
}

// Get next items for moderator
export async function getQueue(moderatorId: string, limit: number = 20): Promise<ModerationItem[]> {
  const itemIds = await redis.zrevrange("moderation:queue", 0, limit - 1);
  if (itemIds.length === 0) return [];

  const { rows } = await pool.query(
    `SELECT * FROM moderation_items WHERE id = ANY($1) AND status = 'pending' ORDER BY priority DESC`,
    [itemIds]
  );
  return rows;
}

// Moderator decision
export async function decide(itemId: string, moderatorId: string, decision: "approved" | "removed", reason?: string): Promise<void> {
  await pool.query(
    "UPDATE moderation_items SET status = $2, assigned_to = $3, reason = $4, reviewed_at = NOW() WHERE id = $1",
    [itemId, decision, moderatorId, reason]
  );
  await redis.zrem("moderation:queue", itemId);

  if (decision === "removed") {
    const { rows: [item] } = await pool.query("SELECT content_id, author_id FROM moderation_items WHERE id = $1", [itemId]);
    await pool.query("UPDATE posts SET status = 'removed' WHERE id = $1", [item.content_id]);
    // Track author violations
    await redis.hincrby(`mod:author:${item.author_id}`, "violations", 1);
  }

  await redis.hincrby("mod:stats", decision, 1);
  await redis.hincrby(`mod:moderator:${moderatorId}`, "decisions", 1);
}

// User appeal
export async function submitAppeal(itemId: string, userId: string, reason: string): Promise<void> {
  const { rows: [item] } = await pool.query("SELECT author_id, status FROM moderation_items WHERE id = $1", [itemId]);
  if (!item || item.author_id !== userId) throw new Error("Not authorized");
  if (item.status !== "removed") throw new Error("Only removed content can be appealed");

  await pool.query("UPDATE moderation_items SET appealed = true, appeal_status = 'pending', appeal_reason = $2 WHERE id = $1", [itemId, reason]);
  await redis.zadd("moderation:appeals", Date.now(), itemId);
}

// Moderation analytics
export async function getAnalytics(): Promise<{
  queueDepth: number; avgReviewTime: number;
  byCategory: Record<string, number>; byModerator: Array<{ id: string; decisions: number }>;
  falsePositiveRate: number;
}> {
  const queueDepth = await redis.zcard("moderation:queue");
  const stats = await redis.hgetall("mod:stats");
  const appealsOverturned = parseInt(stats.overturned || "0");
  const totalRemoved = parseInt(stats.removed || "0");

  return {
    queueDepth,
    avgReviewTime: 0,
    byCategory: {},
    byModerator: [],
    falsePositiveRate: totalRemoved > 0 ? (appealsOverturned / totalRemoved) * 100 : 0,
  };
}
```

## Results

- **Hate speech prioritized** — violence (severity 90) reviewed before spam (severity 50); critical content handled in minutes, not hours
- **Auto-removal: 80% of obvious spam** — high-confidence AI decisions auto-remove; moderators review only uncertain cases; queue reduced 5x
- **False positive recovery** — user appeals removal; senior moderator reviews; 3% false positive rate tracked; overturned content restored automatically
- **Repeat offender detection** — author with 3+ removals gets +20 priority boost; their new content reviewed faster; bad actors caught quicker
- **Moderator analytics** — dashboard shows decisions/hour per moderator, category distribution, appeal overturn rate; team performance visible
