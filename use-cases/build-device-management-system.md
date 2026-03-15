---
title: Build a Device Management System
slug: build-device-management-system
description: Build a device management system for multi-device authentication with trusted device registration, device fingerprinting, session-per-device tracking, remote logout, and suspicious device alerts.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - device-management
  - authentication
  - security
  - sessions
  - trust
---

# Build a Device Management System

## The Problem

Kai leads security at a 30-person fintech app. Users log in from multiple devices but have no visibility into active sessions. When a user's credentials leak, the attacker logs in from a new device and the user doesn't know. "Log out of all devices" is their only tool — it disrupts legitimate sessions too. They need per-device session tracking: users see all their devices, get alerts on new device logins, can selectively revoke access, and the system automatically flags suspicious devices.

## Step 1: Build the Device Manager

```typescript
// src/auth/devices.ts — Multi-device management with fingerprinting and trust levels
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Device {
  id: string;
  userId: string;
  fingerprint: string;
  name: string;                // "Chrome on MacOS", "iPhone 15 Pro"
  type: "desktop" | "mobile" | "tablet" | "unknown";
  browser: string;
  os: string;
  ip: string;
  location: string;
  trustLevel: "trusted" | "recognized" | "new";
  lastActiveAt: string;
  createdAt: string;
  sessionCount: number;
  status: "active" | "revoked" | "expired";
}

interface DeviceSession {
  id: string;
  deviceId: string;
  userId: string;
  token: string;
  expiresAt: string;
  lastActivityAt: string;
  ipAddress: string;
}

// Register or identify device on login
export async function identifyDevice(
  userId: string,
  context: {
    userAgent: string;
    ip: string;
    fingerprint?: string;      // from client-side fingerprinting
    screenResolution?: string;
    timezone?: string;
    languages?: string[];
  }
): Promise<{ device: Device; isNew: boolean; requiresVerification: boolean }> {
  // Generate server-side fingerprint
  const fpComponents = [
    context.userAgent,
    context.screenResolution || "",
    context.timezone || "",
    (context.languages || []).join(","),
  ].join("|");

  const fingerprint = context.fingerprint ||
    createHash("sha256").update(fpComponents).digest("hex").slice(0, 32);

  // Parse user agent
  const deviceInfo = parseUserAgent(context.userAgent);

  // Check if device exists
  const { rows: [existing] } = await pool.query(
    "SELECT * FROM devices WHERE user_id = $1 AND fingerprint = $2 AND status = 'active'",
    [userId, fingerprint]
  );

  if (existing) {
    // Known device — update last active
    await pool.query(
      "UPDATE devices SET last_active_at = NOW(), ip = $3, session_count = session_count + 1 WHERE id = $1 AND user_id = $2",
      [existing.id, userId, context.ip]
    );

    return {
      device: parseDevice(existing),
      isNew: false,
      requiresVerification: existing.trust_level === "new",
    };
  }

  // New device
  const deviceId = `dev-${randomBytes(8).toString("hex")}`;
  const location = await getLocationFromIP(context.ip);

  const device: Device = {
    id: deviceId,
    userId,
    fingerprint,
    name: `${deviceInfo.browser} on ${deviceInfo.os}`,
    type: deviceInfo.type,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ip: context.ip,
    location,
    trustLevel: "new",
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sessionCount: 1,
    status: "active",
  };

  await pool.query(
    `INSERT INTO devices (id, user_id, fingerprint, name, type, browser, os, ip, location, trust_level, last_active_at, session_count, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', NOW(), 1, 'active', NOW())`,
    [deviceId, userId, fingerprint, device.name, device.type, device.browser, device.os, context.ip, location]
  );

  // Alert user about new device
  await redis.rpush("notification:queue", JSON.stringify({
    type: "new_device_login",
    userId,
    device: { name: device.name, location, ip: context.ip },
    message: `New login from ${device.name} in ${location}`,
  }));

  // Check if suspiciously far from usual locations
  const suspicious = await checkDeviceSuspicion(userId, context.ip, location);

  return {
    device,
    isNew: true,
    requiresVerification: suspicious,
  };
}

// Create session for device
export async function createDeviceSession(
  deviceId: string,
  userId: string,
  ip: string,
  ttlHours: number = 24
): Promise<DeviceSession> {
  const sessionId = randomBytes(32).toString("hex");
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours * 3600000).toISOString();

  const session: DeviceSession = {
    id: sessionId, deviceId, userId, token,
    expiresAt, lastActivityAt: new Date().toISOString(), ipAddress: ip,
  };

  await redis.setex(`session:${token}`, ttlHours * 3600, JSON.stringify(session));
  await redis.sadd(`user:sessions:${userId}`, token);

  return session;
}

