---
title: Add AI Quality Gates to Your CI Pipeline
slug: add-ai-quality-gates-to-ci-pipeline
description: Set up automated evaluations that test your AI agent on every PR — catch prompt regressions, compare models, and fail builds when quality drops below threshold.
skills:
  - ai-eval-ci
  - github-actions
  - prompt-tester
category: development
tags:
  - eval
  - ci-cd
  - quality
  - llm
  - testing
  - regression
---

## The Problem

Kai maintains an AI-powered code review bot that comments on pull requests. Last week, someone updated the system prompt to be "more concise" — and the bot started approving PRs with obvious bugs. Nobody noticed for three days because there's no automated way to test prompt changes before they hit production. The team has unit tests for every function, integration tests for every API endpoint, and zero tests for the AI that reviews their code.

Every time someone tweaks a prompt, changes the model, or updates the RAG pipeline, the team holds its breath and checks a few examples manually. Manual spot-checking works until it doesn't — and when it doesn't, the failure is invisible until a customer reports it.

Kai needs prompt changes to go through the same CI pipeline as code changes: automated tests that run on every PR, compare against a baseline, and block the merge if quality drops.

## The Solution

Use ai-eval-ci to build an evaluation suite that runs in GitHub Actions on every PR that touches prompts or agent code. Use github-actions for the workflow. Use prompt-tester for designing the test cases and scoring rubrics.

## Step-by-Step Walkthrough

### Step 1: Define the Eval Dataset

The eval dataset is your ground truth — real inputs with known-good behavior descriptions. Not expected exact outputs (LLMs are non-deterministic), but rubrics that describe what a good response looks like.

```typescript
// eval/dataset.ts — Test cases for the code review agent
export interface EvalCase {
  id: string;
  name: string;
  input: {
    diff: string;
    context: string;
  };
  rubrics: Array<{
    name: string;
    criteria: string;
    threshold: number;  // 0-1 minimum score
  }>;
}

export const dataset: EvalCase[] = [
  {
    id: "obvious-bug",
    name: "Catches null pointer dereference",
    input: {
      diff: `
+  const user = await db.user.findFirst({ where: { id } });
+  const name = user.name; // No null check
+  return { greeting: \`Hello \${name}\` };`,
      context: "PR adding a greeting endpoint to a user API",
    },
    rubrics: [
      {
        name: "identifies-bug",
        criteria: "The review identifies that `user` could be null and accessing `.name` will throw",
        threshold: 0.8,
      },
      {
        name: "suggests-fix",
        criteria: "The review suggests adding a null check or using optional chaining",
        threshold: 0.7,
      },
    ],
  },
  {
    id: "clean-code",
    name: "Approves clean code without false positives",
    input: {
      diff: `
+  const user = await db.user.findFirstOrThrow({ where: { id } });
+  return { greeting: \`Hello \${user.name}\` };`,
      context: "PR adding a greeting endpoint — uses findFirstOrThrow which throws if null",
    },
    rubrics: [
      {
        name: "no-false-positive",
        criteria: "The review does NOT flag a null safety issue because findFirstOrThrow handles it",
        threshold: 0.8,
      },
      {
        name: "approves-or-minor",
        criteria: "The review approves the code or gives only minor style suggestions",
        threshold: 0.7,
      },
    ],
  },
  {
    id: "security-issue",
    name: "Flags SQL injection risk",
    input: {
      diff: `
+  const results = await db.$queryRaw\`
+    SELECT * FROM users WHERE name = '\${name}'
+  \`;`,
      context: "PR adding a search feature to the admin panel",
    },
    rubrics: [
      {
        name: "flags-sqli",
        criteria: "The review identifies SQL injection risk from string interpolation in raw query",
        threshold: 0.9,
      },
      {
        name: "severity-high",
        criteria: "The review marks this as a high-severity or blocking issue, not just a suggestion",
        threshold: 0.8,
      },
    ],
  },
];
```

### Step 2: Build the Eval Runner

```typescript
// eval/run.ts — Run evals and output CI-compatible results
// Runs the agent on each case, scores with an LLM judge, exits 1 below threshold.
import OpenAI from "openai";
import { dataset } from "./dataset.js";
import { writeFileSync } from "node:fs";

const openai = new OpenAI();   // reads OPENAI_API_KEY from the environment
// Pin the judge model. OpenAI deprecated gpt-4o-mini (shutdown 2027-01-14) and
// recommends gpt-6-luna; check https://developers.openai.com/api/docs/deprecations
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "gpt-6-luna";

import { reviewPR } from "../src/agent.js";

