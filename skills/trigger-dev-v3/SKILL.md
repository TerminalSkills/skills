---
name: trigger-dev-v3
category: Backend Development
tags: [background-jobs, serverless, durable, typescript, queue, scheduling]
version: 1.0.0
author: terminal-skills
---

# Trigger.dev v3 — Background Jobs for TypeScript

You are an expert in Trigger.dev v3, the background jobs platform for TypeScript. You help developers run long-running tasks, scheduled jobs, event-driven workflows, and AI pipelines in the cloud — with automatic retries, concurrency control, real-time logs, and up to 5-minute (or longer) execution times that serverless functions can't handle.

## Core Capabilities

```typescript
import { task, schedules } from "@trigger.dev/sdk/v3";

// Define a background task
export const processVideo = task({
  id: "process-video",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, factor: 2 },
  run: async (payload: { videoUrl: string; userId: string }) => {
    const downloaded = await downloadVideo(payload.videoUrl);
    const transcoded = await transcodeToMP4(downloaded);
    const thumbnail = await generateThumbnail(transcoded);
    await uploadToS3(transcoded, thumbnail);
    await db.videos.update(payload.userId, { status: "ready", thumbnail });
    return { success: true };
  },
});

// Trigger from your API
app.post("/api/upload", async (req, res) => {
  const handle = await processVideo.trigger({ videoUrl: req.body.url, userId: req.user.id });
  res.json({ jobId: handle.id });         // Returns immediately
});

// Scheduled task (cron)
export const dailyReport = schedules.task({
  id: "daily-report",
  cron: "0 9 * * *",                      // 9 AM daily
  run: async () => {
    const stats = await generateDailyStats();
    await sendSlackMessage("#reports", formatReport(stats));
  },
});

// Fan-out: process items in parallel with concurrency limit
export const batchProcess = task({
  id: "batch-process",
  run: async (payload: { items: string[] }) => {
    const results = await processVideo.batchTriggerAndWait(
      payload.items.map(url => ({ payload: { videoUrl: url, userId: "system" } })),
    );
    return results;
  },
});
```

## Installation

```bash
npm install @trigger.dev/sdk
npx trigger.dev@latest init
npx trigger.dev@latest dev                 # Local dev server
```

## Best Practices

1. **Long-running** — Tasks can run for minutes/hours; not limited to serverless timeouts
2. **Automatic retries** — Configure retry with exponential backoff; handles transient failures
3. **Concurrency** — Set `concurrencyLimit` to control parallel execution; prevent overwhelming APIs
4. **Fan-out** — Use `batchTriggerAndWait` to process arrays in parallel; collect all results
5. **Idempotent** — Design tasks to be safely re-runnable; retries may re-execute partially completed tasks
6. **Real-time logs** — Dashboard shows live logs, status, duration; debug without local reproduction
7. **Scheduled tasks** — Cron expressions for periodic jobs; replaces node-cron with managed infrastructure
8. **Type-safe** — Payload types enforced; trigger and task share TypeScript types
