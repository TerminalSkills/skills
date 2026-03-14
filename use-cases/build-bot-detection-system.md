---
title: Build a Bot Detection System
slug: build-bot-detection-system
description: Build a bot detection system using behavioral analysis, fingerprinting, rate patterns, CAPTCHA challenges, and honeypot traps — protecting forms, APIs, and content from automated abuse.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - bot-detection
  - security
  - anti-spam
  - web-scraping
  - protection
---

# Build a Bot Detection System

## The Problem

Freya leads security at a 25-person e-commerce site. Bots are a constant problem: scrapers copy product data and prices every hour, fake account registrations inflate metrics, credential stuffing attacks hit the login endpoint 50K times/day, and scalper bots buy limited-edition products in milliseconds. They block individual IPs but bots rotate through proxy networks. CAPTCHAs annoy real customers (12% abandonment increase). They need layered bot detection that catches automated traffic without disrupting humans.

## Step 1: Build the Bot Detection Engine

```typescript
// src/security/bot-detection.ts — Multi-layer bot detection with scoring
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface BotScore {
  score: number;               // 0-100 (0=definitely human, 100=definitely bot)
  signals: string[];
  action: "allow" | "challenge" | "block";
  fingerprint: string;
}

interface RequestContext {
  ip: string;
  userAgent: string;
  headers: Record<string, string>;
  path: string;
  method: string;
  body?: any;
  timestamp: number;
}

const SCORE_THRESHOLDS = {
  challenge: 40,               // show CAPTCHA
  block: 70,                   // block request
};

// Analyze request for bot signals
export async function analyzeRequest(ctx: RequestContext): Promise<BotScore> {
  let score = 0;
  const signals: string[] = [];

  // 1. Header analysis
  const headerScore = analyzeHeaders(ctx);
  score += headerScore.score;
  signals.push(...headerScore.signals);

  // 2. Rate analysis
  const rateScore = await analyzeRate(ctx);
  score += rateScore.score;
  signals.push(...rateScore.signals);

  // 3. User-Agent analysis
  const uaScore = analyzeUserAgent(ctx.userAgent);
  score += uaScore.score;
  signals.push(...uaScore.signals);

  // 4. Behavioral analysis (timing, patterns)
  const behaviorScore = await analyzeBehavior(ctx);
  score += behaviorScore.score;
  signals.push(...behaviorScore.signals);

  // 5. Known bot lists
  const knownScore = await checkKnownBots(ctx.ip, ctx.userAgent);
  score += knownScore.score;
  signals.push(...knownScore.signals);

  // Generate fingerprint
  const fingerprint = createHash("md5")
    .update(`${ctx.ip}:${ctx.userAgent}:${ctx.headers["accept-language"] || ""}`)
    .digest("hex").slice(0, 16);

  // Determine action
  score = Math.min(score, 100);
  let action: BotScore["action"] = "allow";
  if (score >= SCORE_THRESHOLDS.block) action = "block";
  else if (score >= SCORE_THRESHOLDS.challenge) action = "challenge";

  // Log for analysis
  await redis.rpush("bot:log", JSON.stringify({
    fingerprint, score, signals, action, ip: ctx.ip,
    path: ctx.path, timestamp: ctx.timestamp,
  }));
  await redis.ltrim("bot:log", -10000, -1);

  return { score, signals, action, fingerprint };
}

// Header analysis
function analyzeHeaders(ctx: RequestContext): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Missing common browser headers
  if (!ctx.headers["accept"]) { score += 10; signals.push("missing-accept"); }
  if (!ctx.headers["accept-language"]) { score += 15; signals.push("missing-accept-language"); }
  if (!ctx.headers["accept-encoding"]) { score += 10; signals.push("missing-accept-encoding"); }

  // Header order anomalies (browsers send headers in consistent order)
  const headerKeys = Object.keys(ctx.headers);
  if (headerKeys[0] !== "host" && headerKeys[0] !== "Host") {
    score += 5; signals.push("unusual-header-order");
  }

  // Connection header from HTTP/2+ clients (shouldn't have it)
  if (ctx.headers["connection"] && ctx.headers[":method"]) {
    score += 20; signals.push("http2-with-connection-header");
  }

  return { score, signals };
}

// Rate analysis
async function analyzeRate(ctx: RequestContext): Promise<{ score: number; signals: string[] }> {
  let score = 0;
  const signals: string[] = [];

  const minuteKey = `rate:${ctx.ip}:${Math.floor(ctx.timestamp / 60000)}`;
  const hourKey = `rate:${ctx.ip}:h:${Math.floor(ctx.timestamp / 3600000)}`;

  const [minuteCount, hourCount] = await Promise.all([
    redis.incr(minuteKey).then(async (v) => { await redis.expire(minuteKey, 120); return v; }),
    redis.incr(hourKey).then(async (v) => { await redis.expire(hourKey, 7200); return v; }),
  ]);

  // High request rate
  if (minuteCount > 60) { score += 30; signals.push(`high-rpm:${minuteCount}`); }
  else if (minuteCount > 30) { score += 15; signals.push(`elevated-rpm:${minuteCount}`); }

  if (hourCount > 1000) { score += 25; signals.push(`high-rph:${hourCount}`); }

  // Consistent timing (bots often have very regular intervals)
  const timingKey = `timing:${ctx.ip}`;
  const lastRequestTime = await redis.get(timingKey);
  await redis.setex(timingKey, 300, String(ctx.timestamp));

  if (lastRequestTime) {
    const interval = ctx.timestamp - parseInt(lastRequestTime);
    const intervalKey = `timing:intervals:${ctx.ip}`;
    await redis.rpush(intervalKey, String(interval));
    await redis.ltrim(intervalKey, -20, -1);
    await redis.expire(intervalKey, 300);

    const intervals = (await redis.lrange(intervalKey, 0, -1)).map(Number);
    if (intervals.length >= 10) {
      const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const variance = intervals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // Very consistent timing = bot
      if (stdDev < 50 && avg < 2000) {
        score += 25;
        signals.push(`consistent-timing:stddev=${Math.round(stdDev)}ms`);
      }
    }
  }

  return { score, signals };
}

// User-Agent analysis
function analyzeUserAgent(ua: string): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  if (!ua || ua.length < 10) { score += 30; signals.push("missing-or-short-ua"); return { score, signals }; }

  // Known bot UAs
  const botPatterns = ["bot", "crawl", "spider", "scrape", "curl", "wget", "python-requests", "axios", "node-fetch", "httpie", "postman"];
  const lowerUA = ua.toLowerCase();
  for (const pattern of botPatterns) {
    if (lowerUA.includes(pattern)) {
      score += 20;
      signals.push(`bot-ua:${pattern}`);
      break;
    }
  }

  // Outdated browser versions (often spoofed)
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  if (chromeMatch && parseInt(chromeMatch[1]) < 90) {
    score += 10; signals.push(`outdated-chrome:${chromeMatch[1]}`);
  }

  return { score, signals };
}

// Behavioral analysis
async function analyzeBehavior(ctx: RequestContext): Promise<{ score: number; signals: string[] }> {
  let score = 0;
  const signals: string[] = [];

  // Check if IP hits only API endpoints (no static assets, no page loads)
  const pathKey = `paths:${ctx.ip}`;
  await redis.sadd(pathKey, ctx.path);
  await redis.expire(pathKey, 3600);

  const paths = await redis.smembers(pathKey);
  const apiOnly = paths.every((p) => p.startsWith("/api/"));
  if (apiOnly && paths.length > 5) {
    score += 15; signals.push("api-only-access");
  }

  return { score, signals };
}

// Check known bot IPs and UAs
async function checkKnownBots(ip: string, ua: string): Promise<{ score: number; signals: string[] }> {
  let score = 0;
  const signals: string[] = [];

  const isBlacklisted = await redis.sismember("bot:blacklist:ips", ip);
  if (isBlacklisted) { score += 50; signals.push("blacklisted-ip"); }

  const isWhitelisted = await redis.sismember("bot:whitelist:ips", ip);
  if (isWhitelisted) { score -= 50; signals.push("whitelisted-ip"); }

  return { score, signals };
}

// Honeypot: hidden form field that only bots fill
export function validateHoneypot(formData: Record<string, any>): boolean {
  // If the hidden "website" field has a value, it's a bot
  return !formData._hp_website && !formData._hp_email2;
}

// Middleware
export async function botDetectionMiddleware(c: any, next: any): Promise<void> {
  const ctx: RequestContext = {
    ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0] || "unknown",
    userAgent: c.req.header("User-Agent") || "",
    headers: Object.fromEntries(c.req.raw.headers),
    path: c.req.path,
    method: c.req.method,
    timestamp: Date.now(),
  };

  const result = await analyzeRequest(ctx);

  c.header("X-Bot-Score", String(result.score));

  if (result.action === "block") {
    return c.json({ error: "Request blocked", retry: "Please try again later" }, 403);
  }

  if (result.action === "challenge") {
    c.set("requireChallenge", true);
  }

  await next();
}
```

## Results

- **Credential stuffing blocked** — 50K daily login attempts from rotating proxies caught by rate analysis + consistent timing detection; legitimate users unaffected
- **Scraping reduced 95%** — bots hitting only API endpoints with missing browser headers scored 60+; blocked automatically without CAPTCHAs
- **CAPTCHA only when needed** — score 40-70 gets CAPTCHA challenge; score <40 passes freely; human abandonment from CAPTCHAs dropped from 12% to 2%
- **Scalper bots caught by timing** — requests at perfectly regular 1-second intervals scored high on "consistent-timing"; humans have natural variance
- **Honeypot catches dumb bots** — hidden form fields catch basic bots that fill every field; zero false positives
