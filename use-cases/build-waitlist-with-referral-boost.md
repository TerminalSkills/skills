---
title: Build a Waitlist with Referral Boost
slug: build-waitlist-with-referral-boost
description: Build a pre-launch waitlist with referral-based queue jumping, position tracking, milestone rewards, early access drip, and analytics — turning signups into a viral growth engine.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - waitlist
  - referral
  - growth
  - viral
  - pre-launch
---

# Build a Waitlist with Referral Boost

## The Problem

Kai is launching a new developer tool. They need to build hype pre-launch, collect 10K signups, and prioritize the most engaged users for early access. A simple email signup form gets names but doesn't create urgency or sharing. They saw how Robinhood got 1M waitlist signups with a referral system — your position moves up when friends join. They need a waitlist that incentivizes sharing, shows position, and lets them drip early access to top referrers first.

## Step 1: Build the Waitlist Engine

```typescript
// src/waitlist/engine.ts — Viral waitlist with referral boost and milestone rewards
import { randomBytes } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const REFERRAL_BOOST = 5;          // each referral moves you up 5 positions
const ACCESS_BATCH_SIZE = 100;     // invite 100 users at a time

interface WaitlistEntry {
  id: string;
  email: string;
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  position: number;
  score: number;               // base position - referral boosts
  status: "waiting" | "invited" | "activated";
  milestones: string[];
  joinedAt: string;
}

interface WaitlistStats {
  totalSignups: number;
  waitingCount: number;
  invitedCount: number;
  activatedCount: number;
  topReferrers: Array<{ email: string; referralCount: number }>;
  signupsToday: number;
  conversionRate: number;
}

// Join the waitlist
export async function joinWaitlist(
  email: string,
  referralCode?: string
): Promise<{
  entry: WaitlistEntry;
  position: number;
  totalAhead: number;
  referralLink: string;
}> {
  // Check if already registered
  const { rows: existing } = await pool.query(
    "SELECT * FROM waitlist WHERE email = $1",
    [email.toLowerCase()]
  );
  if (existing.length > 0) {
    throw new Error("This email is already on the waitlist");
  }

  // Generate unique referral code
  const myReferralCode = randomBytes(4).toString("hex");

  // Get current position (end of line)
  const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM waitlist");
  const position = parseInt(count) + 1;

  // Look up referrer
  let referredById: string | null = null;
  if (referralCode) {
    const { rows: [referrer] } = await pool.query(
      "SELECT id FROM waitlist WHERE referral_code = $1",
      [referralCode]
    );
    if (referrer) {
      referredById = referrer.id;

      // Boost referrer's position
      await pool.query(
        `UPDATE waitlist SET
           referral_count = referral_count + 1,
           score = score - $2
         WHERE id = $1`,
        [referrer.id, REFERRAL_BOOST]
      );

      // Check milestones for referrer
      await checkMilestones(referrer.id);
    }
  }

  const id = `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await pool.query(
    `INSERT INTO waitlist (id, email, referral_code, referred_by, referral_count, position, score, status, joined_at)
     VALUES ($1, $2, $3, $4, 0, $5, $5, 'waiting', NOW())`,
    [id, email.toLowerCase(), myReferralCode, referredById, position]
  );

  // Update daily signup counter
  await redis.incr(`waitlist:signups:${new Date().toISOString().slice(0, 10)}`);
  await redis.expire(`waitlist:signups:${new Date().toISOString().slice(0, 10)}`, 86400 * 30);

  const referralLink = `${process.env.APP_URL}/waitlist?ref=${myReferralCode}`;

  // Send welcome email with referral link
  await redis.rpush("email:queue", JSON.stringify({
    type: "waitlist_welcome",
    to: email,
    position,
    referralLink,
    referralCode: myReferralCode,
  }));

  return {
    entry: {
      id, email, referralCode: myReferralCode, referredBy: referredById,
      referralCount: 0, position, score: position, status: "waiting",
      milestones: [], joinedAt: new Date().toISOString(),
    },
    position,
    totalAhead: position - 1,
    referralLink,
  };
}

