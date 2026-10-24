---
title: Build a Gamification System with Points and Badges
slug: build-gamification-system
description: Build a gamification engine with XP points, leveling, achievement badges, streaks, leaderboards, and reward unlocks — driving user engagement through game mechanics.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - gamification
  - engagement
  - badges
  - leaderboard
  - retention
---

# Build a Gamification System with Points and Badges

## The Problem

Hana leads product at a 25-person learning platform. Course completion is low: users sign up, watch one or two lessons, and never return. There is no sense of progress, no reward for consistency, and no social proof. Duolingo-style streaks keep users coming back daily, and Hana wants the same mechanics: XP for completed lessons, levels, badges for achievements, streaks for daily engagement and a leaderboard.

## The Solution

Postgres is the source of truth for XP, streaks and badges, and every award is one transaction. Redis holds the leaderboards as sorted sets, which makes "top 20 this week" a single fast command. A small Hono API receives learning events and zod validates them. The game rules (XP table, levels, badge conditions) live in one pure TypeScript file, so product can tune them without touching I/O code.

Three design rules keep the numbers trustworthy:

- **Idempotent awards.** Every event carries an `eventId`; a retry or replayed webhook cannot pay twice.
- **Locked updates.** `SELECT ... FOR UPDATE` serializes concurrent events for one user, so XP, streaks and level-ups cannot race.
- **Redis is a cache.** The ledger (`xp_events`) is authoritative; leaderboards can always be rebuilt from it.

## Step-by-Step Walkthrough

### Step 1: Install and create the schema

```bash
npm install ioredis pg hono @hono/node-server @hono/zod-validator zod
npm install -D typescript tsx @types/pg @types/node
```

`ioredis` 6 uses the RESP3 protocol by default and needs Node.js 20 or newer. Run your own Postgres and Redis, bound to localhost; the connection strings go in `DATABASE_URL` and `REDIS_URL`.

```sql
CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL, avatar_url text);

CREATE TABLE user_gamification (
  user_id           text PRIMARY KEY REFERENCES users(id),
  total_xp          integer NOT NULL DEFAULT 0,
  level             integer NOT NULL DEFAULT 1,
  lessons_completed integer NOT NULL DEFAULT 0,
  courses_completed integer NOT NULL DEFAULT 0,
  perfect_scores    integer NOT NULL DEFAULT 0,
  current_streak    integer NOT NULL DEFAULT 0,
  longest_streak    integer NOT NULL DEFAULT 0,
  last_active_day   date
);

-- One row per award; the unique event_id makes retries and duplicate webhooks harmless
CREATE TABLE xp_events (
  event_id   text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  action     text NOT NULL,
  xp         integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_time ON xp_events (user_id, created_at);

CREATE TABLE user_badges (
  user_id   text NOT NULL REFERENCES users(id),
  badge_id  text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
```

### Step 2: Game rules

Levels, XP values, badges, the streak multiplier and the ISO-week key are plain functions with no database access.

```typescript
// src/rules.ts: pure game rules, no I/O, easy to unit test
export const LEVELS = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000]; // XP needed for level 1..10

export const XP_REWARDS = {
  lesson_completed: 25,
  quiz_passed: 50,
  quiz_perfect_score: 100,
  course_completed: 500,
  helpful_answer: 30,
  daily_login: 5,
} as const;
export type Action = keyof typeof XP_REWARDS;

// Which counter column an action increments (a fixed whitelist, never built from user input)
export const COUNTER: Partial<Record<Action, string>> = {
  lesson_completed: "lessons_completed",
  course_completed: "courses_completed",
  quiz_perfect_score: "perfect_scores",
};

export interface Stats {
  total_xp: number; level: number; lessons_completed: number; courses_completed: number;
  perfect_scores: number; current_streak: number; longest_streak: number;
}

export const BADGES = [
  { id: "first_lesson", name: "First Step", rarity: "common", earned: (s: Stats) => s.lessons_completed >= 1 },
  { id: "hundred_lessons", name: "Centurion", rarity: "rare", earned: (s: Stats) => s.lessons_completed >= 100 },
  { id: "first_course", name: "Graduate", rarity: "uncommon", earned: (s: Stats) => s.courses_completed >= 1 },
  { id: "streak_7", name: "On Fire", rarity: "uncommon", earned: (s: Stats) => s.current_streak >= 7 },
  { id: "streak_30", name: "Unstoppable", rarity: "epic", earned: (s: Stats) => s.current_streak >= 30 },
  { id: "streak_100", name: "Legendary Commitment", rarity: "legendary", earned: (s: Stats) => s.longest_streak >= 100 },
  { id: "perfect_quiz", name: "Perfectionist", rarity: "uncommon", earned: (s: Stats) => s.perfect_scores >= 1 },
  { id: "level_10", name: "Legend", rarity: "legendary", earned: (s: Stats) => s.level >= 10 },
];

export const levelFor = (xp: number) => LEVELS.filter((min) => xp >= min).length;
export const multiplierFor = (streak: number) => (streak >= 30 ? 1.5 : streak >= 7 ? 1.2 : 1);
// One-off bonus on the day a streak reaches exactly 7 or 30
export const streakBonus = (streak: number) => (streak === 7 ? 50 : streak === 30 ? 200 : 0);

export function nextStreak(lastDay: string | null, today: string, current: number): number {
  if (lastDay === today) return current;
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  return lastDay === yesterday ? current + 1 : 1;
}

// ISO week key such as "2026-W43", used to name the weekly leaderboard
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
```

