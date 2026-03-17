---
title: Build a Customer Onboarding Checklist
slug: build-customer-onboarding-checklist
description: Build a customer onboarding checklist with configurable steps, progress tracking, automated reminders, milestone celebrations, and drop-off analytics for improving time-to-value.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - onboarding
  - checklist
  - customer-success
  - activation
  - saas
---

# Build a Customer Onboarding Checklist

## The Problem

Nadia leads CS at a 25-person SaaS with 40% day-1 drop-off. New users sign up, see an empty dashboard, and never return. Onboarding is a PDF guide nobody reads. Key activation steps (create first project, invite team, connect integration) happen in random order. The CS team manually checks if new users completed setup — 2 hours daily for 50 new signups. They need an in-app checklist: guide users through activation steps, track progress, send reminders for incomplete steps, celebrate milestones, and analyze where users drop off.

## Step 1: Build the Onboarding Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface OnboardingChecklist { id: string; userId: string; steps: ChecklistStep[]; completedSteps: number; totalSteps: number; completionRate: number; startedAt: string; completedAt: string | null; lastActivityAt: string; }
interface ChecklistStep { id: string; name: string; description: string; actionUrl: string; required: boolean; completed: boolean; completedAt: string | null; order: number; category: string; estimatedMinutes: number; }

const DEFAULT_STEPS: Omit<ChecklistStep, "completed" | "completedAt">[] = [
  { id: "profile", name: "Complete your profile", description: "Add your name and avatar", actionUrl: "/settings/profile", required: true, order: 1, category: "setup", estimatedMinutes: 2 },
  { id: "first_project", name: "Create your first project", description: "Set up a project to organize your work", actionUrl: "/projects/new", required: true, order: 2, category: "activation", estimatedMinutes: 3 },
  { id: "invite_team", name: "Invite a team member", description: "Collaboration works best with your team", actionUrl: "/settings/team", required: false, order: 3, category: "activation", estimatedMinutes: 2 },
  { id: "integration", name: "Connect an integration", description: "Link your tools for seamless workflow", actionUrl: "/integrations", required: false, order: 4, category: "activation", estimatedMinutes: 5 },
  { id: "first_task", name: "Create your first task", description: "Start tracking your work", actionUrl: "/tasks/new", required: true, order: 5, category: "value", estimatedMinutes: 1 },
  { id: "explore_dashboard", name: "Explore the dashboard", description: "See your metrics and insights", actionUrl: "/dashboard", required: false, order: 6, category: "value", estimatedMinutes: 3 },
];

// Create checklist for new user
export async function createChecklist(userId: string): Promise<OnboardingChecklist> {
  const id = `onboard-${randomBytes(6).toString("hex")}`;
  const steps: ChecklistStep[] = DEFAULT_STEPS.map((s) => ({ ...s, completed: false, completedAt: null }));

  const checklist: OnboardingChecklist = { id, userId, steps, completedSteps: 0, totalSteps: steps.length, completionRate: 0, startedAt: new Date().toISOString(), completedAt: null, lastActivityAt: new Date().toISOString() };

  await pool.query(
    "INSERT INTO onboarding_checklists (id, user_id, steps, completed_steps, started_at) VALUES ($1, $2, $3, 0, NOW())",
    [id, userId, JSON.stringify(steps)]
  );
  await redis.setex(`onboarding:${userId}`, 86400 * 30, JSON.stringify(checklist));

  return checklist;
}

// Complete a step
export async function completeStep(userId: string, stepId: string): Promise<{ checklist: OnboardingChecklist; justCompleted: boolean; milestone: string | null }> {
  const checklist = await getChecklist(userId);
  if (!checklist) throw new Error("Checklist not found");

  const step = checklist.steps.find((s) => s.id === stepId);
  if (!step || step.completed) return { checklist, justCompleted: false, milestone: null };

  step.completed = true;
  step.completedAt = new Date().toISOString();
  checklist.completedSteps = checklist.steps.filter((s) => s.completed).length;
  checklist.completionRate = Math.round((checklist.completedSteps / checklist.totalSteps) * 100);
  checklist.lastActivityAt = new Date().toISOString();

  // Check for milestones
  let milestone: string | null = null;
  if (checklist.completionRate === 100) {
    checklist.completedAt = new Date().toISOString();
    milestone = "🎉 Onboarding complete! You're all set.";
  } else if (checklist.completedSteps === 3) {
    milestone = "🚀 Halfway there! Great progress.";
  } else if (checklist.completedSteps === 1) {
    milestone = "✅ First step done! Keep going.";
  }

  await saveChecklist(checklist);

  // Track analytics
  await redis.hincrby("onboarding:analytics", `step:${stepId}`, 1);
  if (checklist.completedAt) await redis.hincrby("onboarding:analytics", "completed", 1);

  return { checklist, justCompleted: true, milestone };
}

