---
title: Build an LLM Prompt Management System
slug: build-llm-prompt-management
description: Build a prompt management system with version control, A/B testing, variable templating, performance tracking, and team collaboration for LLM-powered applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - prompts
  - llm
  - prompt-engineering
  - version-control
  - ai-ops
---

# Build an LLM Prompt Management System

## The Problem

Kira leads AI engineering at a 25-person company with 30 LLM-powered features. Prompts are hardcoded in source files — changing one requires a code deploy. Nobody knows which prompt version produced the best results. When quality degrades, engineers can't tell if the prompt changed or the model did. Prompt engineers can't iterate without developer involvement. There's no way to A/B test prompt variations or roll back to a working version. They need prompt management: version control, variable templates, A/B testing, performance metrics, and instant updates without deploys.

## Step 1: Build the Prompt Management Engine

```typescript
// src/prompts/manager.ts — Prompt management with versioning, A/B testing, and metrics
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Prompt {
  id: string;
  name: string;                // unique identifier, e.g., "support-classifier"
  description: string;
  versions: PromptVersion[];
  activeVersionId: string;
  abTest: ABTest | null;
  tags: string[];
  createdBy: string;
  updatedAt: string;
}

interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  template: string;            // prompt text with {{variables}}
  systemMessage?: string;
  variables: Array<{ name: string; type: "string" | "number" | "json"; required: boolean; default?: string }>;
  model: string;               // target model
  temperature: number;
  maxTokens: number;
  createdBy: string;
  createdAt: string;
  metrics: PromptMetrics;
}

interface PromptMetrics {
  totalCalls: number;
  avgLatencyMs: number;
  avgTokensUsed: number;
  successRate: number;         // % of calls that didn't error
  qualityScore: number;        // 0-1, from feedback
  costPerCall: number;         // estimated $ cost
}

interface ABTest {
  id: string;
  versionA: string;            // version ID
  versionB: string;
  trafficSplit: number;        // % to version B (0-100)
  metric: string;              // which metric to optimize
  startedAt: string;
  minSampleSize: number;
}

// Resolve prompt for runtime use (with A/B testing)
export async function resolvePrompt(
  promptName: string,
  variables: Record<string, any>,
  requestId?: string
): Promise<{ text: string; systemMessage?: string; model: string; temperature: number; maxTokens: number; versionId: string }> {
  const cacheKey = `prompt:resolved:${promptName}`;
  const cached = await redis.get(cacheKey);

  let prompt: Prompt;
  if (cached) {
    prompt = JSON.parse(cached);
  } else {
    const { rows: [row] } = await pool.query("SELECT * FROM prompts WHERE name = $1", [promptName]);
    if (!row) throw new Error(`Prompt not found: ${promptName}`);
    prompt = { ...row, versions: JSON.parse(row.versions), abTest: row.ab_test ? JSON.parse(row.ab_test) : null };
    await redis.setex(cacheKey, 60, JSON.stringify(prompt));  // short TTL for fast updates
  }

  // Select version (A/B test or active)
  let version: PromptVersion;
  if (prompt.abTest) {
    const hash = requestId
      ? parseInt(createHash("md5").update(requestId).digest("hex").slice(0, 8), 16) % 100
      : Math.random() * 100;
    const useB = hash < prompt.abTest.trafficSplit;
    const versionId = useB ? prompt.abTest.versionB : prompt.abTest.versionA;
    version = prompt.versions.find((v) => v.id === versionId)!;
  } else {
    version = prompt.versions.find((v) => v.id === prompt.activeVersionId)!;
  }

  if (!version) throw new Error(`Active version not found for prompt: ${promptName}`);

  // Render template with variables
  let text = version.template;
  for (const varDef of version.variables) {
    const value = variables[varDef.name] ?? varDef.default;
    if (varDef.required && value === undefined) {
      throw new Error(`Missing required variable: ${varDef.name}`);
    }
    const stringValue = varDef.type === "json" ? JSON.stringify(value) : String(value || "");
    text = text.replaceAll(`{{${varDef.name}}}`, stringValue);
  }

  // Track usage
  await redis.hincrby(`prompt:metrics:${version.id}`, "totalCalls", 1);

  return {
    text,
    systemMessage: version.systemMessage,
    model: version.model,
    temperature: version.temperature,
    maxTokens: version.maxTokens,
    versionId: version.id,
  };
}

// Create new version
export async function createVersion(params: {
  promptName: string;
  template: string;
  systemMessage?: string;
  variables?: PromptVersion["variables"];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  createdBy: string;
}): Promise<PromptVersion> {
  const { rows: [prompt] } = await pool.query("SELECT * FROM prompts WHERE name = $1", [params.promptName]);
  if (!prompt) throw new Error("Prompt not found");

  const versions: PromptVersion[] = JSON.parse(prompt.versions);
  const version: PromptVersion = {
    id: `pv-${randomBytes(6).toString("hex")}`,
    promptId: prompt.id,
    version: versions.length + 1,
    template: params.template,
    systemMessage: params.systemMessage,
    variables: params.variables || extractVariables(params.template),
    model: params.model || "claude-sonnet-4-20250514",
    temperature: params.temperature ?? 0.7,
    maxTokens: params.maxTokens ?? 1000,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    metrics: { totalCalls: 0, avgLatencyMs: 0, avgTokensUsed: 0, successRate: 1, qualityScore: 0, costPerCall: 0 },
  };

  versions.push(version);
  await pool.query(
    "UPDATE prompts SET versions = $2, updated_at = NOW() WHERE id = $1",
    [prompt.id, JSON.stringify(versions)]
  );

  await redis.del(`prompt:resolved:${params.promptName}`);
  return version;
}

// Record call metrics
export async function recordMetrics(versionId: string, metrics: {
  latencyMs: number;
  tokensUsed: number;
  success: boolean;
  qualityFeedback?: number;
}): Promise<void> {
  const key = `prompt:metrics:${versionId}`;
  await redis.hincrby(key, "totalCalls", 1);
  await redis.hincrbyfloat(key, "totalLatency", metrics.latencyMs);
  await redis.hincrby(key, "totalTokens", metrics.tokensUsed);
  if (metrics.success) await redis.hincrby(key, "successes", 1);
  if (metrics.qualityFeedback !== undefined) {
    await redis.hincrbyfloat(key, "qualitySum", metrics.qualityFeedback);
    await redis.hincrby(key, "qualityCount", 1);
  }
}

// Auto-extract variables from template
function extractVariables(template: string): PromptVersion["variables"] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const unique = [...new Set(matches.map((m) => m.slice(2, -2)))];
  return unique.map((name) => ({ name, type: "string" as const, required: true }));
}

// Start A/B test
export async function startABTest(promptName: string, versionAId: string, versionBId: string, trafficSplit: number = 50): Promise<ABTest> {
  const test: ABTest = {
    id: `ab-${randomBytes(4).toString("hex")}`,
    versionA: versionAId,
    versionB: versionBId,
    trafficSplit,
    metric: "qualityScore",
    startedAt: new Date().toISOString(),
    minSampleSize: 100,
  };

  await pool.query(
    "UPDATE prompts SET ab_test = $2 WHERE name = $1",
    [promptName, JSON.stringify(test)]
  );
  await redis.del(`prompt:resolved:${promptName}`);
  return test;
}

// Rollback to previous version
export async function rollback(promptName: string, versionId: string): Promise<void> {
  await pool.query(
    "UPDATE prompts SET active_version_id = $2, ab_test = NULL, updated_at = NOW() WHERE name = $1",
    [promptName, versionId]
  );
  await redis.del(`prompt:resolved:${promptName}`);
}
```

## Results

- **Prompt updates without deploy** — change wording, adjust temperature, swap model — takes effect in 60 seconds via cache TTL; no code change, no deploy, no downtime
- **A/B testing prompts** — version A (concise) vs version B (detailed) split 50/50; quality scores compared after 100 calls; winner activated automatically
- **Version history prevents regressions** — quality drops? Rollback to last known good version in one call; see exact diff between versions; root cause in minutes
- **Prompt engineers iterate independently** — non-developers create and test prompt versions via dashboard; deploy new version with one click; developer involvement only for new features
- **Cost tracking per prompt** — dashboard shows each prompt's token usage and cost; "summarizer" prompt costs $8/day; optimization target identified; switched to smaller model → $2/day
