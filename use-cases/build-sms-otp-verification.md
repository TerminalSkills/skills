---
title: Build SMS OTP Verification
slug: build-sms-otp-verification
description: Build a secure SMS one-time-code flow with Twilio, Redis and Hono — per-number rate limits, hashed codes, atomic brute-force lockout, and an audit log in PostgreSQL.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - twilio
category: development
tags:
  - sms
  - otp
  - verification
  - authentication
  - security
---

# Build SMS OTP Verification

## The Problem

Marco leads engineering at a 20-person fintech app. They verify users by email, but many users check email later or never, and email is easy to bypass. They want SMS one-time codes for critical actions (login, payment confirmation, account changes). SMS is billed per message, so without rate limiting a single attacker can run up the bill by requesting codes for a few numbers all day, and a 6-digit code is only 1,000,000 guesses, so verification attempts must be capped atomically.

## The Solution

A Hono API validated with zod, codes and counters in Redis, the Twilio Messages API for delivery, and PostgreSQL for an audit trail. Design rules:

- The code is generated with `crypto.randomInt` and stored only as an HMAC keyed with a server secret, never in plaintext.
- Every counter is a Redis `INCR`, so parallel requests cannot slip past a limit.
- A wrong guess is counted before it is compared, so racing many guesses at once does not buy extra attempts.
- Codes are single use, and the code goes only to the phone number. There is no email fallback: a code that can be redirected to a mailbox is no longer proof of owning the phone.

Install `ioredis pg hono @hono/node-server @hono/zod-validator zod`, and `typescript @types/node @types/pg` as dev dependencies. Tested with ioredis 6, hono 4.13, @hono/zod-validator 0.9, zod 4.6 and pg 8.23.

## Step 1: Audit table

```sql
CREATE TABLE otp_events (
  id          bigserial PRIMARY KEY,
  phone_hmac  text        NOT NULL,   -- HMAC of the number, never the number itself
  purpose     text        NOT NULL,
  event       text        NOT NULL,   -- 'sent' | 'verified' | 'failed' | 'locked'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_events_phone_idx ON otp_events (phone_hmac, created_at DESC);
```

## Step 2: The OTP module

```typescript
// src/otp.ts — SMS OTP with rate limiting, single use and atomic attempt counting
import { Redis } from "ioredis";
import { Pool } from "pg";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.OTP_SECRET!; // at least 32 random bytes, kept out of the repo

interface OTPConfig {
  length: number;
  expirySeconds: number;
  maxAttempts: number;      // wrong guesses before lockout
  cooldownSeconds: number;  // minimum time between sends
  maxSendsPerHour: number;
  maxSendsPerDay: number;
}

const CONFIGS = {
  login: { length: 6, expirySeconds: 300, maxAttempts: 3, cooldownSeconds: 60, maxSendsPerHour: 5, maxSendsPerDay: 10 },
  payment: { length: 6, expirySeconds: 180, maxAttempts: 3, cooldownSeconds: 30, maxSendsPerHour: 10, maxSendsPerDay: 20 },
  account_change: { length: 6, expirySeconds: 600, maxAttempts: 5, cooldownSeconds: 60, maxSendsPerHour: 5, maxSendsPerDay: 10 },
} satisfies Record<string, OTPConfig>;

export type Purpose = keyof typeof CONFIGS;
export const purposes = Object.keys(CONFIGS) as [Purpose, ...Purpose[]];

const hmac = (...parts: string[]) => createHmac("sha256", SECRET).update(parts.join("\u0000")).digest("hex");

async function audit(phone: string, purpose: string, event: string) {
  await pool.query("INSERT INTO otp_events (phone_hmac, purpose, event) VALUES ($1, $2, $3)", [hmac("phone", phone), purpose, event]);
}

/** Increment a fixed-window counter and return its new value. */
async function bump(key: string, ttlSeconds: number): Promise<number> {
  const res = await redis.multi().incr(key).expire(key, ttlSeconds).exec();
  return Number(res![0][1]);
}

export async function sendOTP(phone: string, purpose: Purpose) {
  const cfg = CONFIGS[purpose];

  // Cooldown: SET NX is atomic, so two simultaneous requests cannot both pass
  const cooled = await redis.set(`otp:cooldown:${phone}`, "1", "EX", cfg.cooldownSeconds, "NX");
  if (!cooled) {
    return { ok: false as const, error: "Please wait before requesting another code", retryAfter: await redis.ttl(`otp:cooldown:${phone}`) };
  }

  const hour = await bump(`otp:hour:${phone}:${Math.floor(Date.now() / 3_600_000)}`, 3600);
  const day = await bump(`otp:day:${phone}:${new Date().toISOString().slice(0, 10)}`, 86_400);
  if (hour > cfg.maxSendsPerHour || day > cfg.maxSendsPerDay) {
    return { ok: false as const, error: "Too many codes requested. Try again later." };
  }

  const code = String(randomInt(10 ** (cfg.length - 1), 10 ** cfg.length));
  const key = `otp:code:${phone}:${purpose}`;
  await redis.multi().del(key).hset(key, { hash: hmac(phone, purpose, code), attempts: 0 }).expire(key, cfg.expirySeconds).exec();

  if (!(await sendSMS(phone, `Your verification code is ${code}. It expires in ${Math.ceil(cfg.expirySeconds / 60)} min.`))) {
    await redis.del(key, `otp:cooldown:${phone}`); // let the user retry right away
    return { ok: false as const, error: "Could not deliver the code. Please try again." };
  }

  await audit(phone, purpose, "sent");
  return { ok: true as const, expiresIn: cfg.expirySeconds };
}

export async function verifyOTP(phone: string, purpose: Purpose, code: string) {
  const cfg = CONFIGS[purpose];
  const lockKey = `otp:lockout:${phone}`;
  if (await redis.exists(lockKey)) {
    return { valid: false as const, error: `Locked. Try again in ${await redis.ttl(lockKey)} seconds.` };
  }

  const key = `otp:code:${phone}:${purpose}`;
  const storedHash = await redis.hget(key, "hash");
  if (!storedHash) return { valid: false as const, error: "Code expired or not found. Request a new one." };

  // Count the attempt first: INCR is atomic, so parallel guesses each use up one attempt
  const attempts = await redis.hincrby(key, "attempts", 1);
  if (attempts > cfg.maxAttempts) {
    await redis.del(key);
    await redis.set(lockKey, "1", "EX", 900);
    await audit(phone, purpose, "locked");
    return { valid: false as const, error: "Too many failed attempts. Locked for 15 minutes." };
  }

  const given = Buffer.from(hmac(phone, purpose, code));
  const expected = Buffer.from(storedHash);
  const match = given.length === expected.length && timingSafeEqual(given, expected);
  if (!match) {
    await audit(phone, purpose, "failed");
    return { valid: false as const, error: "Invalid code", remainingAttempts: cfg.maxAttempts - attempts };
  }

  // DEL returns 1 for exactly one caller, so a code cannot be used twice by racing requests
  if ((await redis.del(key)) !== 1) return { valid: false as const, error: "Code already used." };
  await redis.del(`otp:cooldown:${phone}`);
  await audit(phone, purpose, "verified");
  return { valid: true as const };
}

async function sendSMS(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // MessagingServiceSid also works in place of From
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res?.ok;
}
```

