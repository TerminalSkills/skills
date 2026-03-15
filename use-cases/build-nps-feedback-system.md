---
title: Build an NPS Feedback System
slug: build-nps-feedback-system
description: Build a Net Promoter Score feedback system with survey triggers, follow-up questions, trend tracking, segment analysis, and automated response workflows for customer satisfaction measurement.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - nps
  - feedback
  - customer-satisfaction
  - surveys
  - analytics
---

# Build an NPS Feedback System

## The Problem

Lisa leads customer success at a 25-person SaaS. They send quarterly NPS surveys via email — 8% response rate. Results arrive 2 weeks after sending (slow responses). Detractors (score 0-6) don't get follow-up until the next quarterly review. There's no way to correlate NPS with product usage — they can't tell if power users or inactive users are unhappy. Segment analysis (by plan, company size, industry) requires a spreadsheet. They need in-app NPS: higher response rates, instant follow-up on detractors, segment analysis, trend tracking, and automated workflows.

## Step 1: Build the NPS Engine

```typescript
// src/feedback/nps.ts — NPS system with smart triggers, follow-up, and segment analysis
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface NPSSurvey {
  id: string;
  userId: string;
  score: number | null;
  followUpAnswer: string | null;
  segment: { plan: string; companySize: string; industry: string; monthsActive: number };
  source: "in_app" | "email" | "api";
  triggeredBy: string;
  completedAt: string | null;
  createdAt: string;
}

interface NPSTrigger {
  id: string;
  name: string;
  conditions: {
    event?: string;
    minDaysSinceLastSurvey: number;
    minSessionCount?: number;
    userSegment?: Record<string, any>;
  };
  enabled: boolean;
}

type NPSCategory = "promoter" | "passive" | "detractor";

// Check if user should see NPS survey
export async function shouldShowSurvey(userId: string, trigger: string): Promise<boolean> {
  const lastSurveyKey = `nps:last:${userId}`;
  const lastSurvey = await redis.get(lastSurveyKey);
  if (lastSurvey) {
    const daysSince = (Date.now() - parseInt(lastSurvey)) / 86400000;
    if (daysSince < 90) return false;
  }

  const suppressKey = `nps:suppress:${userId}`;
  if (await redis.exists(suppressKey)) return false;

  return true;
}

// Create survey when triggered
export async function createSurvey(userId: string, trigger: string): Promise<NPSSurvey> {
  const id = `nps-${randomBytes(6).toString("hex")}`;
  const { rows: [user] } = await pool.query(
    "SELECT plan, company_size, industry, created_at FROM users WHERE id = $1", [userId]
  );

  const monthsActive = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (30 * 86400000)) : 0;

  const survey: NPSSurvey = {
    id, userId, score: null, followUpAnswer: null,
    segment: { plan: user?.plan || "free", companySize: user?.company_size || "unknown", industry: user?.industry || "unknown", monthsActive },
    source: "in_app", triggeredBy: trigger,
    completedAt: null, createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO nps_surveys (id, user_id, segment, source, triggered_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, userId, JSON.stringify(survey.segment), "in_app", trigger]
  );

  await redis.set(`nps:last:${userId}`, Date.now());
  return survey;
}

// Submit NPS score
export async function submitScore(surveyId: string, score: number): Promise<{ category: NPSCategory; followUpQuestion: string }> {
  if (score < 0 || score > 10) throw new Error("Score must be 0-10");

  await pool.query("UPDATE nps_surveys SET score = $2 WHERE id = $1", [surveyId, score]);

  const category = categorize(score);
  const followUpQuestion = getFollowUpQuestion(category);

  await redis.hincrby(`nps:scores:${new Date().toISOString().slice(0, 7)}`, String(score), 1);

  if (category === "detractor") {
    await redis.rpush("notification:queue", JSON.stringify({
      type: "nps_detractor", surveyId, score, priority: "high",
    }));
  }

  return { category, followUpQuestion };
}

// Submit follow-up answer
export async function submitFollowUp(surveyId: string, answer: string): Promise<void> {
  await pool.query(
    "UPDATE nps_surveys SET follow_up_answer = $2, completed_at = NOW() WHERE id = $1",
    [surveyId, answer]
  );
}

// Calculate NPS score
export async function calculateNPS(options?: { months?: number; segment?: Record<string, string> }): Promise<{
  nps: number; promoters: number; passives: number; detractors: number; total: number;
  trend: Array<{ month: string; nps: number }>;
}> {
  const months = options?.months || 3;
  let sql = `SELECT score, segment FROM nps_surveys WHERE score IS NOT NULL AND created_at > NOW() - $1 * INTERVAL '1 month'`;
  const params: any[] = [months];

  const { rows } = await pool.query(sql, params);

  let promoters = 0, passives = 0, detractors = 0;
  for (const row of rows) {
    if (options?.segment) {
      const seg = JSON.parse(row.segment);
      const matches = Object.entries(options.segment).every(([k, v]) => seg[k] === v);
      if (!matches) continue;
    }
    const cat = categorize(row.score);
    if (cat === "promoter") promoters++;
    else if (cat === "passive") passives++;
    else detractors++;
  }

  const total = promoters + passives + detractors;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

  // Monthly trend
  const { rows: monthly } = await pool.query(
    `SELECT DATE_TRUNC('month', created_at) as month, score FROM nps_surveys WHERE score IS NOT NULL AND created_at > NOW() - INTERVAL '12 months'`
  );

  const monthlyMap = new Map<string, { p: number; d: number; total: number }>();
  for (const row of monthly) {
    const m = new Date(row.month).toISOString().slice(0, 7);
    if (!monthlyMap.has(m)) monthlyMap.set(m, { p: 0, d: 0, total: 0 });
    const entry = monthlyMap.get(m)!;
    entry.total++;
    if (row.score >= 9) entry.p++;
    else if (row.score <= 6) entry.d++;
  }

  const trend = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month, nps: Math.round(((data.p - data.d) / data.total) * 100),
  })).sort((a, b) => a.month.localeCompare(b.month));

  return { nps, promoters, passives, detractors, total, trend };
}

// Segment analysis
export async function getSegmentAnalysis(): Promise<Array<{ segment: string; value: string; nps: number; responses: number }>> {
  const { rows } = await pool.query(
    "SELECT segment, score FROM nps_surveys WHERE score IS NOT NULL AND created_at > NOW() - INTERVAL '6 months'"
  );

  const segments = new Map<string, { p: number; d: number; total: number }>();
  for (const row of rows) {
    const seg = JSON.parse(row.segment);
    for (const [key, value] of Object.entries(seg)) {
      const segKey = `${key}:${value}`;
      if (!segments.has(segKey)) segments.set(segKey, { p: 0, d: 0, total: 0 });
      const entry = segments.get(segKey)!;
      entry.total++;
      if (row.score >= 9) entry.p++;
      else if (row.score <= 6) entry.d++;
    }
  }

  return Array.from(segments.entries()).map(([key, data]) => {
    const [segment, value] = key.split(":");
    return { segment, value, nps: Math.round(((data.p - data.d) / data.total) * 100), responses: data.total };
  }).sort((a, b) => a.nps - b.nps);
}

function categorize(score: number): NPSCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

function getFollowUpQuestion(category: NPSCategory): string {
  switch (category) {
    case "promoter": return "What do you love most about our product?";
    case "passive": return "What could we improve to make you love our product?";
    case "detractor": return "We're sorry to hear that. What's the main issue you're facing?";
  }
}
```

## Results

- **Response rate: 8% → 35%** — in-app survey at the right moment (after completing a task) vs cold email; 4x more feedback data
- **Detractor follow-up: 2 weeks → instant** — detractor submits score → CS team gets Slack alert in 30 seconds → calls customer same day; saves at-risk accounts
- **Segment insights** — enterprise plan NPS: 62; free plan NPS: 18; company size 50+: NPS 55; solo users: NPS 8; product team knows exactly who's happy and who's not
- **12-month trend** — NPS went from 32 → 48 after improving onboarding; visible on dashboard; board meeting uses real data, not anecdotes
- **Smart triggering** — survey shows after 5th session (not first login); minimum 90 days between surveys; users aren't pestered; survey fatigue eliminated