interface EvalResult {
  id: string;
  name: string;
  rubricResults: Array<{
    rubric: string;
    score: number;
    pass: boolean;
    reasoning: string;
  }>;
  latencyMs: number;
  pass: boolean;
}

async function judge(
  output: string,
  rubricCriteria: string
): Promise<{ score: number; reasoning: string }> {
  const response = await openai.chat.completions.create({
    model: JUDGE_MODEL,       // Small, cheap judge model
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an eval judge. Score the AI output against the rubric.
Return JSON: {"score": 0.0-1.0, "reasoning": "brief explanation"}
1.0 = perfectly meets criteria. 0.0 = completely fails.`,
      },
      {
        role: "user",
        content: `Rubric: ${rubricCriteria}\n\nAI Output:\n${output}`,
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content!);
}

async function runEvals(): Promise<void> {
  const results: EvalResult[] = [];
  let totalPassed = 0, totalFailed = 0;

  for (const testCase of dataset) {
    const start = Date.now();

    const output = await reviewPR(testCase.input.diff, testCase.input.context);
    const latencyMs = Date.now() - start;

    const rubricResults = [];
    let allPass = true;

    for (const rubric of testCase.rubrics) {
      const { score, reasoning } = await judge(output, rubric.criteria);
      const pass = score >= rubric.threshold;
      if (!pass) allPass = false;

      rubricResults.push({
        rubric: rubric.name,
        score,
        pass,
        reasoning,
      });
    }

    if (allPass) totalPassed++; else totalFailed++;

    console.log(`${allPass ? "PASS" : "FAIL"} ${testCase.name} (${latencyMs}ms)`);
    for (const r of rubricResults) {
      console.log(`  ${r.pass ? "ok  " : "FAIL"} ${r.rubric}: ${r.score.toFixed(2)}${r.pass ? "" : ` - ${r.reasoning}`}`);
    }

    results.push({ id: testCase.id, name: testCase.name, rubricResults, latencyMs, pass: allPass });
  }

  writeFileSync("eval/results.json", JSON.stringify(results, null, 2));

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed > 0) {
    console.log("Eval suite FAILED");
    process.exit(1);
  }

  console.log("Eval suite PASSED");
}

runEvals().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Setup: `npm install openai && npm install -D tsx typescript`, `"type": "module"` in `package.json`, run with `npx tsx eval/run.ts`.

### Step 3: Wire Into GitHub Actions

Secrets are not passed to workflows triggered by pull requests from forks, so the gate works for branches in the same repository. The comment step needs `pull-requests: write`, and the eval step must not be skipped by the path filter on the branch-protection check (a required check that never runs stays pending), so keep the paths broad.

```yaml
# .github/workflows/ai-eval.yml — Run evals on prompt/agent changes
name: AI Eval
on:
  pull_request:
    paths:
      - "src/agent.ts"
      - "src/prompts/**"
      - "eval/**"

permissions:
  contents: read
  pull-requests: write

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - name: Run AI evaluation suite
        run: npx tsx eval/run.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Post results to PR
        if: ${{ !cancelled() && hashFiles('eval/results.json') != '' }}
        uses: actions/github-script@v9
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('eval/results.json', 'utf8'));
            const lines = results.map(r =>
              `${r.pass ? 'PASS' : 'FAIL'} **${r.name}** (${r.latencyMs}ms)\n` +
              r.rubricResults.map(rb => `  ${rb.pass ? 'ok' : 'FAIL'} ${rb.rubric}: ${rb.score.toFixed(2)}`).join('\n'));
            const passed = results.filter(r => r.pass).length;
            const body = `## AI Eval Results\n\n**${passed}/${results.length} passed**\n\n${lines.join('\n\n')}`;
            await github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body
            });
```

## The Outcome

Kai's team now tests the AI code reviewer the way they test code. Every PR that touches the prompt or agent code runs the eval suite (here a starter set of three cases covering bug detection, false positives and security issues, which the team grows each time a bad review slips through), fails the check when a rubric drops below its threshold, and posts a scorecard on the PR. Cost per run is a handful of judge calls; measure it from your own provider's usage page.

The "be more concise" prompt change that caused three days of missed bugs would have been caught the same hour: the "identifies-bug" rubric for the null pointer case would have scored below threshold and blocked the merge. LLM judges are noisy, so thresholds start loose and the team re-runs a failing case before concluding the prompt is at fault.

For a config-driven alternative with no runner code, see the Promptfoo strategy in ai-eval-ci.

## Related Skills

- **ai-eval-ci** — eval strategies, LLM-as-judge scoring and exit-code gating used in Steps 1-3
- **github-actions** — the workflow, permissions and PR comment in Step 3
- **prompt-tester** — designing the test cases, rubrics and thresholds in Step 1
