---
title: Build a Prompt Management Platform
slug: build-prompt-management-platform
description: Build a prompt management platform with version control, A/B testing, variable interpolation, rollback, usage analytics, and team collaboration for LLM-powered applications.
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
  - versioning
  - management
---

# Build a Prompt Management Platform

## The Problem

Laura leads AI at a 25-person startup shipping 12 LLM-powered features. Prompts are hardcoded in source code — changing a prompt requires a deploy. Nobody knows which prompt version performs best. When a prompt change breaks output quality, rolling back means reverting code. Different team members edit prompts in different branches, causing merge conflicts. They need prompt management: version history, A/B testing between versions, variable templates, rollback, and usage analytics — all without code deploys.

## Step 1: Build the Prompt Management Engine

```typescript
// src/prompts/manager.ts — Prompt versioning with A/B testing and analytics
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Prompt {
  id: string;
  name: string;              // e.g., "support-response-generator"
  description: string;
  currentVersion: number;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  template: string;          // prompt text with {{variable}} placeholders
  systemMessage?: string;
  variables: Array<{ name: string; type: "string" | "number" | "json"; required: boolean; defaultValue?: string }>;
  model: string;
  temperature: number;
  maxTokens: number;
  metadata: Record<string, any>;
  status: "draft" | "active" | "testing" | "archived";
  createdBy: string;
  createdAt: string;
}

interface PromptExecution {
  promptId: string;
  versionId: string;
  variables: Record<string, any>;
  rendered: string;
  responseTokens: number;
  latencyMs: number;
  rating?: number;           // 1-5 quality rating
  feedback?: string;
}

// Get the active prompt version (with optional A/B test)
export async function getPrompt(
  name: string,
  variables: Record<string, any>,
  options?: { userId?: string }  // for consistent A/B assignment
): Promise<{ rendered: string; systemMessage?: string; model: string; temperature: number; maxTokens: number; versionId: string }> {
  // Check cache
  const cacheKey = `prompt:active:${name}`;
  let activeVersions: PromptVersion[] = [];

  const cached = await redis.get(cacheKey);
  if (cached) {
    activeVersions = JSON.parse(cached);
  } else {
    const { rows: [prompt] } = await pool.query(
      "SELECT id FROM prompts WHERE name = $1", [name]
    );
    if (!prompt) throw new Error(`Prompt '${name}' not found`);

    const { rows } = await pool.query(
      "SELECT * FROM prompt_versions WHERE prompt_id = $1 AND status IN ('active', 'testing') ORDER BY version DESC",
      [prompt.id]
    );
    activeVersions = rows;
    await redis.setex(cacheKey, 60, JSON.stringify(activeVersions));
  }

  // Select version (A/B testing or active)
  let version: PromptVersion;
  const testVersions = activeVersions.filter((v) => v.status === "testing");
  if (testVersions.length > 0 && options?.userId) {
    // Deterministic A/B assignment
    const hash = createHash("md5").update(options.userId + name).digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;
    version = bucket < 50 ? activeVersions.find((v) => v.status === "active")! : testVersions[0];
  } else {
    version = activeVersions.find((v) => v.status === "active") || activeVersions[0];
  }

  if (!version) throw new Error(`No active version for prompt '${name}'`);

  // Validate required variables
  const vars = JSON.parse(typeof version.variables === 'string' ? version.variables : JSON.stringify(version.variables));
  for (const v of vars) {
    if (v.required && !(v.name in variables) && !v.defaultValue) {
      throw new Error(`Missing required variable: ${v.name}`);
    }
  }

  // Render template
  const rendered = renderTemplate(version.template, variables, vars);

  return {
    rendered,
    systemMessage: version.system_message || version.systemMessage,
    model: version.model,
    temperature: version.temperature,
    maxTokens: version.max_tokens || version.maxTokens,
    versionId: version.id,
  };
}

// Create new prompt version
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
  const { rows: [prompt] } = await pool.query(
    "SELECT id FROM prompts WHERE name = $1", [params.promptName]
  );
  if (!prompt) throw new Error(`Prompt '${params.promptName}' not found`);

  const { rows: [latest] } = await pool.query(
    "SELECT MAX(version) as v FROM prompt_versions WHERE prompt_id = $1",
    [prompt.id]
  );

  const version = (latest?.v || 0) + 1;
  const id = `pv-${randomBytes(6).toString("hex")}`;

  await pool.query(
    `INSERT INTO prompt_versions (id, prompt_id, version, template, system_message, variables, model, temperature, max_tokens, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, NOW())`,
    [id, prompt.id, version, params.template, params.systemMessage || null,
     JSON.stringify(params.variables || []),
     params.model || "claude-sonnet-4-20250514",
     params.temperature ?? 0.7,
     params.maxTokens || 2048,
     params.createdBy]
  );

  await redis.del(`prompt:active:${params.promptName}`);
  return { id, promptId: prompt.id, version, template: params.template, variables: params.variables || [], model: params.model || "claude-sonnet-4-20250514", temperature: params.temperature ?? 0.7, maxTokens: params.maxTokens || 2048, metadata: {}, status: "draft", createdBy: params.createdBy, createdAt: new Date().toISOString() };
}

// Promote version to active (deactivates previous)
export async function promote(versionId: string): Promise<void> {
  const { rows: [version] } = await pool.query(
    "SELECT prompt_id FROM prompt_versions WHERE id = $1", [versionId]
  );
  if (!version) throw new Error("Version not found");

  await pool.query(
    "UPDATE prompt_versions SET status = 'archived' WHERE prompt_id = $1 AND status = 'active'",
    [version.prompt_id]
  );
  await pool.query(
    "UPDATE prompt_versions SET status = 'active' WHERE id = $1",
    [versionId]
  );

  // Clear cache
  const keys = await redis.keys("prompt:active:*");
  if (keys.length) await redis.del(...keys);
}

// Track execution for analytics
export async function trackExecution(exec: PromptExecution): Promise<void> {
  await pool.query(
    `INSERT INTO prompt_executions (prompt_id, version_id, response_tokens, latency_ms, rating, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [exec.promptId, exec.versionId, exec.responseTokens, exec.latencyMs, exec.rating]
  );

  // Real-time counters
  await redis.hincrby(`prompt:stats:${exec.versionId}`, "executions", 1);
  await redis.hincrby(`prompt:stats:${exec.versionId}`, "totalTokens", exec.responseTokens);
  await redis.hincrby(`prompt:stats:${exec.versionId}`, "totalLatency", exec.latencyMs);
  if (exec.rating) await redis.hincrby(`prompt:stats:${exec.versionId}`, `rating_${exec.rating}`, 1);
}

