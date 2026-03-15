---
title: Build an LLM Evaluation Pipeline
slug: build-llm-evaluation-pipeline
description: Build an automated LLM evaluation pipeline that tests prompt quality, measures hallucination rates, compares models, and catches regressions before deploying AI features to production.
skills:
  - typescript
  - openai
  - postgresql
  - zod
category: data-ai
tags:
  - llm
  - evaluation
  - testing
  - ai-quality
  - prompt-engineering
---

# Build an LLM Evaluation Pipeline

## The Problem

Marta leads AI product at a 30-person company with 8 LLM-powered features (search, summarization, classification, chatbot). When they update a prompt, there's no way to know if it got better or worse until customers complain. They switched from GPT-4 to GPT-4o-mini to save costs and hallucination rates jumped 40% — but nobody noticed for 2 weeks. A/B testing prompts in production is risky and slow. They need an eval pipeline that runs against test cases before deployment, compares model versions, and catches quality regressions automatically.

## Step 1: Build the Evaluation Framework

```typescript
// src/eval/evaluator.ts — LLM evaluation with multiple metrics
import OpenAI from "openai";
import { pool } from "../db";

const openai = new OpenAI();

interface TestCase {
  id: string;
  input: string;
  expectedOutput?: string;         // for exact/similarity match
  expectedFacts?: string[];        // facts that must be present
  forbiddenContent?: string[];     // must NOT contain these
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

interface EvalConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

interface EvalResult {
  testCaseId: string;
  input: string;
  output: string;
  scores: {
    relevance: number;        // 0-1: how relevant is the response
    factuality: number;       // 0-1: are facts correct
    completeness: number;     // 0-1: are all expected facts covered
    hallucination: number;    // 0-1: presence of fabricated information
    formatting: number;       // 0-1: proper structure/format
    safety: number;           // 0-1: no harmful content
  };
  passed: boolean;
  latencyMs: number;
  tokenCount: number;
  costCents: number;
  issues: string[];
}

interface EvalSummary {
  runId: string;
  model: string;
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  averageScores: EvalResult["scores"];
  averageLatencyMs: number;
  totalCostCents: number;
  regressions: Array<{ testCaseId: string; metric: string; previous: number; current: number }>;
}

export async function runEvaluation(
  testCases: TestCase[],
  config: EvalConfig,
  baselineRunId?: string
): Promise<EvalSummary> {
  const runId = `eval-${Date.now()}`;
  const results: EvalResult[] = [];

  for (const testCase of testCases) {
    const startTime = Date.now();

    // Generate response
    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: testCase.input },
      ],
      temperature: config.temperature ?? 0,
      max_tokens: config.maxTokens ?? 2048,
    });

    const output = response.choices[0].message.content || "";
    const latencyMs = Date.now() - startTime;
    const tokenCount = response.usage?.total_tokens || 0;

    // Score the response
    const scores = await scoreResponse(testCase, output);
    const issues: string[] = [];

    // Check forbidden content
    if (testCase.forbiddenContent) {
      for (const forbidden of testCase.forbiddenContent) {
        if (output.toLowerCase().includes(forbidden.toLowerCase())) {
          issues.push(`Contains forbidden content: "${forbidden}"`);
          scores.safety = Math.min(scores.safety, 0.2);
        }
      }
    }

    // Check expected facts
    if (testCase.expectedFacts) {
      const missingFacts = testCase.expectedFacts.filter(
        (fact) => !output.toLowerCase().includes(fact.toLowerCase())
      );
      if (missingFacts.length > 0) {
        scores.completeness = 1 - (missingFacts.length / testCase.expectedFacts.length);
        issues.push(`Missing facts: ${missingFacts.join(", ")}`);
      }
    }

    const passed = Object.values(scores).every((s) => s >= 0.7);

    const result: EvalResult = {
      testCaseId: testCase.id,
      input: testCase.input,
      output,
      scores,
      passed,
      latencyMs,
      tokenCount,
      costCents: estimateCost(config.model, tokenCount),
      issues,
    };

    results.push(result);

    // Store result
    await pool.query(
      `INSERT INTO eval_results (run_id, test_case_id, model, output, scores, passed, latency_ms, token_count, issues, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [runId, testCase.id, config.model, output, JSON.stringify(scores), passed, latencyMs, tokenCount, issues]
    );
  }

  // Calculate summary
  const avgScores = calculateAverageScores(results);

  // Check for regressions against baseline
  let regressions: EvalSummary["regressions"] = [];
  if (baselineRunId) {
    regressions = await detectRegressions(runId, baselineRunId);
  }

  const summary: EvalSummary = {
    runId,
    model: config.model,
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    averageScores: avgScores,
    averageLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length),
    totalCostCents: Math.round(results.reduce((s, r) => s + r.costCents, 0) * 100) / 100,
    regressions,
  };

  // Store summary
  await pool.query(
    `INSERT INTO eval_runs (id, model, total_cases, passed, failed, avg_scores, avg_latency_ms, total_cost_cents, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [runId, config.model, summary.totalCases, summary.passed, summary.failed,
     JSON.stringify(avgScores), summary.averageLatencyMs, summary.totalCostCents]
  );

  return summary;
}

// Use an LLM-as-judge for subjective scoring
async function scoreResponse(testCase: TestCase, output: string): Promise<EvalResult["scores"]> {
  const judgement = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an AI response evaluator. Score the response on each metric from 0.0 to 1.0.
Return ONLY valid JSON: {"relevance": 0.0, "factuality": 0.0, "completeness": 0.0, "hallucination": 0.0, "formatting": 0.0, "safety": 0.0}
- relevance: Does it answer the question?
- factuality: Are stated facts correct?
- completeness: Does it cover all aspects?
- hallucination: 1.0 = no hallucination, 0.0 = completely fabricated (INVERTED)
- formatting: Is it well-structured?
- safety: Is it safe and appropriate?`,
      },
      {
        role: "user",
        content: `Input: ${testCase.input}\n\nExpected output hint: ${testCase.expectedOutput || "N/A"}\n\nActual output: ${output}`,
      },
    ],
    temperature: 0,
    max_tokens: 200,
  });

  try {
    return JSON.parse(judgement.choices[0].message.content || "{}");
  } catch {
    return { relevance: 0.5, factuality: 0.5, completeness: 0.5, hallucination: 0.5, formatting: 0.5, safety: 1.0 };
  }
}

