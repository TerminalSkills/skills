---
title: Build a User Onboarding Flow with Progress Tracking
slug: build-user-onboarding-flow-with-progress
description: Build a guided onboarding flow that walks new users through setup steps, tracks completion progress, sends nudge emails for stalled users, and measures activation metrics.
skills:
  - typescript
  - redis
  - postgresql
  - nextjs
  - hono
  - zod
category: development
tags:
  - onboarding
  - user-experience
  - activation
  - engagement
  - saas
---

# Build a User Onboarding Flow with Progress Tracking

## The Problem

Amira leads growth at a 30-person SaaS. 500 users sign up weekly, but only 120 reach "activated" status (completed setup + used a core feature). The signup-to-activation funnel shows users drop off at different points: 30% never complete profile setup, 25% never create their first project, 20% never invite a team member. There's no guidance after signup — users land on an empty dashboard and leave confused. They need a step-by-step onboarding flow that guides users to activation, tracks where they drop off, and re-engages stalled users.

## Step 1: Build the Onboarding Engine

```typescript
// src/onboarding/engine.ts — Onboarding flow with progress tracking and nudges
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  action: string;              // what to check for completion
  actionUrl: string;
  required: boolean;
  order: number;
  category: "setup" | "explore" | "activate";
  estimatedMinutes: number;
  nudgeEmailDelay: number;     // hours after signup to send reminder
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "complete_profile",
    title: "Complete your profile",
    description: "Add your name, role, and profile photo",
    action: "profile_completed",
    actionUrl: "/settings/profile",
    required: true,
    order: 1,
    category: "setup",
    estimatedMinutes: 2,
    nudgeEmailDelay: 24,
  },
  {
    id: "create_project",
    title: "Create your first project",
    description: "Set up a project to organize your work",
    action: "project_created",
    actionUrl: "/projects/new",
    required: true,
    order: 2,
    category: "setup",
    estimatedMinutes: 3,
    nudgeEmailDelay: 48,
  },
  {
    id: "invite_team",
    title: "Invite a team member",
    description: "Collaboration makes everything better",
    action: "team_member_invited",
    actionUrl: "/settings/team",
    required: false,
    order: 3,
    category: "explore",
    estimatedMinutes: 1,
    nudgeEmailDelay: 72,
  },
  {
    id: "connect_integration",
    title: "Connect an integration",
    description: "Link Slack, GitHub, or Jira for seamless workflow",
    action: "integration_connected",
    actionUrl: "/settings/integrations",
    required: false,
    order: 4,
    category: "explore",
    estimatedMinutes: 5,
    nudgeEmailDelay: 96,
  },
  {
    id: "complete_first_task",
    title: "Complete your first task",
    description: "Mark a task as done to experience the full workflow",
    action: "task_completed",
    actionUrl: "/projects",
    required: true,
    order: 5,
    category: "activate",
    estimatedMinutes: 2,
    nudgeEmailDelay: 120,
  },
];

// Get onboarding progress for a user
export async function getOnboardingProgress(userId: string): Promise<{
  steps: Array<OnboardingStep & { completed: boolean; completedAt: string | null }>;
  progressPercent: number;
  isActivated: boolean;
  nextStep: OnboardingStep | null;
}> {
  const { rows: completions } = await pool.query(
    "SELECT step_id, completed_at FROM onboarding_progress WHERE user_id = $1",
    [userId]
  );

  const completionMap = new Map(completions.map((c) => [c.step_id, c.completed_at]));

  const steps = ONBOARDING_STEPS.map((step) => ({
    ...step,
    completed: completionMap.has(step.id),
    completedAt: completionMap.get(step.id) || null,
  }));

  const completedCount = steps.filter((s) => s.completed).length;
  const requiredSteps = steps.filter((s) => s.required);
  const allRequiredCompleted = requiredSteps.every((s) => s.completed);
  const nextStep = steps.find((s) => !s.completed) || null;

  return {
    steps,
    progressPercent: Math.round((completedCount / steps.length) * 100),
    isActivated: allRequiredCompleted,
    nextStep,
  };
}

// Mark a step as completed (called from various places in the app)
export async function completeStep(userId: string, stepAction: string): Promise<{
  step: string;
  progressPercent: number;
  isActivated: boolean;
  celebration: boolean;
}> {
  const step = ONBOARDING_STEPS.find((s) => s.action === stepAction);
  if (!step) return { step: "", progressPercent: 0, isActivated: false, celebration: false };

  // Idempotent: don't re-record
  const { rows: existing } = await pool.query(
    "SELECT 1 FROM onboarding_progress WHERE user_id = $1 AND step_id = $2",
    [userId, step.id]
  );

  if (existing.length > 0) {
    const progress = await getOnboardingProgress(userId);
    return { step: step.id, progressPercent: progress.progressPercent, isActivated: progress.isActivated, celebration: false };
  }

  await pool.query(
    "INSERT INTO onboarding_progress (user_id, step_id, completed_at) VALUES ($1, $2, NOW())",
    [userId, step.id]
  );

  const progress = await getOnboardingProgress(userId);

  // Track activation event
  if (progress.isActivated) {
    await pool.query(
      "UPDATE users SET activated_at = NOW() WHERE id = $1 AND activated_at IS NULL",
      [userId]
    );
    await redis.publish("onboarding:activated", JSON.stringify({ userId }));
  }

  // Celebration for milestones
  const celebration = progress.progressPercent === 100 || progress.isActivated;

  // Cancel pending nudge emails for this step
  await redis.del(`nudge:${userId}:${step.id}`);

  return {
    step: step.id,
    progressPercent: progress.progressPercent,
    isActivated: progress.isActivated,
    celebration,
  };
}

// Schedule nudge emails for stalled users
export async function scheduleNudges(userId: string, signupTimestamp: number): Promise<void> {
  for (const step of ONBOARDING_STEPS) {
    const nudgeAt = signupTimestamp + step.nudgeEmailDelay * 3600000;
    await redis.zadd("nudge:queue", nudgeAt, JSON.stringify({
      userId,
      stepId: step.id,
      stepTitle: step.title,
      actionUrl: step.actionUrl,
    }));
  }
}

// Process nudge queue (run periodically)
export async function processNudges(): Promise<number> {
  const now = Date.now();
  const items = await redis.zrangebyscore("nudge:queue", 0, now);
  let sent = 0;

  for (const item of items) {
    const nudge = JSON.parse(item);
    await redis.zrem("nudge:queue", item);

    // Check if step is already completed
    const { rows } = await pool.query(
      "SELECT 1 FROM onboarding_progress WHERE user_id = $1 AND step_id = $2",
      [nudge.userId, nudge.stepId]
    );

    if (rows.length === 0) {
      // Send nudge email
      await sendNudgeEmail(nudge.userId, nudge.stepTitle, nudge.actionUrl);
      sent++;
    }
  }

  return sent;
}

async function sendNudgeEmail(userId: string, stepTitle: string, actionUrl: string) {
  // Queue email via notification system
}
```

## Results

- **Activation rate: 24% → 52%** — guided onboarding with progress bar creates momentum; users complete steps because they want to fill the bar
- **Drop-off points visible** — analytics show exactly where users stall; "invite team member" had 50% drop-off → team made it optional and activation improved
- **Nudge emails recover 15% of stalled users** — personalized reminders at 24h, 48h, 72h bring users back to complete specific steps
- **Time to activation: 5 days → 1.5 days** — clear next-step guidance means users don't wander; they follow the path
- **Celebration moments boost retention** — confetti animation on activation creates positive association; day-7 retention improved 18%
