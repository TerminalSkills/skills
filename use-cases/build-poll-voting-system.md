---
title: Build a Poll and Voting System
slug: build-poll-voting-system
description: Build a real-time poll and voting system with single-choice, multiple-choice and ranked-choice polls, anonymous voting, live results over Server-Sent Events, and one-vote-per-person enforcement in the database.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - polls
  - voting
  - real-time
  - engagement
  - interactive
---

# Build a Poll and Voting System

## The Problem

Sara leads product at a 20-person community platform. They use a third-party poll widget that clashes with their design, tracks users without consent and costs $200 a month. Simple polls work, but they need ranked-choice voting for feature prioritisation, anonymous polls for sensitive topics, time-limited polls for quick decisions, and live results. The widget has no API, so poll results cannot feed their product decisions.

## The Solution

PostgreSQL is the source of truth, because a vote count has to be correct before it is fast. Three tables do the work: `polls`, `poll_voters` (who has voted, with a primary key that makes a second vote impossible) and `poll_ballots` (what was chosen). Results are computed from the ballots, and ranked polls use an instant-runoff tally. Redis is used only for pub/sub: after each committed vote the server publishes a signal, and each connected client gets fresh results over Server-Sent Events.

Anonymity comes from keeping the two tables apart. The voter table holds an HMAC of the poll and user id, keyed with a server secret, and the ballot table holds neither a voter key nor a timestamp, so a ballot cannot be traced back to a person from the data alone. Counters kept in Redis and a "check, then record" sequence are avoided on purpose: two simultaneous requests would both pass the check.

```bash
npm i pg ioredis zod hono @hono/node-server
npm i -D typescript tsx @types/node @types/pg
```

## Step-by-Step Walkthrough

### Step 1: The schema

`options` is JSON because options never change after a poll opens. The primary key on `poll_voters` is what enforces one vote per person.

```sql
CREATE TABLE polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('single', 'multiple', 'ranked')),
  options jsonb NOT NULL,                 -- [{"id": "<uuid>", "text": "Dark mode"}, ...]
  max_choices int NOT NULL DEFAULT 1,     -- for 'multiple'
  anonymous boolean NOT NULL DEFAULT false,
  show_results text NOT NULL DEFAULT 'always' CHECK (show_results IN ('always', 'after_close')),
  closes_at timestamptz,
  status text NOT NULL DEFAULT 'active'
);
-- Who has voted: the only place a voter key appears. Primary key = one vote per voter.
CREATE TABLE poll_voters (
  poll_id uuid REFERENCES polls(id), voter_key text NOT NULL,
  PRIMARY KEY (poll_id, voter_key)
);
-- What was chosen: no voter key and no timestamp, so an anonymous ballot cannot be linked back.
CREATE TABLE poll_ballots (
  id bigserial PRIMARY KEY, poll_id uuid REFERENCES polls(id), choices uuid[] NOT NULL
);
CREATE INDEX ON poll_ballots (poll_id);
```

### Step 2: Casting a vote

Everything happens in one transaction: the poll must be active and before `closes_at`, the choices must be distinct options of this poll and within the limit for its kind, and the voter row must be new (`ON CONFLICT DO NOTHING` plus `rowCount`). A ballot is always an ordered list of option ids, which covers all three poll kinds: one id for `single`, up to `max_choices` for `multiple`, a ranking for `ranked`. Set `VOTER_KEY_SECRET` to a long random value from your secret store and never change it while polls are open, or voters could vote twice.

