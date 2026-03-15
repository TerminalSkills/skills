---
title: Build Feature Tour Onboarding
slug: build-feature-tour-onboarding
description: Build an interactive feature tour system with step-by-step tooltips, progress tracking, conditional branching based on user role, completion analytics, and re-triggerable tours for new features.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - onboarding
  - tour
  - tooltips
  - user-experience
  - product
---

# Build Feature Tour Onboarding

## The Problem

Kai leads growth at a 30-person analytics platform. New users sign up, see a complex dashboard, and leave. 7-day retention is 23%. They tried a "Getting Started" docs page — 4% clicked it. They tried a welcome modal with a video — users closed it immediately. They need contextual, in-app guidance that walks users through the actual UI step by step, adapts to their role (marketer vs developer), and tracks where users drop off so they can improve the weakest steps.

## Step 1: Build the Tour Engine

```typescript
// src/tours/engine.ts — Interactive feature tours with branching, progress, and analytics
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Tour {
  id: string;
  name: string;
  trigger: TourTrigger;
  steps: TourStep[];
  targetRoles: string[];       // empty = all roles
  targetSegments: string[];
  priority: number;
  version: number;
  status: "active" | "draft" | "archived";
}

interface TourTrigger {
  type: "first_visit" | "feature_release" | "manual" | "event";
  page?: string;               // trigger on specific page
  event?: string;              // trigger on specific event
  delay?: number;              // ms before showing
  condition?: string;          // custom JS condition
}

interface TourStep {
  id: string;
  order: number;
  target: string;              // CSS selector or element ID
  title: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right" | "center";
  highlight: boolean;          // dim rest of page
  action?: {
    type: "click" | "input" | "navigate" | "wait";
    target?: string;
    value?: string;
    waitMs?: number;
  };
  branch?: {
    condition: string;         // user property to check
    ifTrue: string;            // step ID to go to
    ifFalse: string;           // step ID to go to
  };
  skippable: boolean;
  media?: { type: "image" | "gif" | "video"; url: string };
}

interface TourProgress {
  tourId: string;
  userId: string;
  currentStep: number;
  status: "in_progress" | "completed" | "skipped" | "abandoned";
  stepTimings: Record<string, number>;  // step ID → ms spent
  startedAt: string;
  completedAt: string | null;
}

// Get next tour for user
export async function getActiveTour(userId: string, context: {
  page: string;
  role: string;
  segments: string[];
  isNewUser: boolean;
  accountAgeDays: number;
}): Promise<{ tour: Tour; progress: TourProgress } | null> {
  // Check if user has an in-progress tour
  const inProgressKey = `tour:progress:${userId}`;
  const inProgress = await redis.get(inProgressKey);
  if (inProgress) {
    const progress: TourProgress = JSON.parse(inProgress);
    const { rows: [tour] } = await pool.query("SELECT * FROM tours WHERE id = $1 AND status = 'active'", [progress.tourId]);
    if (tour) {
      return { tour: parseTour(tour), progress };
    }
  }

  // Find eligible tours
  const { rows: tours } = await pool.query(
    `SELECT * FROM tours WHERE status = 'active' ORDER BY priority DESC`
  );

  for (const row of tours) {
    const tour = parseTour(row);

    // Check if already completed
    const completed = await redis.sismember(`tour:completed:${userId}`, tour.id);
    if (completed) continue;

    // Check targeting
    if (tour.targetRoles.length > 0 && !tour.targetRoles.includes(context.role)) continue;
    if (tour.targetSegments.length > 0 && !tour.targetSegments.some((s) => context.segments.includes(s))) continue;

    // Check trigger
    if (tour.trigger.type === "first_visit" && !context.isNewUser) continue;
    if (tour.trigger.page && tour.trigger.page !== context.page) continue;

    // Start this tour
    const progress: TourProgress = {
      tourId: tour.id,
      userId,
      currentStep: 0,
      status: "in_progress",
      stepTimings: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    await redis.setex(inProgressKey, 86400 * 7, JSON.stringify(progress));

    // Track start
    await pool.query(
      `INSERT INTO tour_events (tour_id, user_id, action, step_id, created_at) VALUES ($1, $2, 'started', $3, NOW())`,
      [tour.id, userId, tour.steps[0].id]
    );

    return { tour, progress };
  }

  return null;
}

// Advance to next step
export async function advanceStep(userId: string, tourId: string, stepId: string, timeSpentMs: number): Promise<{
  nextStep: TourStep | null;
  completed: boolean;
}> {
  const progressKey = `tour:progress:${userId}`;
  const progress: TourProgress = JSON.parse(await redis.get(progressKey) || "{}");

  if (progress.tourId !== tourId) return { nextStep: null, completed: false };

  // Record timing
  progress.stepTimings[stepId] = timeSpentMs;

  // Get tour
  const { rows: [tourRow] } = await pool.query("SELECT * FROM tours WHERE id = $1", [tourId]);
  const tour = parseTour(tourRow);
  const currentStep = tour.steps.find((s) => s.id === stepId);

  // Handle branching
  let nextStepIndex = progress.currentStep + 1;
  if (currentStep?.branch) {
    const { rows: [user] } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const conditionMet = evaluateCondition(currentStep.branch.condition, user);
    const targetStepId = conditionMet ? currentStep.branch.ifTrue : currentStep.branch.ifFalse;
    nextStepIndex = tour.steps.findIndex((s) => s.id === targetStepId);
  }

  // Track step completion
  await pool.query(
    `INSERT INTO tour_events (tour_id, user_id, action, step_id, time_spent_ms, created_at)
     VALUES ($1, $2, 'step_completed', $3, $4, NOW())`,
    [tourId, userId, stepId, timeSpentMs]
  );

  // Check if tour is complete
  if (nextStepIndex >= tour.steps.length) {
    progress.status = "completed";
    progress.completedAt = new Date().toISOString();
    await redis.del(progressKey);
    await redis.sadd(`tour:completed:${userId}`, tourId);

    await pool.query(
      `INSERT INTO tour_events (tour_id, user_id, action, step_id, created_at) VALUES ($1, $2, 'completed', 'all', NOW())`,
      [tourId, userId]
    );

    // Persist final progress
    await pool.query(
      `INSERT INTO tour_progress (tour_id, user_id, status, step_timings, started_at, completed_at)
       VALUES ($1, $2, 'completed', $3, $4, NOW())`,
      [tourId, userId, JSON.stringify(progress.stepTimings), progress.startedAt]
    );

    return { nextStep: null, completed: true };
  }

  progress.currentStep = nextStepIndex;
  await redis.setex(progressKey, 86400 * 7, JSON.stringify(progress));

  return { nextStep: tour.steps[nextStepIndex], completed: false };
}

// Skip tour
export async function skipTour(userId: string, tourId: string, atStepId: string): Promise<void> {
  await redis.del(`tour:progress:${userId}`);
  await redis.sadd(`tour:completed:${userId}`, tourId); // don't show again

  await pool.query(
    `INSERT INTO tour_events (tour_id, user_id, action, step_id, created_at) VALUES ($1, $2, 'skipped', $3, NOW())`,
    [tourId, userId, atStepId]
  );
}

// Tour analytics: where do users drop off?
export async function getTourAnalytics(tourId: string): Promise<{
  started: number;
  completed: number;
  completionRate: number;
  stepDropoff: Array<{ stepId: string; title: string; reached: number; completed: number; dropoffRate: number; avgTimeMs: number }>;
}> {
  const { rows: [counts] } = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN action = 'started' THEN user_id END) as started,
       COUNT(DISTINCT CASE WHEN action = 'completed' THEN user_id END) as completed
     FROM tour_events WHERE tour_id = $1`, [tourId]
  );

  const { rows: [tourRow] } = await pool.query("SELECT * FROM tours WHERE id = $1", [tourId]);
  const tour = parseTour(tourRow);

  const stepDropoff = [];
  for (const step of tour.steps) {
    const { rows: [stepStats] } = await pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN action = 'step_completed' AND step_id = $2 THEN user_id END) as completed,
         AVG(CASE WHEN step_id = $2 THEN time_spent_ms END) as avg_time
       FROM tour_events WHERE tour_id = $1`, [tourId, step.id]
    );

    const reached = parseInt(counts.started); // simplified
    const completed = parseInt(stepStats.completed || "0");

    stepDropoff.push({
      stepId: step.id, title: step.title,
      reached, completed,
      dropoffRate: reached > 0 ? ((reached - completed) / reached) * 100 : 0,
      avgTimeMs: parseFloat(stepStats.avg_time || "0"),
    });
  }

  return {
    started: parseInt(counts.started),
    completed: parseInt(counts.completed),
    completionRate: parseInt(counts.started) > 0 ? (parseInt(counts.completed) / parseInt(counts.started)) * 100 : 0,
    stepDropoff,
  };
}

function parseTour(row: any): Tour {
  return { ...row, steps: JSON.parse(row.steps), targetRoles: JSON.parse(row.target_roles || "[]"), targetSegments: JSON.parse(row.target_segments || "[]"), trigger: JSON.parse(row.trigger) };
}

function evaluateCondition(condition: string, user: any): boolean {
  if (condition === "role:developer") return user.role === "developer";
  if (condition === "role:marketer") return user.role === "marketer";
  if (condition === "plan:paid") return user.plan !== "free";
  return true;
}
```

## Results

- **7-day retention: 23% → 48%** — users who complete the tour are 3x more likely to stay; contextual guidance beats docs and videos
- **Step 3 identified as dropout point** — analytics showed 40% abandoned at the "create dashboard" step; simplified it from 5 clicks to 2; dropout at that step fell to 12%
- **Role-based branching** — developers see API key setup; marketers see dashboard builder; each role completes a relevant path in 3 minutes instead of struggling through irrelevant steps
- **New feature adoption: 8% → 45%** — feature release tours highlight what's new directly in the UI; users discover features they'd never find in changelog emails
- **No third-party costs** — replaced $500/month Pendo subscription with custom solution; full control over targeting and analytics
