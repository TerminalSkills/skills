---
title: "Build Automated Testing for LLM Outputs"
description: "Build a systematic LLM evaluation framework with test suites, LLM-as-judge scoring, regression testing, A/B model comparison, and a cost/quality dashboard."
skills: [anthropic-sdk, openai-agents, prisma]
difficulty: advanced
time_estimate: "8 hours"
tags: [llm, evals, testing, regression, ai-engineering, quality]
---

# Build Automated Testing for LLM Outputs

**Persona:** You're an AI engineer shipping LLM-powered features. Every prompt change is a gamble. You need a systematic way to catch regressions, compare models, and ship with confidence.

## What You'll Build

- **Test suites**: Input/expected output pairs with scoring rubrics
- **Evaluators**: Exact match, semantic similarity, LLM-as-judge
- **Regression runner**: Run on every prompt or model change (CI integration)
- **A/B comparison**: Test two models/prompts on the same dataset
- **Dashboard**: Pass rate, latency, cost per model

---

## 1. Test Suite Schema

```prisma
model EvalSuite {
  id          String     @id @default(cuid())
  name        String
  description String?
  cases       EvalCase[]
  runs        EvalRun[]
  createdAt   DateTime   @default(now())
}

model EvalCase {
  id              String      @id @default(cuid())
  suiteId         String
  suite           EvalSuite   @relation(fields: [suiteId], references: [id])
  input           String      @db.Text
  expectedOutput  String?     @db.Text
  rubric          String?     @db.Text  // LLM judge instructions
  tags            String[]
  results         EvalResult[]
}

model EvalRun {
  id          String       @id @default(cuid())
  suiteId     String
  suite       EvalSuite    @relation(fields: [suiteId], references: [id])
  model       String
  prompt      String       @db.Text
  passRate    Float?
  avgLatencyMs Int?
  totalCostUsd Float?
  results     EvalResult[]
  createdAt   DateTime     @default(now())
}

model EvalResult {
  id           String    @id @default(cuid())
  runId        String
  run          EvalRun   @relation(fields: [runId], references: [id])
  caseId       String
  case         EvalCase  @relation(fields: [caseId], references: [id])
  actualOutput String    @db.Text
  score        Float     // 0-1
  passed       Boolean
  latencyMs    Int
  inputTokens  Int
  outputTokens Int
  evaluatorType String   // "exact" | "semantic" | "llm-judge"
}
```

---

## 2. Evaluator Implementations

```typescript
// lib/evaluators.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type EvaluatorType = "exact" | "contains" | "semantic" | "llm-judge";

export async function evaluate(
  actual: string,
  expected: string | undefined,
  rubric: string | undefined,
  type: EvaluatorType
): Promise<{ score: number; passed: boolean; reason?: string }> {
  switch (type) {
    case "exact":
      const exactMatch = actual.trim() === expected?.trim();
      return { score: exactMatch ? 1 : 0, passed: exactMatch };

    case "contains":
      const contains = actual.toLowerCase().includes(expected?.toLowerCase() ?? "");
      return { score: contains ? 1 : 0, passed: contains };

    case "semantic":
      // Simple word overlap for now; replace with embeddings (pgvector) for production
      const actualWords = new Set(actual.toLowerCase().split(/\W+/));
      const expectedWords = (expected ?? "").toLowerCase().split(/\W+/);
      const overlap = expectedWords.filter(w => actualWords.has(w)).length;
      const score = overlap / expectedWords.length;
      return { score, passed: score > 0.7 };

    case "llm-judge":
      const judgment = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 128,
        messages: [{
          role: "user",
          content: `You are an evaluator. Score the following response 0-10 and explain why.
          
Rubric: ${rubric}
Expected: ${expected ?? "(none)"}
Actual: ${actual}

Respond with JSON only: {"score": 0-10, "passed": true/false, "reason": "..."}`
        }]
      });
      const parsed = JSON.parse(judgment.content[0].text);
      return { score: parsed.score / 10, passed: parsed.passed, reason: parsed.reason };
  }
}
```

---

## 3. Eval Runner