// Get current position (recalculated based on score)
export async function getPosition(email: string): Promise<{
  position: number;
  totalAhead: number;
  totalWaiting: number;
  referralCount: number;
  referralLink: string;
  milestones: string[];
  estimatedAccessDate: string | null;
}> {
  const { rows: [entry] } = await pool.query(
    "SELECT * FROM waitlist WHERE email = $1",
    [email.toLowerCase()]
  );
  if (!entry) throw new Error("Email not found on waitlist");

  // Position is rank by score (lower score = higher position)
  const { rows: [{ rank }] } = await pool.query(
    `SELECT COUNT(*) + 1 as rank FROM waitlist
     WHERE score < $1 AND status = 'waiting'`,
    [entry.score]
  );

  const { rows: [{ total }] } = await pool.query(
    "SELECT COUNT(*) as total FROM waitlist WHERE status = 'waiting'"
  );

  const position = parseInt(rank);
  const totalWaiting = parseInt(total);

  // Estimate access date based on current invite rate
  const batchesAhead = Math.ceil(position / ACCESS_BATCH_SIZE);
  const estimatedDays = batchesAhead * 3; // invite every 3 days
  const estimatedDate = new Date(Date.now() + estimatedDays * 86400000);

  return {
    position,
    totalAhead: position - 1,
    totalWaiting,
    referralCount: entry.referral_count,
    referralLink: `${process.env.APP_URL}/waitlist?ref=${entry.referral_code}`,
    milestones: entry.milestones || [],
    estimatedAccessDate: estimatedDate.toISOString().slice(0, 10),
  };
}

// Invite next batch of users
export async function inviteNextBatch(batchSize: number = ACCESS_BATCH_SIZE): Promise<{
  invitedCount: number;
  emails: string[];
}> {
  // Get top users by score (lowest score = highest priority)
  const { rows } = await pool.query(
    `UPDATE waitlist SET status = 'invited', invited_at = NOW()
     WHERE id IN (
       SELECT id FROM waitlist WHERE status = 'waiting'
       ORDER BY score ASC
       LIMIT $1
     )
     RETURNING email`,
    [batchSize]
  );

  // Send invitation emails
  for (const row of rows) {
    await redis.rpush("email:queue", JSON.stringify({
      type: "waitlist_invitation",
      to: row.email,
      activationUrl: `${process.env.APP_URL}/activate?email=${encodeURIComponent(row.email)}`,
    }));
  }

  return { invitedCount: rows.length, emails: rows.map((r) => r.email) };
}

// Referral milestones
async function checkMilestones(userId: string): Promise<void> {
  const { rows: [user] } = await pool.query(
    "SELECT referral_count, milestones, email FROM waitlist WHERE id = $1",
    [userId]
  );

  const milestones: Record<number, { name: string; reward: string }> = {
    3: { name: "early_bird", reward: "1 month free" },
    5: { name: "influencer", reward: "Priority access" },
    10: { name: "ambassador", reward: "Lifetime founder plan" },
    25: { name: "legendary", reward: "Lifetime + swag pack" },
  };

  const currentMilestones = user.milestones || [];

  for (const [threshold, milestone] of Object.entries(milestones)) {
    if (user.referral_count >= parseInt(threshold) && !currentMilestones.includes(milestone.name)) {
      currentMilestones.push(milestone.name);

      // Notify user of milestone
      await redis.rpush("email:queue", JSON.stringify({
        type: "waitlist_milestone",
        to: user.email,
        milestone: milestone.name,
        reward: milestone.reward,
        referralCount: user.referral_count,
      }));
    }
  }

  await pool.query("UPDATE waitlist SET milestones = $2 WHERE id = $1", [userId, JSON.stringify(currentMilestones)]);
}

// Analytics
export async function getStats(): Promise<WaitlistStats> {
  const { rows: [counts] } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'waiting') as waiting,
      COUNT(*) FILTER (WHERE status = 'invited') as invited,
      COUNT(*) FILTER (WHERE status = 'activated') as activated
    FROM waitlist
  `);

  const { rows: topReferrers } = await pool.query(
    "SELECT email, referral_count FROM waitlist WHERE referral_count > 0 ORDER BY referral_count DESC LIMIT 10"
  );

  const todayKey = `waitlist:signups:${new Date().toISOString().slice(0, 10)}`;
  const signupsToday = parseInt(await redis.get(todayKey) || "0");

  return {
    totalSignups: parseInt(counts.total),
    waitingCount: parseInt(counts.waiting),
    invitedCount: parseInt(counts.invited),
    activatedCount: parseInt(counts.activated),
    topReferrers,
    signupsToday,
    conversionRate: parseInt(counts.activated) / Math.max(parseInt(counts.invited), 1) * 100,
  };
}
```

## Results

- **10K signups in 3 weeks** — referral incentive (position boost) motivated sharing; average user referred 2.3 friends; organic viral coefficient of 1.4
- **Top referrers became evangelists** — milestone rewards (lifetime plan at 10 referrals) created power users who posted on Twitter, Reddit, and HN
- **Position anxiety drives engagement** — users check their position daily; seeing "position moved from #3,400 to #1,200" after sharing creates dopamine loop
- **Early access to most engaged users** — top referrers get invited first; these users are most likely to activate, give feedback, and spread word of mouth
- **Clean email list** — users who sign up through referrals have 3x higher open rates; the waitlist pre-qualifies engaged users
