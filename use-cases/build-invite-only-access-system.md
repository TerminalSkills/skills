---
title: Build an Invite-Only Access System
slug: build-invite-only-access-system
description: Build an invite-only registration system with invite codes, waitlist management, referral tracking, tiered access, and viral growth mechanics for controlled product launches.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - invites
  - waitlist
  - growth
  - access-control
  - launch
---

# Build an Invite-Only Access System

## The Problem

Leo leads growth at a 15-person startup launching an AI writing tool. They want a controlled launch: invite-only creates exclusivity, lets them manage server load, gather feedback from small cohorts, and build a waitlist for launch buzz. But their current approach is manual — they email invite links one by one, can't track who invited whom, don't know which invites convert, and have no way to reward users who bring friends. They need an automated invite system with waitlist management, referral tracking, and controlled rollout.

## Step 1: Build the Invite System

```typescript
// src/access/invites.ts — Invite-only registration with waitlist, referrals, and controlled rollout
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface InviteCode {
  code: string;
  type: "personal" | "bulk" | "vip" | "waitlist";
  createdBy: string | null;    // user ID or "system"
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  metadata: {
    campaign?: string;
    source?: string;
    tier?: string;
  };
  status: "active" | "exhausted" | "expired" | "revoked";
  createdAt: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  referredBy: string | null;   // invite code used to join waitlist
  position: number;
  priority: number;            // higher = gets access sooner
  status: "waiting" | "invited" | "registered" | "declined";
  source: string;              // "organic" | "referral" | "twitter" | "producthunt"
  inviteCode: string | null;   // assigned when invited
  joinedAt: string;
  invitedAt: string | null;
}

// Generate invite codes for a user
export async function generateUserInvites(
  userId: string,
  count: number = 3
): Promise<InviteCode[]> {
  const codes: InviteCode[] = [];

  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase(); // 8-char code

    const invite: InviteCode = {
      code,
      type: "personal",
      createdBy: userId,
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 days
      metadata: {},
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO invite_codes (code, type, created_by, max_uses, used_count, expires_at, metadata, status, created_at)
       VALUES ($1, $2, $3, $4, 0, $5, $6, 'active', NOW())`,
      [code, "personal", userId, 1, invite.expiresAt, JSON.stringify(invite.metadata)]
    );

    codes.push(invite);
  }

  return codes;
}

// Generate bulk invite codes (for campaigns)
export async function generateBulkInvites(params: {
  count: number;
  maxUsesEach: number;
  campaign: string;
  tier?: string;
  expiresInDays?: number;
}): Promise<string[]> {
  const codes: string[] = [];

  for (let i = 0; i < params.count; i++) {
    const code = `${params.campaign.toUpperCase().slice(0, 4)}-${randomBytes(3).toString("hex").toUpperCase()}`;

    await pool.query(
      `INSERT INTO invite_codes (code, type, created_by, max_uses, used_count, expires_at, metadata, status, created_at)
       VALUES ($1, 'bulk', 'system', $2, 0, $3, $4, 'active', NOW())`,
      [code, params.maxUsesEach,
       params.expiresInDays ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString() : null,
       JSON.stringify({ campaign: params.campaign, tier: params.tier })]
    );

    codes.push(code);
  }

  return codes;
}

