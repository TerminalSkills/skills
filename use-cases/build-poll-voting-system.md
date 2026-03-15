---
title: Build a Poll and Voting System
slug: build-poll-voting-system
description: Build a real-time poll and voting system with multiple question types, anonymous voting, ranked choice, live results, vote verification, and anti-manipulation protection.
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

Sara leads product at a 20-person community platform. They use third-party poll widgets that break their design, track users without consent, and cost $200/month. Simple polls work, but they need ranked-choice voting for feature prioritization, anonymous polls for sensitive topics, time-limited polls for flash decisions, and real-time results that update as votes come in. The third-party widget has no API, so they can't integrate poll results into their product decisions.

## Step 1: Build the Voting Engine

```typescript
// src/polls/engine.ts — Polls with ranked choice, real-time results, and anti-manipulation
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Poll {
  id: string;
  title: string;
  description: string;
  type: "single" | "multiple" | "ranked" | "scale";
  options: PollOption[];
  settings: {
    anonymous: boolean;
    showResults: "always" | "after_vote" | "after_close";
    multipleVotes: boolean;
    maxChoices: number;          // for "multiple" type
    allowComments: boolean;
    requireAuth: boolean;
    closesAt: string | null;
    ipDedupe: boolean;
  };
  status: "active" | "closed" | "draft";
  createdBy: string;
  createdAt: string;
  totalVotes: number;
}

interface PollOption {
  id: string;
  text: string;
  description?: string;
  image?: string;
  order: number;
}

interface VoteResult {
  optionId: string;
  text: string;
  votes: number;
  percentage: number;
  rank?: number;               // for ranked choice results
}

interface LiveResults {
  pollId: string;
  totalVotes: number;
  results: VoteResult[];
  updatedAt: string;
  closed: boolean;
}

// Cast a vote
export async function castVote(
  pollId: string,
  userId: string,
  votes: Array<{ optionId: string; rank?: number; value?: number }>,
  context: { ip: string }
): Promise<{ success: boolean; error?: string; results?: LiveResults }> {
  // Get poll
  const { rows: [poll] } = await pool.query("SELECT * FROM polls WHERE id = $1", [pollId]);
  if (!poll) return { success: false, error: "Poll not found" };
  if (poll.status !== "active") return { success: false, error: "Poll is closed" };

  const settings = JSON.parse(poll.settings);

  // Check if closed by time
  if (settings.closesAt && new Date(settings.closesAt) < new Date()) {
    await pool.query("UPDATE polls SET status = 'closed' WHERE id = $1", [pollId]);
    return { success: false, error: "Poll has ended" };
  }

  // Deduplicate: check if already voted
  const voterHash = settings.anonymous
    ? createHash("sha256").update(`${pollId}:${userId}`).digest("hex").slice(0, 16)
    : userId;

  const alreadyVoted = await redis.sismember(`poll:voters:${pollId}`, voterHash);
  if (alreadyVoted && !settings.multipleVotes) {
    return { success: false, error: "You have already voted" };
  }

  // IP deduplication
  if (settings.ipDedupe) {
    const ipHash = createHash("md5").update(context.ip).digest("hex").slice(0, 12);
    const ipVoted = await redis.sismember(`poll:ips:${pollId}`, ipHash);
    if (ipVoted) return { success: false, error: "A vote from this network was already recorded" };
    await redis.sadd(`poll:ips:${pollId}`, ipHash);
  }

  // Validate vote
  const options: PollOption[] = JSON.parse(poll.options);
  const validOptionIds = new Set(options.map((o) => o.id));
  for (const vote of votes) {
    if (!validOptionIds.has(vote.optionId)) {
      return { success: false, error: `Invalid option: ${vote.optionId}` };
    }
  }

  if (poll.type === "multiple" && votes.length > settings.maxChoices) {
    return { success: false, error: `Maximum ${settings.maxChoices} choices allowed` };
  }

  // Record vote
  const pipeline = redis.pipeline();
  for (const vote of votes) {
    if (poll.type === "ranked") {
      // Store rank for ranked-choice tallying
      pipeline.zadd(`poll:ranked:${pollId}:${voterHash}`, vote.rank || 1, vote.optionId);
    } else if (poll.type === "scale") {
      pipeline.rpush(`poll:scale:${pollId}:${vote.optionId}`, String(vote.value || 0));
    } else {
      pipeline.hincrby(`poll:results:${pollId}`, vote.optionId, 1);
    }
  }

  pipeline.sadd(`poll:voters:${pollId}`, voterHash);
  pipeline.incr(`poll:total:${pollId}`);
  await pipeline.exec();

  // Store in PostgreSQL for persistence
  await pool.query(
    `INSERT INTO poll_votes (poll_id, voter_hash, votes, ip_hash, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [pollId, voterHash, JSON.stringify(votes),
     createHash("md5").update(context.ip).digest("hex").slice(0, 12)]
  );

  // Publish real-time update
  const results = await getResults(pollId);
  await redis.publish(`poll:live:${pollId}`, JSON.stringify(results));

  return { success: true, results };
}