```typescript
import pg from "pg";
import { Redis } from "ioredis";
import { createHmac } from "node:crypto";
import { z } from "zod";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

// A ballot is an ordered list of distinct option ids: one id for "single",
// up to max_choices for "multiple", a full or partial ranking for "ranked".
export const Ballot = z.object({ choices: z.array(z.uuid()).min(1).max(50) });

// HMAC with a server-side secret: the key cannot be recomputed from a user id
// without the secret, and it is not stored next to the ballot.
const voterKey = (pollId: string, userId: string) =>
  createHmac("sha256", process.env.VOTER_KEY_SECRET!).update(`${pollId}:${userId}`).digest("hex");

export async function castVote(pollId: string, userId: string, input: unknown) {
  const ballot = Ballot.safeParse(input);
  if (!ballot.success) return { ok: false as const, status: 400, error: "Invalid ballot" };
  const { choices } = ballot.data;

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [poll] } = await db.query(
      `SELECT kind, options, max_choices, anonymous FROM polls
       WHERE id = $1 AND status = 'active' AND (closes_at IS NULL OR closes_at > now())`, [pollId]);
    if (!poll) { await db.query("ROLLBACK"); return { ok: false as const, status: 404, error: "Poll not found or closed" }; }

    const valid = new Set(poll.options.map((o: { id: string }) => o.id));
    const limit = poll.kind === "single" ? 1 : poll.kind === "multiple" ? poll.max_choices : valid.size;
    if (new Set(choices).size !== choices.length || choices.length > limit || !choices.every((c) => valid.has(c))) {
      await db.query("ROLLBACK");
      return { ok: false as const, status: 400, error: "Choices must be distinct options of this poll" };
    }

    // The primary key makes "already voted" atomic, even for two simultaneous requests
    const key = poll.anonymous ? voterKey(pollId, userId) : userId;
    const claimed = await db.query(
      "INSERT INTO poll_voters (poll_id, voter_key) VALUES ($1, $2) ON CONFLICT DO NOTHING", [pollId, key]);
    if (claimed.rowCount === 0) { await db.query("ROLLBACK"); return { ok: false as const, status: 409, error: "Already voted" }; }

    await db.query("INSERT INTO poll_ballots (poll_id, choices) VALUES ($1, $2)", [pollId, choices]);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
  // Fan out after the commit; subscribers re-read results, so a lost message costs nothing
  await redis.publish(`poll:${pollId}`, "updated");
  return { ok: true as const };
}

export async function getResults(pollId: string) {
  const { rows: [poll] } = await pool.query(
    "SELECT kind, options, show_results, status, closes_at FROM polls WHERE id = $1", [pollId]);
  if (!poll) return null;
  const closed = poll.status !== "active" || (poll.closes_at !== null && poll.closes_at < new Date());
  if (poll.show_results === "after_close" && !closed) return { hidden: true, closed: false };

  const { rows: ballots } = await pool.query("SELECT choices FROM poll_ballots WHERE poll_id = $1", [pollId]);
  const text = new Map<string, string>(poll.options.map((o: { id: string; text: string }) => [o.id, o.text]));
  const tally = poll.kind === "ranked" ? instantRunoff(ballots.map((b) => b.choices), [...text.keys()])
    : countChoices(ballots.map((b) => b.choices), [...text.keys()]);
  return {
    closed, totalBallots: ballots.length, winner: tally.winner ?? null,
    results: tally.counts.map(([id, votes]) => ({
      optionId: id, text: text.get(id), votes, percent: ballots.length ? Math.round((votes / ballots.length) * 1000) / 10 : 0,
    })),
  };
}

type Tally = { counts: [string, number][]; winner?: string };

function countChoices(ballots: string[][], ids: string[]): Tally {
  const n = new Map(ids.map((id) => [id, 0]));
  for (const b of ballots) for (const c of b) n.set(c, (n.get(c) ?? 0) + 1);
  return { counts: [...n].sort((a, b) => b[1] - a[1]) };
}

// Instant runoff: count each ballot for its highest-ranked remaining option, stop when one option
// has more than half of the ballots still in play, otherwise drop the weakest and recount.
// Ties for last are broken by first-round count, then by id, so the result is deterministic.
export function instantRunoff(ballots: string[][], ids: string[]): Tally {
  const remaining = new Set(ids);
  const first = new Map(ids.map((id) => [id, 0]));
  for (const b of ballots) if (b[0]) first.set(b[0], (first.get(b[0]) ?? 0) + 1);
  for (;;) {
    const counts = new Map([...remaining].map((id) => [id, 0]));
    let active = 0;
    for (const b of ballots) {
      const top = b.find((c) => remaining.has(c));
      if (top) { counts.set(top, counts.get(top)! + 1); active++; }
    }
    const sorted = [...counts].sort((a, b) => b[1] - a[1] || (first.get(b[0])! - first.get(a[0])!) || a[0].localeCompare(b[0]));
    if (remaining.size === 1 || (sorted[0] && sorted[0][1] * 2 > active)) return { counts: sorted, winner: sorted[0]?.[0] };
    remaining.delete(sorted[sorted.length - 1][0]);
  }
}
```