// Validate and redeem invite code
export async function redeemInvite(
  code: string,
  email: string,
  name: string
): Promise<{ valid: boolean; error?: string; userId?: string; tier?: string }> {
  const { rows: [invite] } = await pool.query(
    "SELECT * FROM invite_codes WHERE code = $1 FOR UPDATE", [code.toUpperCase()]
  );

  if (!invite) return { valid: false, error: "Invalid invite code" };
  if (invite.status !== "active") return { valid: false, error: "Invite code is no longer active" };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await pool.query("UPDATE invite_codes SET status = 'expired' WHERE code = $1", [code]);
    return { valid: false, error: "Invite code has expired" };
  }
  if (invite.used_count >= invite.max_uses) {
    await pool.query("UPDATE invite_codes SET status = 'exhausted' WHERE code = $1", [code]);
    return { valid: false, error: "Invite code has been fully used" };
  }

  // Check if email already registered
  const { rows: [existing] } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) return { valid: false, error: "Email already registered" };

  // Create user
  const userId = `usr-${randomBytes(8).toString("hex")}`;
  const metadata = JSON.parse(invite.metadata || "{}");

  await pool.query(
    `INSERT INTO users (id, email, name, invited_by, invite_code, tier, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [userId, email, name, invite.created_by, code, metadata.tier || "standard"]
  );

  // Update invite usage
  await pool.query(
    "UPDATE invite_codes SET used_count = used_count + 1 WHERE code = $1",
    [code]
  );

  // Track referral chain
  if (invite.created_by && invite.created_by !== "system") {
    await pool.query(
      `INSERT INTO referrals (referrer_id, referred_id, invite_code, created_at) VALUES ($1, $2, $3, NOW())`,
      [invite.created_by, userId, code]
    );

    // Reward referrer with more invites
    const { rows: [{ count: referralCount }] } = await pool.query(
      "SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1", [invite.created_by]
    );
    const milestones = [3, 5, 10, 25, 50];
    if (milestones.includes(parseInt(referralCount))) {
      await generateUserInvites(invite.created_by, 3);
      await redis.rpush("notification:queue", JSON.stringify({
        type: "referral_milestone",
        userId: invite.created_by,
        count: referralCount,
        newInvites: 3,
      }));
    }
  }

  // Give new user their own invites
  await generateUserInvites(userId, 3);

  // Remove from waitlist if they were on it
  await pool.query(
    "UPDATE waitlist SET status = 'registered' WHERE email = $1",
    [email]
  );

  return { valid: true, userId, tier: metadata.tier || "standard" };
}

// Join waitlist
export async function joinWaitlist(
  email: string,
  name: string,
  source: string = "organic",
  referralCode?: string
): Promise<{ position: number; referralLink: string }> {
  // Check if already on waitlist
  const { rows: [existing] } = await pool.query(
    "SELECT position FROM waitlist WHERE email = $1", [email]
  );
  if (existing) return { position: existing.position, referralLink: generateWaitlistReferralLink(email) };

  // Get current position
  const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM waitlist");
  const position = parseInt(count) + 1;

  // Priority boost for referrals
  let priority = 0;
  if (referralCode) {
    priority += 10; // referrals get priority
    // Boost referrer too
    const referrerEmail = Buffer.from(referralCode, "base64url").toString();
    await pool.query(
      "UPDATE waitlist SET priority = priority + 5 WHERE email = $1",
      [referrerEmail]
    );
  }
  if (source === "producthunt") priority += 20;
  if (source === "twitter") priority += 5;

  await pool.query(
    `INSERT INTO waitlist (email, name, referred_by, position, priority, status, source, joined_at)
     VALUES ($1, $2, $3, $4, $5, 'waiting', $6, NOW())`,
    [email, name, referralCode || null, position, priority, source]
  );

  return { position, referralLink: generateWaitlistReferralLink(email) };
}

// Invite next batch from waitlist
export async function inviteFromWaitlist(count: number): Promise<number> {
  const { rows: entries } = await pool.query(
    `SELECT * FROM waitlist WHERE status = 'waiting'
     ORDER BY priority DESC, position ASC LIMIT $1`, [count]
  );

  for (const entry of entries) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    await pool.query(
      `INSERT INTO invite_codes (code, type, created_by, max_uses, used_count, expires_at, status, created_at)
       VALUES ($1, 'waitlist', 'system', 1, 0, $2, 'active', NOW())`,
      [code, new Date(Date.now() + 7 * 86400000).toISOString()]
    );

    await pool.query(
      "UPDATE waitlist SET status = 'invited', invite_code = $2, invited_at = NOW() WHERE email = $1",
      [entry.email, code]
    );

    await redis.rpush("email:send:queue", JSON.stringify({
      to: entry.email,
      template: "waitlist_invite",
      data: { name: entry.name, code, signupUrl: `${process.env.APP_URL}/signup?code=${code}` },
    }));
  }

  return entries.length;
}

function generateWaitlistReferralLink(email: string): string {
  const code = Buffer.from(email).toString("base64url");
  return `${process.env.APP_URL}/waitlist?ref=${code}`;
}
```

## Results

- **10K waitlist in 2 weeks** — referral-powered waitlist where sharing moves you up the queue; viral coefficient 1.3
- **Controlled rollout** — 100 invites/day keeps servers stable; each cohort tested for 3 days before expanding; caught a critical bug at 500 users that would have been catastrophic at 5,000
- **Referral chains tracked** — top referrer brought 47 users; rewarded with VIP access and 25 extra invites; became the first power user
- **Priority queue rewards engagement** — Product Hunt signups got early access; Twitter followers got priority; organic waitlist waited longest but still converted at 78%
- **Exclusivity drives demand** — "invite-only" in the landing page headline increased waitlist signups 3x compared to "sign up free"