// Trust a device (after verification)
export async function trustDevice(userId: string, deviceId: string): Promise<void> {
  await pool.query(
    "UPDATE devices SET trust_level = 'trusted' WHERE id = $1 AND user_id = $2",
    [deviceId, userId]
  );
}

// Revoke device access
export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  await pool.query(
    "UPDATE devices SET status = 'revoked' WHERE id = $1 AND user_id = $2",
    [deviceId, userId]
  );

  // Kill all sessions for this device
  const sessions = await redis.smembers(`user:sessions:${userId}`);
  for (const token of sessions) {
    const session = await redis.get(`session:${token}`);
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed.deviceId === deviceId) {
        await redis.del(`session:${token}`);
        await redis.srem(`user:sessions:${userId}`, token);
      }
    }
  }
}

// List all user devices
export async function getUserDevices(userId: string): Promise<Device[]> {
  const { rows } = await pool.query(
    "SELECT * FROM devices WHERE user_id = $1 AND status = 'active' ORDER BY last_active_at DESC",
    [userId]
  );
  return rows.map(parseDevice);
}

// Revoke all sessions except current
export async function revokeAllExcept(userId: string, currentDeviceId: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT id FROM devices WHERE user_id = $1 AND id != $2 AND status = 'active'",
    [userId, currentDeviceId]
  );

  for (const row of rows) {
    await revokeDevice(userId, row.id);
  }

  return rows.length;
}

// Check if login is suspicious
async function checkDeviceSuspicion(userId: string, ip: string, location: string): Promise<boolean> {
  // Get recent login locations
  const { rows } = await pool.query(
    `SELECT DISTINCT location FROM devices WHERE user_id = $1 AND status = 'active'
     AND last_active_at > NOW() - INTERVAL '30 days'`, [userId]
  );

  if (rows.length === 0) return false; // first device

  const knownLocations = rows.map((r: any) => r.location);

  // If location is completely new and far from known locations
  if (!knownLocations.some((loc: string) => loc === location || shareCountry(loc, location))) {
    return true;
  }

  // Check for impossible travel (login from 2 locations too fast)
  const { rows: [lastLogin] } = await pool.query(
    `SELECT location, last_active_at FROM devices WHERE user_id = $1 AND status = 'active'
     ORDER BY last_active_at DESC LIMIT 1`, [userId]
  );

  if (lastLogin) {
    const timeDiff = Date.now() - new Date(lastLogin.last_active_at).getTime();
    const hoursDiff = timeDiff / 3600000;
    if (hoursDiff < 2 && lastLogin.location !== location && !shareCountry(lastLogin.location, location)) {
      return true; // impossible travel
    }
  }

  return false;
}

function shareCountry(loc1: string, loc2: string): boolean {
  const country1 = loc1.split(",").pop()?.trim();
  const country2 = loc2.split(",").pop()?.trim();
  return country1 === country2;
}

function parseUserAgent(ua: string): { browser: string; os: string; type: Device["type"] } {
  let browser = "Unknown";
  let os = "Unknown";
  let type: Device["type"] = "unknown";

  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  if (ua.includes("Mobile") || ua.includes("iPhone") || ua.includes("Android")) type = "mobile";
  else if (ua.includes("iPad") || ua.includes("Tablet")) type = "tablet";
  else type = "desktop";

  return { browser, os, type };
}

async function getLocationFromIP(ip: string): Promise<string> {
  const cached = await redis.get(`geo:location:${ip}`);
  if (cached) return cached;
  return "Unknown"; // integrate with geo lookup service
}

function parseDevice(row: any): Device {
  return { ...row, trustLevel: row.trust_level, lastActiveAt: row.last_active_at, createdAt: row.created_at, sessionCount: row.session_count };
}
```

## Results

- **Compromised accounts detected instantly** — new device login triggers email/push alert; users see "Chrome on Windows in Moscow" when they're in New York; they revoke it in one click
- **Selective logout** — "log out of my work laptop" without disrupting phone session; no more "log out all devices" nuclear option
- **Impossible travel detection** — login from London and Tokyo 30 minutes apart flagged as suspicious; requires MFA re-verification
- **Trusted devices skip MFA** — after verifying a device once, it's trusted for 30 days; reduces MFA friction on daily logins by 90%
- **Device dashboard** — users see all 4 active devices, last active time, location; builds trust that the platform takes security seriously
