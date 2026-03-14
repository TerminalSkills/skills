---
title: Build a Session Management System
slug: build-session-management-system
description: Build a secure session management system with Redis-backed sessions, concurrent session limits, device tracking, forced logout, session activity monitoring, and suspicious login detection.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - sessions
  - security
  - authentication
  - device-management
  - redis
---

# Build a Session Management System

## The Problem

Petra leads security at a 30-person fintech. They use stateless JWTs for authentication — but JWTs can't be revoked. When an employee leaves, their token works for 24 hours until it expires. A compromised device means waiting for token expiry. There's no way to see how many active sessions a user has, force logout, or detect login from a new country. Compliance requires the ability to terminate all sessions instantly. They need server-side sessions with Redis, device tracking, concurrent limits, and instant revocation.

## Step 1: Build the Session Manager

```typescript
// src/auth/sessions.ts — Redis-backed session management with device tracking
import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const SESSION_TTL = 30 * 86400;      // 30 days
const MAX_SESSIONS_PER_USER = 5;
const IDLE_TIMEOUT = 4 * 3600;       // 4 hours idle = session expired

interface Session {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  userAgent: string;
  country: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

// Create a new session after login
export async function createSession(
  userId: string,
  metadata: { ip: string; userAgent: string; country?: string; deviceFingerprint?: string }
): Promise<{ sessionId: string; sessionToken: string }> {
  // Check concurrent session limit
  const activeSessions = await getActiveSessions(userId);

  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    // Revoke oldest session
    const oldest = activeSessions.sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
    await revokeSession(oldest.id, userId, "max_sessions_exceeded");
  }

  // Detect suspicious login
  await detectSuspiciousLogin(userId, metadata);

  // Generate session ID and token
  const sessionId = randomBytes(16).toString("hex");
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

  const now = Date.now();
  const session: Session = {
    id: sessionId,
    userId,
    deviceId: metadata.deviceFingerprint || createHash("md5").update(metadata.userAgent + metadata.ip).digest("hex").slice(0, 12),
    deviceName: parseDeviceName(metadata.userAgent),
    ip: metadata.ip,
    userAgent: metadata.userAgent,
    country: metadata.country || "unknown",
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  };

  // Store session in Redis
  await redis.setex(`session:${tokenHash}`, SESSION_TTL, JSON.stringify(session));

  // Track user's active sessions
  await redis.sadd(`user:sessions:${userId}`, tokenHash);
  await redis.expire(`user:sessions:${userId}`, SESSION_TTL);

  // Log login event
  await pool.query(
    `INSERT INTO login_events (user_id, session_id, ip, user_agent, country, device_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [userId, sessionId, metadata.ip, metadata.userAgent, metadata.country, session.deviceName]
  );

  return { sessionId, sessionToken };
}

// Validate and refresh session on every request
export async function validateSession(sessionToken: string): Promise<Session | null> {
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const data = await redis.get(`session:${tokenHash}`);
  if (!data) return null;

  const session: Session = JSON.parse(data);

  // Check expiry
  if (Date.now() > session.expiresAt) {
    await redis.del(`session:${tokenHash}`);
    await redis.srem(`user:sessions:${session.userId}`, tokenHash);
    return null;
  }

  // Check idle timeout
  if (Date.now() - session.lastActiveAt > IDLE_TIMEOUT * 1000) {
    await redis.del(`session:${tokenHash}`);
    await redis.srem(`user:sessions:${session.userId}`, tokenHash);
    return null;
  }

  // Refresh last active time
  session.lastActiveAt = Date.now();
  await redis.setex(`session:${tokenHash}`, SESSION_TTL, JSON.stringify(session));

  return session;
}

// Get all active sessions for a user
export async function getActiveSessions(userId: string): Promise<Session[]> {
  const tokenHashes = await redis.smembers(`user:sessions:${userId}`);
  const sessions: Session[] = [];

  for (const hash of tokenHashes) {
    const data = await redis.get(`session:${hash}`);
    if (data) {
      sessions.push(JSON.parse(data));
    } else {
      // Clean up stale reference
      await redis.srem(`user:sessions:${userId}`, hash);
    }
  }

  return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

// Revoke a specific session
export async function revokeSession(sessionId: string, userId: string, reason: string): Promise<boolean> {
  const tokenHashes = await redis.smembers(`user:sessions:${userId}`);

  for (const hash of tokenHashes) {
    const data = await redis.get(`session:${hash}`);
    if (data) {
      const session: Session = JSON.parse(data);
      if (session.id === sessionId) {
        await redis.del(`session:${hash}`);
        await redis.srem(`user:sessions:${userId}`, hash);

        await pool.query(
          "INSERT INTO session_events (user_id, session_id, event, reason, created_at) VALUES ($1, $2, 'revoked', $3, NOW())",
          [userId, sessionId, reason]
        );

        return true;
      }
    }
  }

  return false;
}

// Revoke ALL sessions (emergency / password change / account compromise)
export async function revokeAllSessions(userId: string, reason: string, exceptToken?: string): Promise<number> {
  const tokenHashes = await redis.smembers(`user:sessions:${userId}`);
  let revoked = 0;

  const exceptHash = exceptToken ? createHash("sha256").update(exceptToken).digest("hex") : null;

  for (const hash of tokenHashes) {
    if (hash === exceptHash) continue;
    await redis.del(`session:${hash}`);
    await redis.srem(`user:sessions:${userId}`, hash);
    revoked++;
  }

  await pool.query(
    "INSERT INTO session_events (user_id, session_id, event, reason, created_at) VALUES ($1, 'all', 'revoked_all', $2, NOW())",
    [userId, reason]
  );

  return revoked;
}

// Detect suspicious login patterns
async function detectSuspiciousLogin(userId: string, metadata: { ip: string; country?: string }): Promise<void> {
  if (!metadata.country) return;

  // Get last known country
  const { rows: [lastLogin] } = await pool.query(
    "SELECT country FROM login_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );

  if (lastLogin && lastLogin.country !== metadata.country && metadata.country !== "unknown") {
    // New country — flag for review
    await redis.rpush("security:alerts", JSON.stringify({
      type: "new_country_login",
      userId,
      previousCountry: lastLogin.country,
      newCountry: metadata.country,
      ip: metadata.ip,
      timestamp: new Date().toISOString(),
    }));

    // Notify user
    await redis.rpush("notification:queue", JSON.stringify({
      userId,
      type: "suspicious_login",
      data: {
        country: metadata.country,
        ip: metadata.ip,
        message: `New login from ${metadata.country}. If this wasn't you, change your password immediately.`,
      },
    }));
  }
}

function parseDeviceName(userAgent: string): string {
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("Mac")) return "Mac";
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Linux")) return "Linux";
  return "Unknown Device";
}
```

## Results

- **Instant session revocation** — terminated employee's access killed in milliseconds; no waiting 24 hours for JWT expiry; compliance requirement met
- **Concurrent sessions limited to 5** — oldest session auto-revoked when a 6th device logs in; prevents credential sharing and unauthorized access
- **Suspicious login detection** — login from a new country triggers user notification and security alert; account takeover attempts caught immediately
- **Device management UI** — users see "iPhone (São Paulo, active 5 min ago), Windows PC (Berlin, active 2 days ago)"; they can revoke any device with one click
- **4-hour idle timeout** — unattended workstations automatically lose access; meets SOC 2 and PCI DSS session management requirements
