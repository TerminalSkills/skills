---
title: Build a User Session Manager
slug: build-user-session-manager
description: Build a user session manager with multi-device tracking, session invalidation, concurrent session limits, activity-based expiry, and security alerts for authentication infrastructure.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - sessions
  - authentication
  - security
  - multi-device
  - management
---

# Build a User Session Manager

## The Problem

Sam leads security at a 20-person SaaS. Users stay logged in forever — sessions never expire. A user's account was compromised; they changed their password but the attacker's session remained active. There's no way to see active sessions or revoke specific ones. Users log in from 5 devices but can't see which are active. Shared accounts (a team using one login) can't be detected. They need session management: track all active sessions per user, device fingerprinting, revoke individual sessions, auto-expire inactive sessions, concurrent session limits, and security alerts on suspicious logins.

## Step 1: Build the Session Manager

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Session { id: string; userId: string; token: string; deviceFingerprint: string; userAgent: string; ip: string; country: string; lastActiveAt: number; createdAt: number; expiresAt: number; }

const MAX_SESSIONS_PER_USER = 5;
const SESSION_TTL = 86400 * 30; // 30 days
const INACTIVE_TTL = 86400 * 7; // 7 days inactive

export async function createSession(params: { userId: string; userAgent: string; ip: string; country?: string }): Promise<{ sessionId: string; token: string }> {
  const sessionId = `sess-${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const fingerprint = createHash("md5").update(params.userAgent + params.ip).digest("hex").slice(0, 12);
  const now = Date.now();

  const session: Session = { id: sessionId, userId: params.userId, token: tokenHash, deviceFingerprint: fingerprint, userAgent: params.userAgent, ip: params.ip, country: params.country || "unknown", lastActiveAt: now, createdAt: now, expiresAt: now + SESSION_TTL * 1000 };

  await redis.setex(`session:${tokenHash}`, SESSION_TTL, JSON.stringify(session));
  await redis.sadd(`user:sessions:${params.userId}`, tokenHash);

  // Enforce max sessions
  const sessions = await redis.smembers(`user:sessions:${params.userId}`);
  if (sessions.length > MAX_SESSIONS_PER_USER) {
    const allSessions = await Promise.all(sessions.map(async (t) => { const d = await redis.get(`session:${t}`); return d ? JSON.parse(d) : null; }));
    const sorted = allSessions.filter(Boolean).sort((a, b) => a.lastActiveAt - b.lastActiveAt);
    const toRevoke = sorted.slice(0, sessions.length - MAX_SESSIONS_PER_USER);
    for (const s of toRevoke) await revokeSession(params.userId, s.token);
  }

  // Security alert: new device/country
  const knownFingerprints = await redis.smembers(`user:devices:${params.userId}`);
  if (!knownFingerprints.includes(fingerprint)) {
    await redis.sadd(`user:devices:${params.userId}`, fingerprint);
    if (knownFingerprints.length > 0) {
      await redis.rpush("notification:queue", JSON.stringify({ type: "new_device_login", userId: params.userId, ip: params.ip, userAgent: params.userAgent, country: params.country }));
    }
  }

  return { sessionId, token };
}

export async function validateSession(token: string): Promise<Session | null> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const data = await redis.get(`session:${tokenHash}`);
  if (!data) return null;
  const session: Session = JSON.parse(data);
  if (Date.now() - session.lastActiveAt > INACTIVE_TTL * 1000) { await revokeSession(session.userId, tokenHash); return null; }
  session.lastActiveAt = Date.now();
  await redis.setex(`session:${tokenHash}`, SESSION_TTL, JSON.stringify(session));
  return session;
}

export async function revokeSession(userId: string, tokenHash: string): Promise<void> {
  await redis.del(`session:${tokenHash}`);
  await redis.srem(`user:sessions:${userId}`, tokenHash);
}

export async function revokeAllSessions(userId: string, exceptToken?: string): Promise<number> {
  const sessions = await redis.smembers(`user:sessions:${userId}`);
  let revoked = 0;
  for (const tokenHash of sessions) {
    if (exceptToken && tokenHash === createHash("sha256").update(exceptToken).digest("hex")) continue;
    await revokeSession(userId, tokenHash);
    revoked++;
  }
  return revoked;
}

export async function getActiveSessions(userId: string): Promise<Array<{ id: string; device: string; ip: string; country: string; lastActive: string; current: boolean }>> {
  const sessions = await redis.smembers(`user:sessions:${userId}`);
  const result = [];
  for (const tokenHash of sessions) {
    const data = await redis.get(`session:${tokenHash}`);
    if (!data) continue;
    const s: Session = JSON.parse(data);
    result.push({ id: s.id, device: parseDevice(s.userAgent), ip: s.ip, country: s.country, lastActive: new Date(s.lastActiveAt).toISOString(), current: false });
  }
  return result.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
}

function parseDevice(ua: string): string {
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}
```

## Results

- **Compromised session revoked** — user changes password → `revokeAllSessions` except current; attacker's session dead immediately; no lingering access
- **5-device limit** — 6th login revokes oldest session; shared account abuse detectable; compliance satisfied
- **New device alert** — first login from Android when user always uses Mac → security email; user confirms or revokes; account takeover caught early
- **Inactive expiry** — 7 days no activity → session auto-expires; forgotten sessions on public computers cleaned up; attack surface reduced
- **Session dashboard** — user sees "Mac/Chrome — San Francisco — Active 2 min ago" + "iPhone/Safari — New York — Active 3 days ago"; revoke any session in one click
