---
title: Build an Email Verification Flow
slug: build-email-verification-flow
description: Build a secure email verification system with token generation, rate limiting, expiration, re-send logic, and email change verification — preventing fake signups and ensuring deliverability.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - email
  - verification
  - security
  - authentication
  - onboarding
---

# Build an Email Verification Flow

## The Problem

Tomas leads growth at a 20-person SaaS. 30% of signups use fake or disposable emails. Marketing sends to these addresses, tanking their domain reputation — SendGrid flagged them with a 12% bounce rate (healthy is under 2%). Real users' emails land in spam because the domain is damaged. They also have no way to verify email changes, so support tickets from "I changed my email but can't log in" pile up weekly. They need a verification flow that validates email ownership at signup and on change.

## Step 1: Build the Verification System

```typescript
// src/auth/email-verification.ts — Secure email verification with rate limiting
import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const TOKEN_EXPIRY_HOURS = 24;
const MAX_SENDS_PER_HOUR = 3;
const MAX_SENDS_PER_DAY = 10;

interface VerificationToken {
  token: string;
  userId: string;
  email: string;
  type: "signup" | "email_change";
  newEmail?: string;         // for email change flow
  expiresAt: number;
  createdAt: number;
}

// Send verification email on signup
export async function sendSignupVerification(userId: string, email: string): Promise<{
  sent: boolean;
  retryAfterSeconds?: number;
}> {
  // Check disposable email domains
  if (await isDisposableEmail(email)) {
    throw new Error("Disposable email addresses are not allowed");
  }

  // Rate limit
  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return { sent: false, retryAfterSeconds: rateCheck.retryAfter };
  }

  // Generate secure token
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString("urlsafe-base64");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Store hashed token (never store raw token in DB)
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 3600000;
  await pool.query(
    `INSERT INTO email_verifications (token_hash, user_id, email, type, expires_at, created_at)
     VALUES ($1, $2, $3, 'signup', to_timestamp($4), NOW())`,
    [tokenHash, userId, email, expiresAt / 1000]
  );

  // Invalidate any previous tokens for this user
  await pool.query(
    `UPDATE email_verifications SET used = true
     WHERE user_id = $1 AND type = 'signup' AND token_hash != $2`,
    [userId, tokenHash]
  );

  // Build verification URL
  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

  // Queue email
  await redis.rpush("email:queue", JSON.stringify({
    type: "email_verification",
    to: email,
    subject: "Verify your email address",
    verifyUrl,
    expiresIn: `${TOKEN_EXPIRY_HOURS} hours`,
  }));

  // Track rate limit
  await incrementRateLimit(userId);

  return { sent: true };
}

// Verify token
export async function verifyEmail(token: string): Promise<{
  verified: boolean;
  userId?: string;
  error?: string;
}> {
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { rows: [verification] } = await pool.query(
    `SELECT user_id, email, type, new_email, expires_at, used
     FROM email_verifications
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!verification) {
    return { verified: false, error: "Invalid verification link" };
  }

  if (verification.used) {
    return { verified: false, error: "This link has already been used" };
  }

  if (new Date(verification.expires_at) < new Date()) {
    return { verified: false, error: "This link has expired. Please request a new one." };
  }

  // Mark token as used
  await pool.query("UPDATE email_verifications SET used = true, verified_at = NOW() WHERE token_hash = $1", [tokenHash]);

  if (verification.type === "signup") {
    await pool.query(
      "UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1",
      [verification.user_id]
    );
  } else if (verification.type === "email_change") {
    // Update to new email
    await pool.query(
      "UPDATE users SET email = $2, email_verified = true, email_verified_at = NOW() WHERE id = $1",
      [verification.user_id, verification.new_email]
    );
  }

  return { verified: true, userId: verification.user_id };
}

// Email change flow — requires verifying new email before switching
export async function initiateEmailChange(userId: string, newEmail: string): Promise<{
  sent: boolean;
  retryAfterSeconds?: number;
}> {
  // Check if new email is already taken
  const { rows: existing } = await pool.query(
    "SELECT 1 FROM users WHERE email = $1 AND id != $2",
    [newEmail, userId]
  );
  if (existing.length > 0) throw new Error("Email already in use");

  if (await isDisposableEmail(newEmail)) {
    throw new Error("Disposable email addresses are not allowed");
  }

  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return { sent: false, retryAfterSeconds: rateCheck.retryAfter };
  }

  const token = randomBytes(32).toString("urlsafe-base64");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY_HOURS * 3600000;

  await pool.query(
    `INSERT INTO email_verifications (token_hash, user_id, email, new_email, type, expires_at, created_at)
     VALUES ($1, $2, (SELECT email FROM users WHERE id = $2), $3, 'email_change', to_timestamp($4), NOW())`,
    [tokenHash, userId, newEmail, expiresAt / 1000]
  );

  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

  // Send to NEW email address
  await redis.rpush("email:queue", JSON.stringify({
    type: "email_change_verification",
    to: newEmail,
    subject: "Confirm your new email address",
    verifyUrl,
    expiresIn: `${TOKEN_EXPIRY_HOURS} hours`,
  }));

  // Notify OLD email that a change was requested
  const { rows: [user] } = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  await redis.rpush("email:queue", JSON.stringify({
    type: "email_change_notice",
    to: user.email,
    subject: "Email change requested",
    newEmail,
  }));

  await incrementRateLimit(userId);
  return { sent: true };
}

// Rate limiting
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const hourKey = `verify:rate:hour:${userId}`;
  const dayKey = `verify:rate:day:${userId}`;

  const [hourCount, dayCount] = await Promise.all([
    redis.get(hourKey).then((v) => parseInt(v || "0")),
    redis.get(dayKey).then((v) => parseInt(v || "0")),
  ]);

  if (hourCount >= MAX_SENDS_PER_HOUR) {
    const ttl = await redis.ttl(hourKey);
    return { allowed: false, retryAfter: Math.max(ttl, 60) };
  }
  if (dayCount >= MAX_SENDS_PER_DAY) {
    const ttl = await redis.ttl(dayKey);
    return { allowed: false, retryAfter: Math.max(ttl, 60) };
  }

  return { allowed: true, retryAfter: 0 };
}

async function incrementRateLimit(userId: string): Promise<void> {
  const hourKey = `verify:rate:hour:${userId}`;
  const dayKey = `verify:rate:day:${userId}`;

  await redis.multi()
    .incr(hourKey).expire(hourKey, 3600)
    .incr(dayKey).expire(dayKey, 86400)
    .exec();
}

// Disposable email check
async function isDisposableEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;

  const disposable = await redis.sismember("disposable:domains", domain);
  if (disposable) return true;

  return false;
}
```

## Results

- **Bounce rate: 12% → 0.8%** — only verified emails receive marketing; SendGrid reputation restored within 2 weeks; emails land in inbox again
- **Fake signups dropped 85%** — disposable email blocking + verification requirement filters out bots and throwaway accounts
- **Email change support tickets: 8/week → 0** — self-service email change with verification of new address; old address gets a security notification
- **Rate limiting prevents abuse** — 3 sends/hour, 10/day per user; attackers can't use the verification endpoint as an email spam relay
- **Token security** — tokens are hashed in the database (SHA-256); even a DB breach doesn't expose valid verification links
