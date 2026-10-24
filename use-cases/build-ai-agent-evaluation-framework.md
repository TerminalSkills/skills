---
title: Build an AI Agent Evaluation Framework
slug: build-ai-agent-evaluation-framework
description: Build an evaluation framework for AI agents with task completion scoring, hallucination detection, tool use accuracy, latency benchmarking, and regression testing for agent quality assurance.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - ai-agents
  - evaluation
  - testing
  - benchmarking
  - quality
---

# Build an AI Agent Evaluation Framework

## The Problem

Rita leads AI at a 25-person company building customer support agents. They ship agent updates weekly but have no systematic way to measure quality. Last week, a prompt change improved answer accuracy but introduced hallucinated product features. Tool calls (search, order lookup) sometimes fail and nobody knows which ones. Latency swings from 2 seconds to 30 with no tracking. When an agent gets worse, they find out from customer complaints, not from tests. They need automated test suites, checks for invented claims, tool-use accuracy, latency numbers, and an alert when a new version scores worse than the last one.

## The Solution

Store eval cases and run history in PostgreSQL. A runner replays each case against the agent, which is any async function returning the reply text and the names of the tools it called. It scores the reply with deterministic checks and writes a run record. If the score drops or forbidden claims rise against the previous run, it pushes an alert onto a Redis list. A small Hono service, validated with Zod, triggers runs from CI and returns the version history.

Deterministic checks are cheap, repeatable and good at pinning known failures: a feature you do not sell, a tool that must be called. They do not judge open-ended quality, and a substring check cannot read negation: a `mustNotContain` of "dark mode" also fails the reply "we do not offer dark mode", so phrase forbidden claims as the specific wording the agent used when it was wrong. Add model-graded cases separately when you need that, and keep the deterministic ones as the regression floor.

## Step-by-Step Walkthrough

### Step 1: Create the tables

```bash
npm install hono @hono/node-server zod pg ioredis
npm install -D typescript @types/node @types/pg
```

`jsonb` columns come back from `pg` as parsed objects, so no `JSON.parse` is needed.

```sql
CREATE TABLE eval_cases (
  id          text PRIMARY KEY,
  suite       text NOT NULL,
  name        text NOT NULL,
  input       jsonb NOT NULL,   -- {"messages":[{"role":"user","content":"..."}]}
  expected    jsonb NOT NULL,   -- {"mustContain":[],"mustNotContain":[],"expectedTools":[],"maxLatencyMs":8000}
  weight      int NOT NULL DEFAULT 1
);

CREATE TABLE eval_runs (
  id            text PRIMARY KEY,
  suite         text NOT NULL,
  agent_version text NOT NULL,
  summary       jsonb NOT NULL,
  results       jsonb NOT NULL,
  completed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eval_runs_suite_time ON eval_runs (suite, completed_at DESC);
```

### Step 2: Build the evaluation engine