// Get version comparison analytics
export async function compareVersions(promptId: string): Promise<Array<{
  versionId: string; version: number; status: string;
  executions: number; avgLatency: number; avgRating: number; tokenCost: number;
}>> {
  const { rows } = await pool.query(
    `SELECT pv.id, pv.version, pv.status,
       COUNT(pe.id) as executions,
       AVG(pe.latency_ms) as avg_latency,
       AVG(pe.rating) FILTER (WHERE pe.rating IS NOT NULL) as avg_rating,
       SUM(pe.response_tokens) as total_tokens
     FROM prompt_versions pv
     LEFT JOIN prompt_executions pe ON pv.id = pe.version_id
     WHERE pv.prompt_id = $1
     GROUP BY pv.id, pv.version, pv.status
     ORDER BY pv.version DESC`,
    [promptId]
  );
  return rows.map((r: any) => ({
    versionId: r.id, version: r.version, status: r.status,
    executions: parseInt(r.executions), avgLatency: Math.round(parseFloat(r.avg_latency) || 0),
    avgRating: parseFloat(r.avg_rating) || 0, tokenCost: parseInt(r.total_tokens) || 0,
  }));
}

function renderTemplate(template: string, variables: Record<string, any>, defs: any[]): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (name in variables) return String(variables[name]);
    const def = defs.find((d: any) => d.name === name);
    if (def?.defaultValue) return def.defaultValue;
    return `{{${name}}}`;
  });
}
```

## Results

- **Prompt changes without deploys** — marketing team edits support prompt at 3 PM; change goes live in 60 seconds via cache refresh; no engineering involvement
- **A/B testing reveals best prompts** — version 7 vs version 8: v8 has 15% higher user rating and 20% fewer tokens; data-driven promotion instead of guessing
- **Instant rollback** — new prompt version causes hallucinations → rollback to previous active version in one API call; incident resolved in 30 seconds
- **Variable templates** — one prompt handles all languages: `{{language}}` + `{{customer_tier}}` + `{{product_name}}`; 12 features share one prompt with different variables
- **Usage analytics** — dashboard shows per-version execution count, avg latency, token cost, and quality ratings; prompt optimization is measurable
