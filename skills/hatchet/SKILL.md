---
name: hatchet
description: >-
  Orchestrate background jobs and workflows with Hatchet — open-source
  distributed task queue with DAG workflows. Use when someone asks to "run
  background jobs", "Hatchet", "workflow orchestration", "distributed task
  queue", "durable execution", "replace Celery/Bull", or "DAG workflow engine".
  Covers workflow definition, step functions, retries, concurrency control,
  and event-driven triggers.
license: Apache-2.0
compatibility: "TypeScript/Python/Go. Self-hostable or Hatchet Cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["workflows", "background-jobs", "hatchet", "queue", "orchestration"]
---

# Hatchet

## Overview

Hatchet is an open-source distributed task queue and workflow engine. Define workflows as DAGs (directed acyclic graphs), run steps with automatic retries and timeouts, control concurrency, and trigger workflows from events or schedules. Like Temporal but lighter, like BullMQ but with workflow orchestration. Built for background jobs that need reliability: payment processing, data pipelines, AI agent orchestration.

## When to Use

- Background jobs that need reliability (retries, timeouts, idempotency)
- Multi-step workflows (onboarding, order processing, data pipelines)
- Fan-out/fan-in patterns (process items in parallel, aggregate results)
- Rate-limited API calls (concurrency control per workflow)
- Replacing BullMQ/Celery with something more structured

## Instructions

### Setup

```bash
npm install @hatchet-dev/typescript-sdk

# Self-host
docker compose up -d  # From hatchet-dev/hatchet repo
```

### Define a Workflow

```typescript
// workflows/onboarding.ts — Multi-step user onboarding
import Hatchet from "@hatchet-dev/typescript-sdk";

const hatchet = Hatchet.init();

const onboardingWorkflow = hatchet.workflow({
  name: "user-onboarding",
  on: { event: "user:created" },
  timeout: "10m",
});

// Step 1: Send welcome email
onboardingWorkflow.step("send-welcome-email", async (ctx) => {
  const { userId, email } = ctx.input();
  await sendEmail(email, {
    subject: "Welcome!",
    template: "welcome",
  });
  return { emailSent: true };
}, { retries: 3, timeout: "30s" });

// Step 2: Set up default workspace (runs after step 1)
onboardingWorkflow.step("create-workspace", async (ctx) => {
  const { userId } = ctx.input();
  const workspace = await createWorkspace(userId, "My Workspace");
  return { workspaceId: workspace.id };
}, {
  parents: ["send-welcome-email"],
  retries: 2,
  timeout: "1m",
});

// Step 3: Generate sample data (runs after workspace created)
onboardingWorkflow.step("seed-data", async (ctx) => {
  const { workspaceId } = ctx.stepOutput("create-workspace");
  await seedSampleData(workspaceId);
  return { seeded: true };
}, {
  parents: ["create-workspace"],
  timeout: "2m",
});

// Step 4: Send getting-started guide (runs after email + workspace)
onboardingWorkflow.step("send-guide", async (ctx) => {
  const { email } = ctx.input();
  await sendEmail(email, {
    subject: "Getting Started Guide",
    template: "getting-started",
  });
}, {
  parents: ["send-welcome-email", "create-workspace"],
  retries: 3,
});
```

### Trigger Workflows

```typescript
// src/api/users.ts — Trigger from your application
import Hatchet from "@hatchet-dev/typescript-sdk";

const hatchet = Hatchet.init();

// Event-based trigger
await hatchet.event.push("user:created", {
  userId: "user_123",
  email: "kai@example.com",
  plan: "pro",
});

// Direct trigger
const run = await hatchet.workflow.run("user-onboarding", {
  userId: "user_123",
  email: "kai@example.com",
});

// Wait for result
const result = await run.result();
console.log(result); // { emailSent: true, workspaceId: "ws_xxx", seeded: true }
```

### Concurrency Control

```typescript
// workflows/api-sync.ts — Rate-limited external API calls
const syncWorkflow = hatchet.workflow({
  name: "api-sync",
  concurrency: {
    maxRuns: 5,              // Max 5 concurrent workflow runs
    limitStrategy: "QUEUE",  // Queue excess, don't drop
  },
});

syncWorkflow.step("fetch-data", async (ctx) => {
  const { apiEndpoint } = ctx.input();
  const data = await fetch(apiEndpoint).then(r => r.json());
  return { records: data.length };
}, {
  retries: 3,
  backoff: { type: "exponential", base: 2 },
  timeout: "30s",
  concurrency: { key: "api-provider", maxRuns: 10 },  // Per-key limit
});
```

### Scheduled Workflows

```typescript
// workflows/daily-report.ts — Cron-triggered workflow
const reportWorkflow = hatchet.workflow({
  name: "daily-report",
  on: { cron: "0 9 * * *" },  // 9 AM daily
});

reportWorkflow.step("generate", async (ctx) => {
  const stats = await generateDailyStats();
  return stats;
});

reportWorkflow.step("send", async (ctx) => {
  const stats = ctx.stepOutput("generate");
  await sendSlackReport(stats);
}, { parents: ["generate"] });
```

## Examples

### Example 1: Order processing pipeline

**User prompt:** "Build a reliable order processing workflow — validate, charge, fulfill, notify."

The agent will create a Hatchet workflow with sequential steps, payment retry logic, and parallel notification to customer + warehouse.

### Example 2: AI agent orchestration

**User prompt:** "Run an AI pipeline: scrape data → process → generate report → email."

The agent will create a DAG workflow with fan-out scraping, aggregation step, LLM generation, and email delivery with retries.

## Guidelines

- **Workflows are DAGs** — define step dependencies with `parents`
- **Retries are per-step** — each step can have its own retry policy
- **Timeouts prevent hung jobs** — always set per-step and per-workflow timeouts
- **Concurrency control** — limit parallel runs globally or per-key
- **Events for decoupling** — trigger workflows from events, not direct calls
- **`ctx.stepOutput()` passes data between steps** — typed step results
- **Idempotency** — design steps to be safely retried
- **Self-hostable** — Postgres + Hatchet engine
- **Dashboard for monitoring** — see running workflows, failed steps, retry history
- **Backoff strategies** — exponential, linear, or constant for retries
