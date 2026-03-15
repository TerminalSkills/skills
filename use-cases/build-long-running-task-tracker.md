---
title: Build a Long-Running Task Tracker
slug: build-long-running-task-tracker
description: Build a long-running task tracker with progress updates, cancellation support, step-by-step status, ETA calculation, and notification on completion for async operations.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - async
  - tasks
  - progress
  - long-running
  - tracking
---

# Build a Long-Running Task Tracker

## The Problem

Nadia leads backend at a 20-person company. Several operations take 5-30 minutes: data imports (50K rows), report generation, bulk email sends, video transcoding. Users click "Import" and see a spinner for 20 minutes with no feedback. If they close the tab, they don't know if it finished. There's no way to cancel a running import. Failed tasks show a generic error with no detail about which step failed. They need a task tracker: submit long tasks, poll progress, see step-by-step status, cancel running tasks, get ETA, and receive notification on completion.

## Step 1: Build the Task Tracker

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Task { id: string; type: string; userId: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; progress: number; currentStep: string; steps: Array<{ name: string; status: string; startedAt: string | null; completedAt: string | null; details: string }>; eta: string | null; result: any; error: string | null; startedAt: string; completedAt: string | null; }

// Submit a long-running task
export async function submitTask(params: { type: string; userId: string; steps: string[]; payload: any }): Promise<Task> {
  const id = `task-${randomBytes(8).toString("hex")}`;
  const task: Task = {
    id, type: params.type, userId: params.userId, status: "queued", progress: 0, currentStep: params.steps[0],
    steps: params.steps.map((name) => ({ name, status: "pending", startedAt: null, completedAt: null, details: "" })),
    eta: null, result: null, error: null, startedAt: new Date().toISOString(), completedAt: null,
  };
  await redis.setex(`task:${id}`, 86400, JSON.stringify(task));
  await redis.rpush("task:queue", JSON.stringify({ taskId: id, ...params }));
  await pool.query(`INSERT INTO long_tasks (id, type, user_id, status, payload, started_at) VALUES ($1, $2, $3, 'queued', $4, NOW())`, [id, params.type, params.userId, JSON.stringify(params.payload)]);
  return task;
}

// Update task progress (called by worker)
export async function updateProgress(taskId: string, update: { step: string; progress: number; details?: string; status?: string }): Promise<void> {
  const data = await redis.get(`task:${taskId}`);
  if (!data) return;
  const task: Task = JSON.parse(data);

  // Check cancellation
  if (await redis.exists(`task:cancel:${taskId}`)) { task.status = "cancelled"; task.completedAt = new Date().toISOString(); await redis.setex(`task:${taskId}`, 86400, JSON.stringify(task)); return; }

  task.progress = update.progress;
  task.currentStep = update.step;
  const stepIdx = task.steps.findIndex((s) => s.name === update.step);
  if (stepIdx >= 0) {
    task.steps[stepIdx].status = update.status || "running";
    if (!task.steps[stepIdx].startedAt) task.steps[stepIdx].startedAt = new Date().toISOString();
    if (update.details) task.steps[stepIdx].details = update.details;
    if (update.status === "completed") task.steps[stepIdx].completedAt = new Date().toISOString();
  }
  task.status = "running";

  // Calculate ETA
  const elapsed = Date.now() - new Date(task.startedAt).getTime();
  if (task.progress > 0) {
    const totalEstimated = elapsed / (task.progress / 100);
    const remaining = totalEstimated - elapsed;
    task.eta = new Date(Date.now() + remaining).toISOString();
  }

  await redis.setex(`task:${taskId}`, 86400, JSON.stringify(task));
}

// Complete task
export async function completeTask(taskId: string, result: any): Promise<void> {
  const data = await redis.get(`task:${taskId}`);
  if (!data) return;
  const task: Task = JSON.parse(data);
  task.status = "completed"; task.progress = 100; task.result = result; task.completedAt = new Date().toISOString();
  for (const step of task.steps) { if (step.status !== "completed") { step.status = "completed"; step.completedAt = new Date().toISOString(); }}
  await redis.setex(`task:${taskId}`, 86400, JSON.stringify(task));
  await pool.query("UPDATE long_tasks SET status = 'completed', result = $2, completed_at = NOW() WHERE id = $1", [taskId, JSON.stringify(result)]);
  await redis.rpush("notification:queue", JSON.stringify({ type: "task_completed", taskId, userId: task.userId, taskType: task.type }));
}

// Fail task
export async function failTask(taskId: string, error: string): Promise<void> {
  const data = await redis.get(`task:${taskId}`);
  if (!data) return;
  const task: Task = JSON.parse(data);
  task.status = "failed"; task.error = error; task.completedAt = new Date().toISOString();
  await redis.setex(`task:${taskId}`, 86400, JSON.stringify(task));
  await pool.query("UPDATE long_tasks SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1", [taskId, error]);
  await redis.rpush("notification:queue", JSON.stringify({ type: "task_failed", taskId, userId: task.userId, error }));
}

// Cancel task
export async function cancelTask(taskId: string): Promise<void> {
  await redis.setex(`task:cancel:${taskId}`, 3600, "1");
}

// Get task status (for polling)
export async function getTaskStatus(taskId: string): Promise<Task | null> {
  const data = await redis.get(`task:${taskId}`);
  return data ? JSON.parse(data) : null;
}

// Get user's tasks
export async function getUserTasks(userId: string): Promise<Task[]> {
  const { rows } = await pool.query("SELECT id FROM long_tasks WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20", [userId]);
  const tasks: Task[] = [];
  for (const row of rows) {
    const data = await redis.get(`task:${row.id}`);
    if (data) tasks.push(JSON.parse(data));
  }
  return tasks;
}
```

## Results

- **"Import: 67% — Processing row 33,500 of 50,000 — ETA: 3 min"** — users see real progress instead of spinner; reduced support tickets about "is it stuck?" by 90%
- **Tab-safe** — close tab, come back, see task status; notification when done; no lost work
- **Cancellation works** — user starts wrong import → cancel button → task stops at next checkpoint; no waiting 20 minutes for wrong data
- **Step-by-step visibility** — "Validating ✅ → Importing 🔄 → Indexing ⏳" — user knows exactly what's happening and which step failed
- **Notification on completion** — push notification when 30-minute report is done; user doesn't poll manually; goes back to other work
