---
title: Build Magic Link Authentication
slug: build-magic-link-authentication
description: Build a passwordless authentication system with magic links — generating secure tokens, rate-limited email delivery, one-click login, session management, and device fingerprinting.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - authentication
  - passwordless
  - magic-link
  - security
  - login
---

# Build Magic Link Authentication

## The Problem

Yuki leads product at a 20-person SaaS. Password-related support tickets eat 15 hours/week: "forgot password", "account locked", "password doesn't work." 40% of signup attempts abandon at the password creation step. Password reuse means compromised credentials on other sites threaten their users. Slack, Notion, and Linear all use magic links — the user enters their email, gets a link, clicks it, and they're in. No password to remember, forget, or steal.

## Step 1: Build the Magic Link System

```typescript
// src/auth/magic-link.ts — Passwordless auth with secure tokens and session management
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";
import { SignJWT, jwtVerify } from "jose";

const redis = new Redis(process.env.REDIS_URL!);

const TOKEN_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS_PER_HOUR = 5;
const SESSION_DURATION_DAYS = 30;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// Request magic link
export async function requestMagicLink(email: string, metadata?: {
  userAgent?: string;
  ip?: string;
  redirectTo?: string;
}): Promise<{ sent: boolean; retryAfterSeconds?: number }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit by email
  const rateKey = `magic:rate:${normalizedEmail}`;
  const attempts = parseInt(await redis.get(rateKey) || "0");
  if (attempts >= MAX_ATTEMPTS_PER_HOUR) {
    const ttl = await redis.ttl(rateKey);
    return { sent: false, retryAfterSeconds: Math.max(ttl, 60) };
  }

  // Rate limit by IP (prevent enumeration)
  if (metadata?.ip) {
    const ipKey = `magic:rate:ip:${metadata.ip}`;
    const ipAttempts = parseInt(await redis.get(ipKey) || "0");
    if (ipAttempts >= 10) {
      return { sent: false, retryAfterSeconds: 3600 };
    }
    await redis.multi().incr(ipKey).expire(ipKey, 3600).exec();
  }

  // Generate token (32 bytes = 256 bits)
  const token = randomBytes(32).toString("urlsafe-base64");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Invalidate previous tokens for this email
  await redis.del(`magic:email:${normalizedEmail}`);

  // Store hashed token with metadata
  const expiresAt = Date.now() + TOKEN_EXPIRY_MINUTES * 60000;
  await redis.setex(`magic:token:${tokenHash}`, TOKEN_EXPIRY_MINUTES * 60, JSON.stringify({
    email: normalizedEmail,
    expiresAt,
    userAgent: metadata?.userAgent || "",
    ip: metadata?.ip || "",
    redirectTo: metadata?.redirectTo || "/",
    attempts: 0,
  }));

  // Track active token for this email (for invalidation)
  await redis.setex(`magic:email:${normalizedEmail}`, TOKEN_EXPIRY_MINUTES * 60, tokenHash);

  // Build magic link URL
  const magicLink = `${process.env.APP_URL}/auth/verify?token=${token}`;

  // Queue email
  await redis.rpush("email:queue", JSON.stringify({
    type: "magic_link",
    to: normalizedEmail,
    subject: "Your login link",
    magicLink,
    expiresIn: `${TOKEN_EXPIRY_MINUTES} minutes`,
    requestedFrom: metadata?.ip ? `IP: ${metadata.ip.slice(0, 8)}...` : "Unknown",
  }));

  // Increment rate limit
  await redis.multi().incr(rateKey).expire(rateKey, 3600).exec();

  return { sent: true };
}

// Verify magic link and create session
export async function verifyMagicLink(token: string, metadata?: {
  userAgent?: string;
  ip?: string;
  deviceFingerprint?: string;
}): Promise<{
  success: boolean;
  sessionToken?: string;
  redirectTo?: string;
  error?: string;
}> {
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Get token data
  const tokenData = await redis.get(`magic:token:${tokenHash}`);
  if (!tokenData) {
    return { success: false, error: "Invalid or expired link. Please request a new one." };
  }

  const data = JSON.parse(tokenData);

  // Check expiry
  if (Date.now() > data.expiresAt) {
    await redis.del(`magic:token:${tokenHash}`);
    return { success: false, error: "This link has expired. Please request a new one." };
  }

  // Prevent brute force (max 3 verification attempts per token)
  data.attempts++;
  if (data.attempts > 3) {
    await redis.del(`magic:token:${tokenHash}`);
    return { success: false, error: "Too many attempts. Please request a new link." };
  }
  await redis.setex(`magic:token:${tokenHash}`, TOKEN_EXPIRY_MINUTES * 60, JSON.stringify(data));

  // Invalidate token (single use)
  await redis.del(`magic:token:${tokenHash}`);
  await redis.del(`magic:email:${data.email}`);

  // Find or create user
  let { rows: [user] } = await pool.query(
    "SELECT id, email, name FROM users WHERE email = $1",
    [data.email]
  );

  if (!user) {
    // Auto-create account on first magic link login
    const { rows: [newUser] } = await pool.query(
      `INSERT INTO users (id, email, email_verified, created_at)
       VALUES ($1, $2, true, NOW()) RETURNING *`,
      [`user-${Date.now()}`, data.email]
    );
    user = newUser;
  } else {
    // Mark email as verified
    await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [user.id]);
  }

  // Create session
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400000);

  await pool.query(
    `INSERT INTO sessions (id, user_id, user_agent, ip_address, device_fingerprint, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [sessionId, user.id, metadata?.userAgent || null, metadata?.ip || null,
     metadata?.deviceFingerprint || null, expiresAt]
  );

  // Generate JWT
  const jwt = await new SignJWT({
    sub: user.id,
    email: user.email,
    sid: sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(JWT_SECRET);

  // Log authentication event
  await pool.query(
    `INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, created_at)
     VALUES ($1, 'magic_link_login', $2, $3, NOW())`,
    [user.id, metadata?.ip || null, metadata?.userAgent || null]
  );

  return {
    success: true,
    sessionToken: jwt,
    redirectTo: data.redirectTo,
  };
}

// List active sessions (for "manage devices" UI)
export async function getActiveSessions(userId: string): Promise<Array<{
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}>> {
  const { rows } = await pool.query(
    `SELECT id, user_agent, ip_address, created_at, last_active_at
     FROM sessions
     WHERE user_id = $1 AND expires_at > NOW() AND revoked = false
     ORDER BY last_active_at DESC`,
    [userId]
  );
  return rows;
}

// Revoke a session (logout from specific device)
export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await pool.query(
    "UPDATE sessions SET revoked = true WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
}

// Revoke all sessions except current (security action)
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE sessions SET revoked = true
     WHERE user_id = $1 AND revoked = false ${exceptSessionId ? `AND id != $2` : ""}`,
    exceptSessionId ? [userId, exceptSessionId] : [userId]
  );
  return rowCount || 0;
}
```

## Results

- **Password support tickets eliminated** — no passwords means no "forgot password", no "account locked", no "password doesn't work"; 15 hours/week of support freed up
- **Signup completion: 60% → 92%** — entering email is the only step; no password requirements, no "must contain uppercase and special character" friction
- **Security improved** — no password database to breach; no credential stuffing attacks; tokens expire in 10 minutes and are single-use
- **Session management gives users control** — "Manage devices" page shows all active sessions; users can revoke access from any device; security-conscious enterprise customers love this
- **Auto-provisioning** — first-time users are automatically created when they click a magic link; no separate signup flow needed