### Step 3: The award engine

One transaction records the event, updates the streak, XP and counters, and grants badges. Only after the commit does it touch Redis. The `COUNTER` map is a fixed whitelist, because column names cannot be bound as SQL parameters and must never come from the request.

```typescript
// src/engine.ts: award XP inside one Postgres transaction, then update Redis leaderboards
import pg from "pg";
import { Redis } from "ioredis";
import { BADGES, COUNTER, XP_REWARDS, Action, Stats, levelFor, multiplierFor, nextStreak, streakBonus, weekKey } from "./rules.js";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL!);

export async function awardXP(userId: string, action: Action, eventId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Duplicate eventId (retry, double click, replayed webhook) => no second award
    const dup = await client.query(
      "INSERT INTO xp_events (event_id, user_id, action, xp) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING RETURNING 1",
      [eventId, userId, action]
    );
    if (dup.rowCount === 0) { await client.query("ROLLBACK"); return { duplicate: true as const }; }

    await client.query("INSERT INTO user_gamification (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    // FOR UPDATE serializes concurrent awards for the same user, so streaks and XP cannot race
    const { rows: [before] } = await client.query(
      "SELECT *, last_active_day::text AS last_day, (now() AT TIME ZONE 'UTC')::date::text AS today FROM user_gamification WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const streak = nextStreak(before.last_day, before.today, before.current_streak);
    const xp = Math.round(XP_REWARDS[action] * multiplierFor(streak)) + (streak !== before.current_streak ? streakBonus(streak) : 0);
    const counter = COUNTER[action];
    const { rows: [after] } = await client.query(
      `UPDATE user_gamification SET total_xp = total_xp + $2, current_streak = $3,
         longest_streak = GREATEST(longest_streak, $3), last_active_day = $4::date
         ${counter ? `, ${counter} = ${counter} + 1` : ""}
       WHERE user_id = $1 RETURNING *`,
      [userId, xp, streak, before.today]
    );
    const level = levelFor(after.total_xp);
    await client.query("UPDATE user_gamification SET level = $2 WHERE user_id = $1", [userId, level]);
    await client.query("UPDATE xp_events SET xp = $2 WHERE event_id = $1", [eventId, xp]);

    const stats: Stats = { ...after, level };
    const { rows: owned } = await client.query("SELECT badge_id FROM user_badges WHERE user_id = $1", [userId]);
    const have = new Set(owned.map((r) => r.badge_id));
    const newBadges = BADGES.filter((b) => !have.has(b.id) && b.earned(stats));
    for (const b of newBadges) {
      await client.query("INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, b.id]);
    }
    await client.query("COMMIT");

    // Leaderboards are a cache of xp_events. If Redis is down the award still stands and they can be rebuilt.
    const week = `leaderboard:weekly:${weekKey()}`;
    await redis.multi().zincrby(week, xp, userId).expire(week, 14 * 86_400).zincrby("leaderboard:alltime", xp, userId).exec()
      .catch((err) => console.error("leaderboard update failed; rebuild from xp_events", err));

    return { duplicate: false as const, xpAwarded: xp, totalXp: after.total_xp, streak, level,
      leveledUp: level > before.level, newBadges: newBadges.map((b) => ({ id: b.id, name: b.name, rarity: b.rarity })) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getLeaderboard(period: "weekly" | "alltime", limit = 20) {
  const key = period === "weekly" ? `leaderboard:weekly:${weekKey()}` : "leaderboard:alltime";
  const entries = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
  const ids: string[] = [], scores: number[] = [];
  for (let i = 0; i < entries.length; i += 2) { ids.push(entries[i]); scores.push(Number(entries[i + 1])); }
  if (ids.length === 0) return [];
  // One query, not one per row. The level comes from lifetime XP, not from the weekly score
  const { rows } = await pool.query(
    "SELECT u.id, u.username, u.avatar_url, coalesce(g.level, 1) AS level FROM users u LEFT JOIN user_gamification g ON g.user_id = u.id WHERE u.id = ANY($1)", [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id, i) => ({
    rank: i + 1, userId: id, username: byId.get(id)?.username ?? "Unknown",
    avatar: byId.get(id)?.avatar_url ?? "", xp: scores[i], level: byId.get(id)?.level ?? 1,
  }));
}
```

