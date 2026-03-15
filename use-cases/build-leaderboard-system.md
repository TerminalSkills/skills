---
title: Build a Leaderboard System
slug: build-leaderboard-system
description: Build a real-time leaderboard with Redis sorted sets, time-windowed rankings, percentile calculation, anti-cheat detection, and multiplayer competition support.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - leaderboard
  - gaming
  - ranking
  - real-time
  - competition
---

# Build a Leaderboard System

## The Problem

Alex leads engineering at a 20-person fitness app. Users complete workouts and earn points, but there's no competitive element. Retention at 30 days is 18%. They tried a SQL-based leaderboard (`ORDER BY points DESC LIMIT 100`) but it takes 8 seconds on 2M users. When they added weekly leaderboards, they had to reset manually every Monday. Users in the top 10 dominate permanently — new users have no chance of ranking, so they don't try. They need time-windowed leaderboards (daily/weekly/all-time), near-instant ranking, percentile-based tiers, and anti-cheat protection.

## Step 1: Build the Leaderboard Engine

```typescript
// src/leaderboard/engine.ts — Real-time leaderboards with time windows and anti-cheat
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

type TimeWindow = "daily" | "weekly" | "monthly" | "alltime";
type LeaderboardType = "global" | "friends" | "region";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  score: number;
  tier: string;
  delta: number;               // rank change since last period
}

interface LeaderboardPage {
  entries: LeaderboardEntry[];
  totalPlayers: number;
  userRank: LeaderboardEntry | null;  // requesting user's position
  window: TimeWindow;
  expiresAt: string | null;
}

// Get leaderboard key based on time window
function getKey(type: string, window: TimeWindow): string {
  const now = new Date();
  switch (window) {
    case "daily": return `lb:${type}:${now.toISOString().slice(0, 10)}`;
    case "weekly": {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay()); // Sunday
      return `lb:${type}:w:${weekStart.toISOString().slice(0, 10)}`;
    }
    case "monthly": return `lb:${type}:m:${now.toISOString().slice(0, 7)}`;
    case "alltime": return `lb:${type}:alltime`;
  }
}

// Submit score
export async function submitScore(
  userId: string,
  score: number,
  metadata?: { activity: string; duration: number }
): Promise<{ rank: number; totalPlayers: number; isNewHighScore: boolean }> {
  // Anti-cheat: validate score
  const fraudCheck = await checkForFraud(userId, score, metadata);
  if (fraudCheck.suspicious) {
    await pool.query(
      `INSERT INTO cheat_flags (user_id, score, reason, created_at) VALUES ($1, $2, $3, NOW())`,
      [userId, score, fraudCheck.reason]
    );
    // Still record but flag — don't reveal to cheater
  }

  const windows: TimeWindow[] = ["daily", "weekly", "monthly", "alltime"];
  const pipeline = redis.pipeline();

  for (const window of windows) {
    const key = getKey("global", window);
    // ZADD with GT flag: only update if new score is greater
    pipeline.zadd(key, "GT", score, userId);

    // Set expiry for time-windowed boards
    if (window === "daily") pipeline.expire(key, 86400 * 2);
    if (window === "weekly") pipeline.expire(key, 86400 * 8);
    if (window === "monthly") pipeline.expire(key, 86400 * 35);
  }

  // Region leaderboard
  const { rows: [user] } = await pool.query("SELECT region FROM users WHERE id = $1", [userId]);
  if (user?.region) {
    for (const window of windows) {
      const regionKey = getKey(`region:${user.region}`, window);
      pipeline.zadd(regionKey, "GT", score, userId);
      if (window === "daily") pipeline.expire(regionKey, 86400 * 2);
    }
  }

  await pipeline.exec();

  // Get rank
  const allTimeKey = getKey("global", "alltime");
  const rank = await redis.zrevrank(allTimeKey, userId);
  const totalPlayers = await redis.zcard(allTimeKey);

  // Check if new high score
  const { rows: [prev] } = await pool.query(
    "SELECT high_score FROM user_scores WHERE user_id = $1", [userId]
  );
  const isNewHighScore = !prev || score > prev.high_score;

  if (isNewHighScore) {
    await pool.query(
      `INSERT INTO user_scores (user_id, high_score, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET high_score = GREATEST(user_scores.high_score, $2), updated_at = NOW()`,
      [userId, score]
    );
  }

  // Log score for analytics
  await pool.query(
    `INSERT INTO score_history (user_id, score, metadata, created_at) VALUES ($1, $2, $3, NOW())`,
    [userId, score, JSON.stringify(metadata || {})]
  );

  return { rank: (rank ?? 0) + 1, totalPlayers, isNewHighScore };
}

// Get leaderboard page
export async function getLeaderboard(
  window: TimeWindow,
  options: { offset?: number; limit?: number; userId?: string; type?: LeaderboardType; region?: string }
): Promise<LeaderboardPage> {
  const offset = options.offset || 0;
  const limit = options.limit || 50;

  let key: string;
  if (options.type === "region" && options.region) {
    key = getKey(`region:${options.region}`, window);
  } else {
    key = getKey("global", window);
  }

  // Get entries with scores (highest first)
  const raw = await redis.zrevrange(key, offset, offset + limit - 1, "WITHSCORES");
  const totalPlayers = await redis.zcard(key);

  // Parse pairs (userId, score, userId, score, ...)
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const userId = raw[i];
    const score = parseFloat(raw[i + 1]);
    const rank = offset + (i / 2) + 1;

    entries.push({
      rank, userId, score,
      username: "", avatar: "",  // filled below
      tier: calculateTier(rank, totalPlayers),
      delta: 0,
    });
  }

  // Batch fetch user info
  if (entries.length > 0) {
    const userIds = entries.map((e) => e.userId);
    const { rows: users } = await pool.query(
      `SELECT id, username, avatar_url FROM users WHERE id = ANY($1)`, [userIds]
    );
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    for (const entry of entries) {
      const user = userMap.get(entry.userId);
      if (user) {
        entry.username = user.username;
        entry.avatar = user.avatar_url || "";
      }
    }
  }

  // Get requesting user's rank
  let userRank: LeaderboardEntry | null = null;
  if (options.userId) {
    const rank = await redis.zrevrank(key, options.userId);
    if (rank !== null) {
      const score = await redis.zscore(key, options.userId);
      const { rows: [user] } = await pool.query("SELECT username, avatar_url FROM users WHERE id = $1", [options.userId]);
      userRank = {
        rank: rank + 1,
        userId: options.userId,
        username: user?.username || "",
        avatar: user?.avatar_url || "",
        score: parseFloat(score || "0"),
        tier: calculateTier(rank + 1, totalPlayers),
        delta: 0,
      };
    }
  }

  return { entries, totalPlayers, userRank, window, expiresAt: getWindowExpiry(window) };
}

// Friends leaderboard
export async function getFriendsLeaderboard(userId: string, window: TimeWindow): Promise<LeaderboardPage> {
  const friends = await redis.smembers(`friends:${userId}`);
  friends.push(userId); // include self

  const key = getKey("global", window);
  const pipeline = redis.pipeline();
  for (const friendId of friends) {
    pipeline.zscore(key, friendId);
  }
  const scores = await pipeline.exec();

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < friends.length; i++) {
    const [err, score] = scores![i];
    if (score !== null) {
      entries.push({
        rank: 0, userId: friends[i], username: "", avatar: "",
        score: parseFloat(score as string), tier: "", delta: 0,
      });
    }
  }

  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => { e.rank = i + 1; e.tier = calculateTier(i + 1, entries.length); });

  // Fetch usernames
  const userIds = entries.map((e) => e.userId);
  if (userIds.length > 0) {
    const { rows: users } = await pool.query("SELECT id, username, avatar_url FROM users WHERE id = ANY($1)", [userIds]);
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    for (const entry of entries) {
      const user = userMap.get(entry.userId);
      if (user) { entry.username = user.username; entry.avatar = user.avatar_url || ""; }
    }
  }

  return { entries, totalPlayers: entries.length, userRank: entries.find((e) => e.userId === userId) || null, window, expiresAt: null };
}

function calculateTier(rank: number, total: number): string {
  if (total === 0) return "unranked";
  const percentile = (rank / total) * 100;
  if (percentile <= 1) return "🏆 Diamond";
  if (percentile <= 5) return "🥇 Gold";
  if (percentile <= 15) return "🥈 Silver";
  if (percentile <= 30) return "🥉 Bronze";
  return "Participant";
}

async function checkForFraud(userId: string, score: number, metadata?: any): Promise<{ suspicious: boolean; reason?: string }> {
  // Check for impossible scores
  if (score > 100000) return { suspicious: true, reason: "Score exceeds maximum" };

  // Check for sudden huge jumps
  const { rows: [recent] } = await pool.query(
    `SELECT MAX(score) as max_score FROM score_history WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );
  if (recent?.max_score && score > recent.max_score * 5) {
    return { suspicious: true, reason: `5x jump: ${recent.max_score} → ${score}` };
  }

  return { suspicious: false };
}

function getWindowExpiry(window: TimeWindow): string | null {
  const now = new Date();
  switch (window) {
    case "daily": { const end = new Date(now); end.setHours(23, 59, 59, 999); return end.toISOString(); }
    case "weekly": { const end = new Date(now); end.setDate(now.getDate() + (6 - now.getDay())); end.setHours(23, 59, 59, 999); return end.toISOString(); }
    default: return null;
  }
}
```

## Results

- **30-day retention: 18% → 34%** — weekly leaderboards give new users a fresh start every Monday; anyone can be #1 this week
- **Ranking query: 8s → 1ms** — Redis sorted sets with ZREVRANK; instant rank lookup for any user among 2M players
- **Friends leaderboard drives daily engagement** — "You're #3 among friends" is more motivating than #458,291 globally; daily active users up 40%
- **Percentile tiers feel achievable** — "Top 15% Silver" motivates more than raw rank; users aim for the next tier, not #1
- **Anti-cheat prevents leaderboard pollution** — impossible score jumps flagged automatically; legitimate players trust the rankings