```typescript
// src/eval.ts
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { Redis } from "ioredis";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

export type Message = { role: "user" | "assistant"; content: string };
export type AgentFn = (messages: Message[]) => Promise<{ response: string; toolCalls: string[] }>;

interface Expected {
  mustContain?: string[];
  mustNotContain?: string[];
  expectedTools?: string[];
  maxLatencyMs?: number;
}
interface CaseRow { id: string; name: string; input: { messages: Message[] }; expected: Expected }
interface Result {
  caseId: string; passed: boolean; score: number; latencyMs: number;
  forbiddenClaim: boolean; toolsOk: boolean; issues: string[];
}
export interface Summary {
  total: number; passed: number; avgScore: number;
  forbiddenClaimRate: number; toolAccuracy: number; p95LatencyMs: number;
}

const has = (text: string, phrase: string) => text.toLowerCase().includes(phrase.toLowerCase());

function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
}

async function runCase(tc: CaseRow, agent: AgentFn): Promise<Result> {
  const issues: string[] = [];
  const start = Date.now();
  let score = 1;
  let forbiddenClaim = false;
  let toolsOk = true;
  try {
    const { response, toolCalls } = await agent(tc.input.messages);
    const latencyMs = Date.now() - start; // measured here, not trusted from the agent
    for (const p of tc.expected.mustContain ?? []) {
      if (!has(response, p)) { issues.push(`Missing: "${p}"`); score -= 0.2; }
    }
    for (const p of tc.expected.mustNotContain ?? []) {
      if (has(response, p)) { issues.push(`Forbidden claim: "${p}"`); forbiddenClaim = true; score -= 0.3; }
    }
    for (const t of tc.expected.expectedTools ?? []) {
      if (!toolCalls.includes(t)) { issues.push(`Tool not called: ${t}`); toolsOk = false; score -= 0.2; }
    }
    if (tc.expected.maxLatencyMs && latencyMs > tc.expected.maxLatencyMs) {
      issues.push(`Latency ${latencyMs}ms > ${tc.expected.maxLatencyMs}ms`); score -= 0.1;
    }
    score = Math.max(0, score);
    return { caseId: tc.id, passed: score >= 0.7 && !forbiddenClaim, score, latencyMs, forbiddenClaim, toolsOk, issues };
  } catch (err) {
    return {
      caseId: tc.id, passed: false, score: 0, latencyMs: Date.now() - start,
      forbiddenClaim: false, toolsOk: false, issues: [`Error: ${(err as Error).message}`],
    };
  }
}

export async function runEvalSuite(suite: string, agent: AgentFn, agentVersion: string) {
  const { rows } = await pool.query<CaseRow>(
    "SELECT id, name, input, expected FROM eval_cases WHERE suite = $1 ORDER BY weight DESC, id", [suite]);
  if (rows.length === 0) throw new Error(`No eval cases for suite "${suite}"`);

  const results: Result[] = [];
  for (const tc of rows) results.push(await runCase(tc, agent)); // sequential: keeps latency numbers honest

  const withTools = rows.filter((r) => r.expected.expectedTools?.length);
  const toolHits = results.filter((r, i) => rows[i].expected.expectedTools?.length && r.toolsOk).length;
  const summary: Summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    avgScore: results.reduce((s, r) => s + r.score, 0) / results.length,
    forbiddenClaimRate: (results.filter((r) => r.forbiddenClaim).length / results.length) * 100,
    toolAccuracy: withTools.length ? (toolHits / withTools.length) * 100 : 100,
    p95LatencyMs: p95(results.map((r) => r.latencyMs)),
  };

  // Read the previous run before inserting this one
  const { rows: [prev] } = await pool.query<{ summary: Summary }>(
    "SELECT summary FROM eval_runs WHERE suite = $1 ORDER BY completed_at DESC LIMIT 1", [suite]);

  const id = `eval-${randomBytes(6).toString("hex")}`;
  await pool.query(
    "INSERT INTO eval_runs (id, suite, agent_version, summary, results) VALUES ($1, $2, $3, $4, $5)",
    [id, suite, agentVersion, JSON.stringify(summary), JSON.stringify(results)]);

  const regressed = !!prev && (
    summary.avgScore < prev.summary.avgScore - 0.05 ||
    summary.forbiddenClaimRate > prev.summary.forbiddenClaimRate + 2 ||
    summary.toolAccuracy < prev.summary.toolAccuracy - 5);
  if (regressed) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "eval_regression", suite, agentVersion, current: summary, previous: prev.summary }));
  }
  return { id, summary, results, regressed };
}

export async function versionHistory(suite: string, limit = 10) {
  const { rows } = await pool.query(
    "SELECT agent_version AS version, summary, completed_at AS date FROM eval_runs WHERE suite = $1 ORDER BY completed_at DESC LIMIT $2",
    [suite, limit]);
  return rows;
}
```

### Step 3: Trigger runs from CI

`agentUnderTest` is your own wrapper around the real agent. Bind the service to loopback or keep it on a private network, since a run spends model tokens.

```typescript
// src/server.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { runEvalSuite, versionHistory, type AgentFn } from "./eval";

const agentUnderTest: AgentFn = async (messages) => {
  // call your agent here and return its reply plus the names of the tools it invoked
  return { response: messages.at(-1)?.content ?? "", toolCalls: [] };
};

const app = new Hono();

app.post("/eval/run", async (c) => {
  const { suite, agentVersion } = z.object({ suite: z.string(), agentVersion: z.string() }).parse(await c.req.json());
  const run = await runEvalSuite(suite, agentUnderTest, agentVersion);
  return c.json({ id: run.id, regressed: run.regressed, summary: run.summary }, run.regressed ? 409 : 200);
});

app.get("/eval/:suite/history", async (c) => c.json(await versionHistory(c.req.param("suite"))));

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3300 });
```

In CI, call `POST /eval/run` after deploying a preview build and fail the job on the 409 response.

## Real-World Example

Rita's team seeds the `support` suite from real failures: one case per customer complaint, each with the order-lookup tool it should have called and the product features the agent must never promise. The next prompt change adds a feature claim that does not exist; the `mustNotContain` check fails that case, the run comes back 409 in CI, and the change never ships. Over the following weeks `/eval/support/history` shows the p95 latency and tool accuracy per version, so a slow or tool-skipping version is visible the day it is built rather than when a customer writes in.

## Related Skills

- `typescript` - typed cases, results and the agent contract
- `postgresql` - cases and run history
- `redis` - regression alert queue
- `hono` - the CI-facing service
- `zod` - request validation