```typescript
// lib/eval-runner.ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { evaluate } from "./evaluators";

const client = new Anthropic();

interface RunConfig {
  suiteId: string;
  model: string;
  systemPrompt: string;
  evaluatorType?: EvaluatorType;
  concurrency?: number;
}

export async function runEvalSuite(config: RunConfig) {
  const { suiteId, model, systemPrompt, evaluatorType = "llm-judge", concurrency = 3 } = config;
  
  const suite = await prisma.evalSuite.findUnique({
    where: { id: suiteId },
    include: { cases: true }
  });
  if (!suite) throw new Error("Suite not found");

  const run = await prisma.evalRun.create({
    data: { suiteId, model, prompt: systemPrompt }
  });

  const results = [];
  
  // Process in batches to respect rate limits
  for (let i = 0; i < suite.cases.length; i += concurrency) {
    const batch = suite.cases.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (evalCase) => {
      const start = Date.now();
      
      const response = await client.messages.create({
        model,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: evalCase.input }]
      });

      const latencyMs = Date.now() - start;
      const actualOutput = response.content[0].text;
      
      const evalResult = await evaluate(
        actualOutput,
        evalCase.expectedOutput ?? undefined,
        evalCase.rubric ?? undefined,
        evalResult.evaluatorType ?? evaluatorType
      );

      return await prisma.evalResult.create({
        data: {
          runId: run.id,
          caseId: evalCase.id,
          actualOutput,
          score: evalResult.score,
          passed: evalResult.passed,
          latencyMs,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          evaluatorType
        }
      });
    }));
    results.push(...batchResults);
  }

  // Compute aggregate stats
  const passRate = results.filter(r => r.passed).length / results.length;
  const avgLatencyMs = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);
  
  // Rough cost estimation (Claude Sonnet pricing)
  const totalCostUsd = (totalInputTokens / 1_000_000) * 3 + (totalOutputTokens / 1_000_000) * 15;

  await prisma.evalRun.update({
    where: { id: run.id },
    data: { passRate, avgLatencyMs: Math.round(avgLatencyMs), totalCostUsd }
  });

  return { runId: run.id, passRate, avgLatencyMs, totalCostUsd };
}
```

---

## 4. A/B Model Comparison

```typescript
// lib/compare-models.ts
import { runEvalSuite } from "./eval-runner";
import { prisma } from "@/lib/prisma";

export async function compareModels(
  suiteId: string,
  prompt: string,
  modelA: string,
  modelB: string
) {
  console.log(`Running eval for ${modelA}...`);
  const runA = await runEvalSuite({ suiteId, model: modelA, systemPrompt: prompt });
  
  console.log(`Running eval for ${modelB}...`);
  const runB = await runEvalSuite({ suiteId, model: modelB, systemPrompt: prompt });

  const winner = runA.passRate >= runB.passRate ? modelA : modelB;
  const improvement = Math.abs(runA.passRate - runB.passRate) * 100;

  return {
    modelA: { model: modelA, ...runA },
    modelB: { model: modelB, ...runB },
    winner,
    improvement: `${improvement.toFixed(1)}% better pass rate`,
    costDiff: `$${Math.abs(runA.totalCostUsd - runB.totalCostUsd).toFixed(4)} per suite run`
  };
}
```

---

## 5. CLI for CI Integration

```typescript
// scripts/run-evals.ts
#!/usr/bin/env tsx
import { runEvalSuite } from "../lib/eval-runner";

const suiteId = process.env.EVAL_SUITE_ID!;
const model = process.env.LLM_MODEL ?? "claude-opus-4-5";
const systemPrompt = process.env.SYSTEM_PROMPT ?? "";
const threshold = parseFloat(process.env.PASS_THRESHOLD ?? "0.85");

const result = await runEvalSuite({ suiteId, model, systemPrompt });

console.log(`Pass rate: ${(result.passRate * 100).toFixed(1)}%`);
console.log(`Avg latency: ${result.avgLatencyMs}ms`);
console.log(`Cost: $${result.totalCostUsd.toFixed(4)}`);

if (result.passRate < threshold) {
  console.error(`❌ Pass rate ${(result.passRate * 100).toFixed(1)}% is below threshold ${threshold * 100}%`);
  process.exit(1);
}

console.log("✅ Evals passed!");
```

Add to CI (GitHub Actions):
```yaml
- name: Run LLM Evals
  env:
    EVAL_SUITE_ID: ${{ vars.EVAL_SUITE_ID }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    PASS_THRESHOLD: "0.85"
  run: npx tsx scripts/run-evals.ts
```

---

## Result

You now have a production-grade LLM testing system:
- Catch prompt regressions before they reach users
- Compare models objectively on your actual use cases
- Track quality and cost trends over time
- Integrate into CI so broken prompts never ship
- LLM-as-judge gives nuanced scoring beyond simple string matching