### Step 3: Routes and live results

`GET /polls/:id/live` streams results with Hono's `streamSSE`. Each stream opens its own Redis subscriber connection, since a subscribed ioredis connection cannot run other commands, and closes it when the client leaves. Subscribers re-read the results rather than trusting the message body, so a missed message does not matter. Serve with `serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 })` from `@hono/node-server` behind your reverse proxy, with the auth middleware that sets `userId` mounted first.

```typescript
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Redis } from "ioredis";
import { castVote, getResults, pool, redis } from "./polls";

export const app = new Hono<{ Variables: { userId: string } }>(); // auth middleware sets userId

app.post("/polls/:id/votes", async (c) => {
  const r = await castVote(c.req.param("id"), c.get("userId"), await c.req.json().catch(() => null));
  return r.ok ? c.json({ ok: true }, 201) : c.json({ error: r.error }, r.status as 400 | 404 | 409);
});

app.get("/polls/:id/results", async (c) => {
  const results = await getResults(c.req.param("id"));
  return results ? c.json(results) : c.json({ error: "Poll not found" }, 404);
});

// Live results over Server-Sent Events: one subscriber connection per stream
app.get("/polls/:id/live", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const sub = new Redis(redis.options);
    const push = async () => stream.writeSSE({ event: "results", data: JSON.stringify(await getResults(id)) });
    await sub.subscribe(`poll:${id}`);
    sub.on("message", push);
    stream.onAbort(() => sub.disconnect());
    await push();
    while (!stream.aborted) await stream.sleep(15_000).then(() => stream.writeSSE({ event: "ping", data: "" }));
  });
});
```

```bash
curl -N http://127.0.0.1:3000/polls/$POLL_ID/live
curl -X POST http://127.0.0.1:3000/polls/$POLL_ID/votes -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"choices":["'$FIRST_OPTION_ID'","'$SECOND_OPTION_ID'"]}'
```

## Real-World Example

Sara's team opens a ranked poll, "Which two features first?", with five options, anonymous, results shown only after close. Members rank what they care about; a voter who ranks only two options is still counted until both are eliminated. When the poll closes, `/results` returns the instant-runoff winner and each option's count in the final round. A flash poll for the standup is the same record with `closes_at` thirty minutes out and `show_results = 'always'`, and the page streams each new vote as it lands.

Checked against PostgreSQL 16 and Redis 7 locally: 20 simultaneous votes from one user produced one `201` and nineteen `409`; a ballot with a repeated option, an option from another poll or too many choices was rejected with `400`; a vote after `closes_at` got `404`; and the stored ballot rows contained no voter key. The instant-runoff function returned the expected winner for a 4-3-2 first-round split where the 2 voters' second choice decided the result.

What this does not do: it cannot tell whether one person has several accounts. That is solved by who you allow to sign in (verified email, membership age), not by hashing IP addresses, which blocks people on shared networks while a VPN defeats it. Add rate limiting at the proxy for abuse. The tally reads every ballot of the poll, which is fine for thousands of voters; at hundreds of thousands, count `single` and `multiple` polls with SQL `unnest` and `GROUP BY`.

## Related Skills

- [typescript](/skills/typescript), [redis](/skills/redis), [postgresql](/skills/postgresql)
- [hono](/skills/hono), [zod](/skills/zod)