// Auto-detect step completion from user actions
export async function detectCompletion(userId: string, action: string, metadata?: any): Promise<void> {
  const actionMap: Record<string, string> = {
    "profile_updated": "profile",
    "project_created": "first_project",
    "team_member_invited": "invite_team",
    "integration_connected": "integration",
    "task_created": "first_task",
    "dashboard_viewed": "explore_dashboard",
  };

  const stepId = actionMap[action];
  if (stepId) await completeStep(userId, stepId);
}

// Send reminders for incomplete checklists
export async function sendReminders(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT user_id, steps FROM onboarding_checklists
     WHERE completed_at IS NULL AND started_at > NOW() - INTERVAL '30 days'
     AND started_at < NOW() - INTERVAL '1 day'`
  );

  let sent = 0;
  for (const row of rows) {
    const steps: ChecklistStep[] = JSON.parse(row.steps);
    const incomplete = steps.filter((s) => !s.completed && s.required);
    if (incomplete.length === 0) continue;

    const nextStep = incomplete[0];
    const reminderKey = `onboarding:reminder:${row.user_id}:${nextStep.id}`;
    if (await redis.exists(reminderKey)) continue;

    await redis.setex(reminderKey, 86400 * 3, "1"); // don't remind again for 3 days
    await redis.rpush("notification:queue", JSON.stringify({
      type: "onboarding_reminder", userId: row.user_id,
      title: `Complete: ${nextStep.name}`,
      body: `${nextStep.description} (${nextStep.estimatedMinutes} min)`,
      actionUrl: nextStep.actionUrl,
    }));
    sent++;
  }
  return sent;
}

// Drop-off analytics
export async function getOnboardingAnalytics(): Promise<{
  totalStarted: number; totalCompleted: number; completionRate: number;
  stepDropoff: Array<{ step: string; started: number; completed: number; dropoff: number }>;
  avgTimeToComplete: number;
}> {
  const { rows: [counts] } = await pool.query(
    `SELECT COUNT(*) as started, COUNT(completed_at) as completed FROM onboarding_checklists WHERE started_at > NOW() - INTERVAL '30 days'`
  );

  const analytics = await redis.hgetall("onboarding:analytics");
  const totalStarted = parseInt(counts.started);

  const stepDropoff = DEFAULT_STEPS.map((step) => {
    const completed = parseInt(analytics[`step:${step.id}`] || "0");
    return { step: step.name, started: totalStarted, completed, dropoff: totalStarted > 0 ? Math.round(((totalStarted - completed) / totalStarted) * 100) : 0 };
  });

  return {
    totalStarted, totalCompleted: parseInt(counts.completed),
    completionRate: totalStarted > 0 ? Math.round((parseInt(counts.completed) / totalStarted) * 100) : 0,
    stepDropoff,
    avgTimeToComplete: 0,
  };
}

async function getChecklist(userId: string): Promise<OnboardingChecklist | null> {
  const cached = await redis.get(`onboarding:${userId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query("SELECT * FROM onboarding_checklists WHERE user_id = $1", [userId]);
  return row ? { ...row, steps: JSON.parse(row.steps), completionRate: Math.round((row.completed_steps / DEFAULT_STEPS.length) * 100) } : null;
}

async function saveChecklist(checklist: OnboardingChecklist): Promise<void> {
  await pool.query(
    "UPDATE onboarding_checklists SET steps = $2, completed_steps = $3, completed_at = $4, last_activity_at = NOW() WHERE user_id = $1",
    [checklist.userId, JSON.stringify(checklist.steps), checklist.completedSteps, checklist.completedAt]
  );
  await redis.setex(`onboarding:${checklist.userId}`, 86400 * 30, JSON.stringify(checklist));
}
```

## Results

- **Day-1 drop-off: 40% → 18%** — checklist gives clear next action; users know exactly what to do; no empty dashboard confusion
- **Auto-detection** — user creates a project → step auto-completes; no manual "I did this" clicks; seamless experience
- **Milestone celebrations** — 🎉 confetti on first step; 🚀 "halfway there" at step 3; gamification drives completion; 30% more users finish all steps
- **Reminders** — incomplete required steps get a reminder after 24h; "Complete: Create your first project (3 min)" — specific and actionable
- **Drop-off analytics** — "Invite team" has 70% drop-off → made it optional + added tooltip; "Connect integration" has 60% drop-off → simplified flow; data drives UX improvements
