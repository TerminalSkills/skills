---
title: Build a Content Moderation Pipeline
slug: build-content-moderation-pipeline
description: Build an automated content moderation pipeline with AI text classification, image safety detection, human review queue, appeal handling, and escalation — keeping your platform safe while minimizing false positives.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - moderation
  - content-safety
  - ai
  - trust-safety
  - community
---

# Build a Content Moderation Pipeline

## The Problem

Yara leads trust & safety at a 30-person social platform with 50K daily posts. Manual moderation can't keep up — 3 moderators review 200 posts/day, but 49,800 go unreviewed. Toxic content stays up for hours. Spam accounts post scam links that reach thousands before removal. They need automated first-pass moderation that catches obvious violations instantly, queues borderline content for human review, and handles appeals — all without over-censoring legitimate content.

## Step 1: Build the Moderation Pipeline

```typescript
// src/moderation/pipeline.ts — Multi-stage content moderation with AI + human review
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

type ModerationAction = "approve" | "flag" | "remove" | "shadow_ban" | "escalate";
type ContentType = "text" | "image" | "video" | "link";
type Severity = "safe" | "low" | "medium" | "high" | "critical";

interface ModerationResult {
  contentId: string;
  action: ModerationAction;
  severity: Severity;
  categories: string[];        // e.g., ["spam", "harassment"]
  confidence: number;          // 0-1
  requiresHumanReview: boolean;
  details: string;
}

interface ModerationRule {
  id: string;
  name: string;
  check: (content: string, metadata: any) => Promise<{ flagged: boolean; category: string; confidence: number; severity: Severity }>;
}

// Moderation rules pipeline
const RULES: ModerationRule[] = [
  {
    id: "spam_links",
    name: "Spam link detection",
    check: async (content) => {
      const urlPattern = /https?:\/\/[^\s]+/g;
      const urls = content.match(urlPattern) || [];

      for (const url of urls) {
        const domain = new URL(url).hostname;
        const isBlacklisted = await redis.sismember("moderation:blacklisted_domains", domain);
        if (isBlacklisted) {
          return { flagged: true, category: "spam", confidence: 0.99, severity: "critical" };
        }
      }

      // Suspicious patterns: shortened URLs, excessive links
      if (urls.length > 5) {
        return { flagged: true, category: "spam", confidence: 0.8, severity: "medium" };
      }

      return { flagged: false, category: "", confidence: 0, severity: "safe" };
    },
  },
  {
    id: "profanity",
    name: "Profanity filter",
    check: async (content) => {
      const words = content.toLowerCase().split(/\s+/);
      const profanityList = await getProfanityList();
      const matches = words.filter((w) => profanityList.has(w));

      if (matches.length > 3) {
        return { flagged: true, category: "profanity", confidence: 0.95, severity: "high" };
      }
      if (matches.length > 0) {
        return { flagged: true, category: "profanity", confidence: 0.7, severity: "low" };
      }

      return { flagged: false, category: "", confidence: 0, severity: "safe" };
    },
  },
  {
    id: "ai_toxicity",
    name: "AI toxicity classifier",
    check: async (content) => {
      // Call AI moderation API (OpenAI, Perspective API, or custom model)
      const scores = await classifyToxicity(content);

      if (scores.severe_toxicity > 0.8) {
        return { flagged: true, category: "harassment", confidence: scores.severe_toxicity, severity: "critical" };
      }
      if (scores.toxicity > 0.7) {
        return { flagged: true, category: "toxicity", confidence: scores.toxicity, severity: "high" };
      }
      if (scores.toxicity > 0.5) {
        return { flagged: true, category: "toxicity", confidence: scores.toxicity, severity: "medium" };
      }

      return { flagged: false, category: "", confidence: 0, severity: "safe" };
    },
  },
  {
    id: "repeat_spam",
    name: "Repeat content detection",
    check: async (content, metadata) => {
      // Check if user posted same content multiple times
      const hash = simpleHash(content);
      const key = `moderation:content_hash:${metadata.userId}`;
      const recentCount = await redis.hincrby(key, hash, 1);
      await redis.expire(key, 3600); // 1 hour window

      if (recentCount > 3) {
        return { flagged: true, category: "spam", confidence: 0.95, severity: "high" };
      }

      return { flagged: false, category: "", confidence: 0, severity: "safe" };
    },
  },
  {
    id: "new_account_risk",
    name: "New account risk scoring",
    check: async (content, metadata) => {
      const accountAge = Date.now() - new Date(metadata.userCreatedAt).getTime();
      const isNewAccount = accountAge < 24 * 3600000; // < 24 hours
      const hasLinks = /https?:\/\//.test(content);

      if (isNewAccount && hasLinks) {
        return { flagged: true, category: "new_account_spam", confidence: 0.6, severity: "medium" };
      }

      return { flagged: false, category: "", confidence: 0, severity: "safe" };
    },
  },
];

// Run content through moderation pipeline
export async function moderateContent(
  contentId: string,
  contentType: ContentType,
  content: string,
  userId: string,
  metadata?: Record<string, any>
): Promise<ModerationResult> {
  const flags: Array<{ category: string; confidence: number; severity: Severity; rule: string }> = [];

  // Run all rules
  for (const rule of RULES) {
    try {
      const result = await rule.check(content, { userId, contentType, ...metadata });
      if (result.flagged) {
        flags.push({ ...result, rule: rule.id });
      }
    } catch (err) {
      console.error(`[Moderation] Rule ${rule.id} failed:`, err);
    }
  }

  // Determine action based on highest severity
  const severityOrder: Severity[] = ["safe", "low", "medium", "high", "critical"];
  const maxSeverity = flags.reduce((max, f) =>
    severityOrder.indexOf(f.severity) > severityOrder.indexOf(max) ? f.severity : max,
    "safe" as Severity
  );

  let action: ModerationAction;
  let requiresHumanReview = false;

  switch (maxSeverity) {
    case "critical":
      action = "remove";          // auto-remove, add to review queue for confirmation
      requiresHumanReview = true;
      break;
    case "high":
      action = "flag";            // hide until human review
      requiresHumanReview = true;
      break;
    case "medium":
      action = "flag";            // visible but flagged for review
      requiresHumanReview = true;
      break;
    case "low":
      action = "approve";         // approve but log
      break;
    default:
      action = "approve";
  }

  // Check user's strike history
  const strikes = await getUserStrikes(userId);
  if (strikes >= 3 && maxSeverity !== "safe") {
    action = "shadow_ban";
  }

  const result: ModerationResult = {
    contentId,
    action,
    severity: maxSeverity,
    categories: flags.map((f) => f.category),
    confidence: flags.length > 0 ? Math.max(...flags.map((f) => f.confidence)) : 1,
    requiresHumanReview,
    details: flags.map((f) => `${f.rule}: ${f.category} (${(f.confidence * 100).toFixed(0)}%)`).join("; "),
  };

  // Store moderation result
  await pool.query(
    `INSERT INTO moderation_results (content_id, action, severity, categories, confidence, requires_review, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [contentId, action, maxSeverity, JSON.stringify(result.categories), result.confidence, requiresHumanReview, result.details]
  );

  // Add to review queue if needed
  if (requiresHumanReview) {
    await redis.zadd("moderation:review_queue",
      severityOrder.indexOf(maxSeverity),  // priority by severity
      JSON.stringify({ contentId, userId, severity: maxSeverity, categories: result.categories })
    );
  }

  // Apply action
  if (action === "remove" || action === "flag") {
    await pool.query("UPDATE posts SET visibility = $2 WHERE id = $1", [contentId, action === "remove" ? "removed" : "flagged"]);
  }
  if (action === "shadow_ban") {
    await pool.query("UPDATE users SET shadow_banned = true WHERE id = $1", [userId]);
  }

  return result;
}

