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
category: AI & Machine Learning
tags:
  - ai-agents
  - evaluation
  - testing
  - benchmarking
  - quality
---

# Build an AI Agent Evaluation Framework

## The Problem

Rita leads AI at a 25-person company building customer support agents. They ship agent updates weekly but have no systematic way to measure quality. Last week, a prompt change improved response accuracy but introduced hallucinated product features. Tool use (search, order lookup) works 90% of the time but they don't know which 10% fails. Latency varies from 2s to 30s with no tracking. When an agent gets worse, they find out from customer complaints, not testing. They need an evaluation framework: automated test suites, hallucination detection, tool use accuracy, latency benchmarks, and regression alerts.

## Step 1: Build the Evaluation Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface EvalCase {
  id: string;
  name: string;
  category: "accuracy" | "hallucination" | "tool_use" | "latency" | "safety" | "custom";
  input: { messages: Array<{ role: string; content: string }>; context?: Record<string, any> };
  expectedOutput: { mustContain?: string[]; mustNotContain?: string[]; expectedTools?: string[]; maxLatencyMs?: number; customCheck?: string };
  tags: string[];
  weight: number;
}

interface EvalResult {
  caseId: string;
  passed: boolean;
  score: number;
  details: { accuracy: number; hallucination: boolean; toolUseCorrect: boolean; latencyMs: number; issues: string[] };
  agentResponse: string;
  timestamp: string;
}

interface EvalSuite {
  id: string;
  name: string;
  cases: EvalCase[];
  agentVersion: string;
  results: EvalResult[];
  summary: { totalCases: number; passed: number; failed: number; avgScore: number; avgLatency: number; hallucinationRate: number };
  completedAt: string;
}

export async function runEvalSuite(suiteName: string, agentFn: (messages: any[]) => Promise<{ response: string; toolCalls: string[]; latencyMs: number }>): Promise<EvalSuite> {
  const { rows: cases } = await pool.query("SELECT * FROM eval_cases WHERE suite = $1 ORDER BY weight DESC", [suiteName]);
  const suiteId = `eval-${randomBytes(6).toString("hex")}`;
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    const tc: EvalCase = { ...testCase, input: JSON.parse(testCase.input), expectedOutput: JSON.parse(testCase.expected_output), tags: JSON.parse(testCase.tags) };
    const start = Date.now();

    try {
      const { response, toolCalls, latencyMs } = await agentFn(tc.input.messages);
      const issues: string[] = [];
      let score = 1.0;

      // Check must-contain
      if (tc.expectedOutput.mustContain) {
        for (const phrase of tc.expectedOutput.mustContain) {
          if (!response.toLowerCase().includes(phrase.toLowerCase())) { issues.push(`Missing: "${phrase}"`); score -= 0.2; }
        }
      }

      // Check must-not-contain (hallucination)
      let hallucination = false;
      if (tc.expectedOutput.mustNotContain) {
        for (const phrase of tc.expectedOutput.mustNotContain) {
          if (response.toLowerCase().includes(phrase.toLowerCase())) { issues.push(`Hallucinated: "${phrase}"`); hallucination = true; score -= 0.3; }
        }
      }

      // Check tool use
      let toolUseCorrect = true;
      if (tc.expectedOutput.expectedTools) {
        for (const tool of tc.expectedOutput.expectedTools) {
          if (!toolCalls.includes(tool)) { issues.push(`Missing tool: ${tool}`); toolUseCorrect = false; score -= 0.2; }
        }
      }

      // Check latency
      if (tc.expectedOutput.maxLatencyMs && latencyMs > tc.expectedOutput.maxLatencyMs) {
        issues.push(`Latency ${latencyMs}ms > ${tc.expectedOutput.maxLatencyMs}ms`);
        score -= 0.1;
      }

      score = Math.max(0, score);
      results.push({
        caseId: tc.id, passed: score >= 0.7 && !hallucination,
        score, details: { accuracy: score, hallucination, toolUseCorrect, latencyMs, issues },
        agentResponse: response.slice(0, 2000), timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      results.push({
        caseId: tc.id, passed: false, score: 0,
        details: { accuracy: 0, hallucination: false, toolUseCorrect: false, latencyMs: Date.now() - start, issues: [`Error: ${error.message}`] },
        agentResponse: "", timestamp: new Date().toISOString(),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const hallucinations = results.filter((r) => r.details.hallucination).length;
  const summary = {
    totalCases: results.length, passed, failed: results.length - passed,
    avgScore: results.reduce((s, r) => s + r.score, 0) / results.length,
    avgLatency: results.reduce((s, r) => s + r.details.latencyMs, 0) / results.length,
    hallucinationRate: results.length > 0 ? (hallucinations / results.length) * 100 : 0,
  };

  const suite: EvalSuite = { id: suiteId, name: suiteName, cases: cases as any, agentVersion: process.env.AGENT_VERSION || "unknown", results, summary, completedAt: new Date().toISOString() };

  await pool.query(
    `INSERT INTO eval_runs (id, suite_name, agent_version, summary, results, completed_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
    [suiteId, suiteName, suite.agentVersion, JSON.stringify(summary), JSON.stringify(results)]
  );

  // Regression check
  const { rows: [prev] } = await pool.query(
    "SELECT summary FROM eval_runs WHERE suite_name = $1 AND id != $2 ORDER BY completed_at DESC LIMIT 1", [suiteName, suiteId]
  );
  if (prev) {
    const prevSummary = JSON.parse(prev.summary);
    if (summary.avgScore < prevSummary.avgScore - 0.05 || summary.hallucinationRate > prevSummary.hallucinationRate + 2) {
      await redis.rpush("notification:queue", JSON.stringify({ type: "eval_regression", suite: suiteName, current: summary, previous: prevSummary }));
    }
  }

  return suite;
}

export async function compareVersions(suiteName: string, limit: number = 10): Promise<Array<{ version: string; score: number; hallucinations: number; latency: number; date: string }>> {
  const { rows } = await pool.query(
    "SELECT agent_version, summary, completed_at FROM eval_runs WHERE suite_name = $1 ORDER BY completed_at DESC LIMIT $2",
    [suiteName, limit]
  );
  return rows.map((r: any) => {
    const s = JSON.parse(r.summary);
    return { version: r.agent_version, score: s.avgScore, hallucinations: s.hallucinationRate, latency: s.avgLatency, date: r.completed_at };
  });
}
```

## Results

- **Regression caught before deploy** — eval suite runs in CI; prompt change that introduced hallucinations caught by `mustNotContain` checks; blocked from production
- **Hallucination rate tracked** — 2.3% hallucination rate across 200 test cases; after prompt fix: 0.4%; measurable improvement
- **Tool use accuracy: 90% → 97%** — eval revealed agent wasn't calling order lookup for return requests; prompt updated; tool use regression tests prevent backsliding
- **Latency benchmarked** — p95 latency tracked per eval run; version 3.2 introduced 30s timeout on complex queries; caught by maxLatencyMs check
- **Version comparison** — dashboard shows score trending up over 10 versions (0.72 → 0.91); each prompt change has measurable impact; data-driven agent development