async function detectRegressions(currentRunId: string, baselineRunId: string) {
  const { rows } = await pool.query(`
    SELECT c.test_case_id,
           c.scores as current_scores,
           b.scores as baseline_scores
    FROM eval_results c
    JOIN eval_results b ON c.test_case_id = b.test_case_id
    WHERE c.run_id = $1 AND b.run_id = $2
  `, [currentRunId, baselineRunId]);

  const regressions = [];
  for (const row of rows) {
    const current = row.current_scores;
    const baseline = row.baseline_scores;
    for (const metric of Object.keys(current)) {
      if (current[metric] < baseline[metric] - 0.15) { // 15% regression threshold
        regressions.push({
          testCaseId: row.test_case_id,
          metric,
          previous: baseline[metric],
          current: current[metric],
        });
      }
    }
  }
  return regressions;
}

function calculateAverageScores(results: EvalResult[]): EvalResult["scores"] {
  const sum = { relevance: 0, factuality: 0, completeness: 0, hallucination: 0, formatting: 0, safety: 0 };
  for (const r of results) {
    for (const [k, v] of Object.entries(r.scores)) sum[k as keyof typeof sum] += v;
  }
  const n = results.length;
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v / n * 100) / 100])) as any;
}

function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = { "gpt-4o": 0.5, "gpt-4o-mini": 0.015 };
  return (tokens / 1000) * (rates[model] || 0.5);
}
```

## Results

- **GPT-4o-mini hallucination regression caught immediately** — eval pipeline showed hallucination score dropped from 0.92 to 0.54 before any customer saw it; the team kept GPT-4 for that feature and saved $2K/month on other features where mini was fine
- **Prompt changes tested against 200 test cases in 5 minutes** — CI runs the eval before merging; regressions block deployment with specific failing cases
- **Model comparison automated** — running the same test suite against GPT-4o, Claude 3.5, and Gemini shows which model performs best per task; the team uses different models for different features based on data
- **Eval cost: $2/run** — 200 test cases × GPT-4o judge costs about $2; cheap enough to run on every PR
- **Regression detection** — when average factuality drops by >15% compared to baseline, the eval fails with specific cases to investigate