### Step 4: The HTTP API

zod rejects any action that is not in the XP table before it reaches the engine. In production, take `userId` from the authenticated session or from a signed server-to-server call, never from a public request body. Streak days are counted in UTC here; a learning product with a global audience should store each user's timezone and pass the local date in.

```typescript
// src/server.ts: HTTP API with Hono; zod validates every request body
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { awardXP, getLeaderboard } from "./engine.js";
import { XP_REWARDS } from "./rules.js";

const app = new Hono();

const eventSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(Object.keys(XP_REWARDS) as [keyof typeof XP_REWARDS, ...(keyof typeof XP_REWARDS)[]]),
  eventId: z.string().min(8).max(128), // e.g. "lesson-4412-user-88-attempt-1", built by the caller
});

app.post("/events", zValidator("json", eventSchema), async (c) => {
  const { userId, action, eventId } = c.req.valid("json");
  return c.json(await awardXP(userId, action, eventId));
});

app.get("/leaderboard/:period", zValidator("param", z.object({ period: z.enum(["weekly", "alltime"]) })), async (c) =>
  c.json(await getLeaderboard(c.req.valid("param").period))
);

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" });
```

### Step 5: Try it

```bash
export DATABASE_URL=postgres://postgres:$PGPASSWORD@127.0.0.1:5432/postgres REDIS_URL=redis://127.0.0.1:6379
npx tsx src/server.ts &
curl -s -X POST 127.0.0.1:3000/events -H 'content-type: application/json' \
  -d '{"userId":"u1","action":"lesson_completed","eventId":"lesson-1-u1-a1"}'
curl -s 127.0.0.1:3000/leaderboard/weekly
```

```console
{"duplicate":false,"xpAwarded":25,"totalXp":25,"streak":1,"level":1,"leveledUp":false,"newBadges":[{"id":"first_lesson","name":"First Step","rarity":"common"}]}
```

Sending the same `eventId` again returns `{"duplicate":true}` and changes nothing. The weekly leaderboard is a separate Redis key per ISO week (`leaderboard:weekly:2026-W43`) that expires after 14 days, so it resets itself with no cron job.

To rebuild a leaderboard after a Redis loss, replay the ledger:

```sql
SELECT user_id, sum(xp) AS xp FROM xp_events
WHERE created_at >= date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
GROUP BY user_id;
```

Write each row back with `ZADD leaderboard:weekly:<week> <xp> <user_id>`.

## Real-World Example

Hana's team wires the lesson player and the quiz service to `POST /events`, using `lesson-{lessonId}-{userId}-{attemptNo}` as the `eventId`. The front end shows the `leveledUp` and `newBadges` fields of the response as a toast, which means the client never computes game state itself. Badge names and thresholds sit in `rules.ts`, so the product team tunes them in a pull request.

Before launch, Hana records the current 7-day return rate and course completion rate. After four weeks she compares them for users who earned a streak badge against those who did not, remembering that engaged users earn badges more often, so she holds back a control group for the next release. Whatever the numbers turn out to be, the `xp_events` ledger gives her the raw data to answer the question.

## Related Skills

- [typescript](https://terminalskills.io/skills/typescript): strict typing for the rules and engine
- [redis](https://terminalskills.io/skills/redis): sorted-set leaderboards with expiring weekly keys
- [postgresql](https://terminalskills.io/skills/postgresql): transactions, row locks and idempotent inserts
- [hono](https://terminalskills.io/skills/hono): the HTTP API
- [zod](https://terminalskills.io/skills/zod): request validation