Twilio accepts the request with `201`; `res.ok` only means the message was queued. To learn whether it reached the handset, pass a `StatusCallback` URL in the request and record the delivered/failed events your endpoint receives (validate Twilio's `X-Twilio-Signature` header before trusting them).

## Step 3: HTTP routes with zod validation

Phone numbers must be E.164 (`+14155550123`); rejecting everything else at the edge means the Redis keys are canonical.

```typescript
// src/server.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { purposes, sendOTP, verifyOTP } from "./otp";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +14155550123");
const sendSchema = z.object({ phone, purpose: z.enum(purposes) });
const verifySchema = sendSchema.extend({ code: z.string().regex(/^\d{6}$/) });

const app = new Hono();

app.post("/otp/send", zValidator("json", sendSchema), async (c) => {
  const { phone, purpose } = c.req.valid("json");
  const result = await sendOTP(phone, purpose);
  return c.json(result, result.ok ? 200 : 429);
});

app.post("/otp/verify", zValidator("json", verifySchema), async (c) => {
  const { phone, purpose, code } = c.req.valid("json");
  const result = await verifyOTP(phone, purpose, code);
  return c.json(result, result.valid ? 200 : 400);
});

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" }); // put a reverse proxy in front
```

Also rate limit `/otp/send` per client IP at the proxy. The per-number limits stop one number from being drained, but not one attacker cycling through many numbers.

## Results

What Marco's team gets from this design:

- Codes arrive over the phone network and users verify without leaving the app.
- Brute-forcing a 6-digit code is capped at 3 to 5 guesses per code and a 15-minute lockout, enforced by atomic Redis counters.
- SMS spend per number is bounded by the hourly and daily limits and the cooldown; Twilio bills per message segment, so check its pricing page for your destination countries.
- The Redis and PostgreSQL data contain only HMACs, never codes or raw phone numbers in the audit table.

## Related Skills

- [typescript](/skills/typescript): types for the OTP module and server
- [redis](/skills/redis): counters, expiring keys and atomic operations
- [postgresql](/skills/postgresql): the audit table
- [hono](/skills/hono): the HTTP API
- [zod](/skills/zod): request validation
- [twilio](/skills/twilio): SMS delivery