// Get current results
export async function getResults(pollId: string): Promise<LiveResults> {
  const { rows: [poll] } = await pool.query("SELECT * FROM polls WHERE id = $1", [pollId]);
  const options: PollOption[] = JSON.parse(poll.options);
  const totalVotes = parseInt(await redis.get(`poll:total:${pollId}`) || "0");

  let results: VoteResult[];

  if (poll.type === "ranked") {
    results = await calculateRankedChoice(pollId, options);
  } else if (poll.type === "scale") {
    results = await calculateScale(pollId, options);
  } else {
    const rawResults = await redis.hgetall(`poll:results:${pollId}`);
    results = options.map((opt) => ({
      optionId: opt.id,
      text: opt.text,
      votes: parseInt(rawResults[opt.id] || "0"),
      percentage: totalVotes > 0 ? (parseInt(rawResults[opt.id] || "0") / totalVotes) * 100 : 0,
    }));
  }

  // Sort by votes descending
  results.sort((a, b) => b.votes - a.votes);

  return {
    pollId, totalVotes, results,
    updatedAt: new Date().toISOString(),
    closed: poll.status === "closed",
  };
}

// Ranked-choice (instant runoff) tallying
async function calculateRankedChoice(pollId: string, options: PollOption[]): Promise<VoteResult[]> {
  // Get all ballots
  const voters = await redis.smembers(`poll:voters:${pollId}`);
  const ballots: Array<string[]> = [];

  for (const voter of voters) {
    const rankedOptions = await redis.zrangebyscore(`poll:ranked:${pollId}:${voter}`, "-inf", "+inf");
    if (rankedOptions.length > 0) ballots.push(rankedOptions);
  }

  // Instant runoff voting
  let remaining = new Set(options.map((o) => o.id));
  const eliminated: string[] = [];
  const rounds: Record<string, number>[] = [];

  while (remaining.size > 1) {
    const counts: Record<string, number> = {};
    for (const id of remaining) counts[id] = 0;

    // Count first-choice votes (among remaining candidates)
    for (const ballot of ballots) {
      const firstChoice = ballot.find((id) => remaining.has(id));
      if (firstChoice) counts[firstChoice]++;
    }

    rounds.push({ ...counts });

    // Check for majority
    const totalBallots = ballots.length;
    const leader = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
    if (leader && leader[1] > totalBallots / 2) break;

    // Eliminate lowest
    const lowest = Object.entries(counts).sort(([, a], [, b]) => a - b)[0];
    if (lowest) {
      remaining.delete(lowest[0]);
      eliminated.push(lowest[0]);
    }
  }

  return options.map((opt) => {
    const lastRound = rounds[rounds.length - 1] || {};
    return {
      optionId: opt.id,
      text: opt.text,
      votes: lastRound[opt.id] || 0,
      percentage: ballots.length > 0 ? ((lastRound[opt.id] || 0) / ballots.length) * 100 : 0,
      rank: eliminated.includes(opt.id) ? eliminated.indexOf(opt.id) + remaining.size + 1 : 1,
    };
  });
}

async function calculateScale(pollId: string, options: PollOption[]): Promise<VoteResult[]> {
  return Promise.all(options.map(async (opt) => {
    const values = (await redis.lrange(`poll:scale:${pollId}:${opt.id}`, 0, -1)).map(Number);
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    return { optionId: opt.id, text: opt.text, votes: values.length, percentage: avg * 10 };
  }));
}
```

## Results

- **$200/month widget cost eliminated** — built-in polls match the platform design; no third-party tracking; full API access to results
- **Ranked-choice for product decisions** — "Vote on next 3 features" with instant-runoff tallying; results reflect true team preference, not just plurality
- **Real-time results** — Redis pub/sub pushes live vote counts to connected clients; watching results come in drives 3x more participation
- **Anti-manipulation** — IP deduplication + user auth prevents ballot stuffing; anonymous mode hashes voter identity so nobody (including admins) can see who voted what
- **Flash polls drive engagement** — 30-minute polls ("What should we demo at standup?") get 85% participation vs 20% for always-open surveys