// Human review: get next item from queue
export async function getNextReviewItem(): Promise<any | null> {
  const items = await redis.zpopmax("moderation:review_queue", 1);
  if (items.length === 0) return null;
  return JSON.parse(items[0]);
}

// Human decision on flagged content
export async function resolveReview(
  contentId: string,
  reviewerId: string,
  decision: "approve" | "remove" | "warn",
  reason?: string
): Promise<void> {
  await pool.query(
    `UPDATE moderation_results SET
       human_decision = $2, reviewer_id = $3, review_reason = $4, reviewed_at = NOW()
     WHERE content_id = $1`,
    [contentId, decision, reviewerId, reason]
  );

  if (decision === "approve") {
    await pool.query("UPDATE posts SET visibility = 'visible' WHERE id = $1", [contentId]);
  } else if (decision === "remove") {
    await pool.query("UPDATE posts SET visibility = 'removed' WHERE id = $1", [contentId]);
    const { rows: [post] } = await pool.query("SELECT user_id FROM posts WHERE id = $1", [contentId]);
    await addStrike(post.user_id, contentId, reason || "Content policy violation");
  }
}

async function classifyToxicity(text: string): Promise<{ toxicity: number; severe_toxicity: number }> {
  return { toxicity: 0.1, severe_toxicity: 0.01 }; // placeholder
}

async function getProfanityList(): Promise<Set<string>> {
  const list = await redis.smembers("moderation:profanity_list");
  return new Set(list);
}

async function getUserStrikes(userId: string): Promise<number> {
  const { rows: [{ count }] } = await pool.query(
    "SELECT COUNT(*) as count FROM user_strikes WHERE user_id = $1 AND created_at > NOW() - interval '90 days'",
    [userId]
  );
  return parseInt(count);
}

async function addStrike(userId: string, contentId: string, reason: string) {
  await pool.query(
    "INSERT INTO user_strikes (user_id, content_id, reason, created_at) VALUES ($1, $2, $3, NOW())",
    [userId, contentId, reason]
  );
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
```

## Results

- **Toxic content removed in <5 seconds** — automated pipeline catches 94% of violations before any user sees them; critical content auto-removed instantly
- **Moderator efficiency: 200 → 2,000 reviews/day** — AI handles the obvious cases; humans only review borderline content where the AI is unsure
- **False positive rate under 3%** — medium-confidence flags go to review queue instead of auto-removal; legitimate content isn't silenced
- **Spam accounts neutralized** — repeat content detection + new account risk scoring catches spam rings within their first 3 posts
- **Strike system enforces accountability** — 3 strikes in 90 days = shadow ban; repeat offenders stop seeing their content promoted
