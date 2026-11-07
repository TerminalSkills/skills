---
name: ai-eval-ci
description: >-
  Run AI agent and LLM evaluations in CI/CD pipelines — automated quality gates
  that fail the build when AI output quality drops. Use when someone asks to
  "test my AI agent", "add evals to CI", "catch prompt regressions", "compare
  models", "evaluate LLM output quality", "set up AI quality gates", or "benchmark
  my agent before deploying". Covers eval frameworks (Cobalt, Promptfoo, Braintrust),
  LLM-as-judge scoring, threshold-based assertions, and GitHub Actions integration.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Optional: OpenAI/Anthropic API key for LLM-as-judge."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "eval, ci-cd, llm, quality, regression"
---

# AI Eval in CI

## Overview

Test AI agents and LLM outputs the same way you test code — automated evaluations that run in CI, compare against baselines, and fail the build when quality drops. No dashboards to check manually: the eval command exits non-zero when quality drops, and the build goes red. Strategy 1 uses `promptfoo eval` (exit code 100 on a failed test); Strategy 2 is a runner you write that calls `process.exit(1)`.

Model IDs change and old ones are shut down on a schedule, so every model in this skill comes from an environment variable with a default. Check the vendor's deprecations page before pinning: OpenAI https://developers.openai.com/api/docs/deprecations, Anthropic https://platform.claude.com/docs/en/about-claude/model-deprecations.

## When to Use

- Adding quality gates before deploying AI features to production
- Catching prompt regressions when system prompts or models change
- Comparing model performance (an OpenAI model vs a Claude model vs local Llama)
- Validating RAG pipeline accuracy against a test dataset
- Benchmarking agent tool-calling accuracy and latency

## Instructions

### Strategy 1: Promptfoo (Config-Driven Evals)

Promptfoo is the most popular open-source eval framework. Define test cases in YAML, run against multiple providers, get a comparison matrix.

```yaml
# promptfooconfig.yaml — Eval configuration
# Tests a customer support agent across 3 providers with quality assertions
description: "Customer support agent eval"

providers:
  - id: openai:chat:{{ env.OPENAI_MODEL | default('gpt-6-luna') }}
  - id: anthropic:messages:{{ env.ANTHROPIC_MODEL | default('claude-sonnet-5-5') }}
  - id: ollama:chat:llama3.1:8b

# Model that grades llm-rubric assertions (set JUDGE_MODEL to change it)
defaultTest:
  options:
    provider: openai:chat:{{ env.JUDGE_MODEL | default('gpt-6-luna') }}

prompts:
  - |
    You are a customer support agent for a SaaS product.
    Respond helpfully and accurately. If you don't know, say so.
    
    Customer message: {{message}}

tests:
  - vars:
      message: "How do I reset my password?"
    assert:
      - type: llm-rubric
        value: "Response explains the password reset process clearly"
      - type: not-contains
        value: "I don't know"
      - type: latency
        threshold: 3000  # Must respond within 3 seconds

  - vars:
      message: "Can I get a refund for my annual plan?"
    assert:
      - type: llm-rubric
        value: "Response acknowledges the refund request and explains the policy"
      - type: not-contains
        value: "I'm an AI"  # Don't break character

  - vars:
      message: "Your product deleted all my data!"
    assert:
      - type: llm-rubric
        value: "Response shows empathy, is not dismissive, and offers next steps"

  - vars:
      message: "What's the weather in Tokyo?"
    assert:
      - type: llm-rubric
        value: "Response politely redirects to product-related topics"
      - type: not-contains
        value: "Tokyo"  # Should not answer off-topic questions
```

```bash
# Run evals locally
npx promptfoo@latest eval

# In CI: promptfoo exits 100 when any test fails, which fails the step (no --ci flag)
npx promptfoo@latest eval --no-progress-bar --no-table -o results.json

# Compare two prompt versions
npx promptfoo@latest eval --prompts prompt-v1.txt prompt-v2.txt --share
```

### Strategy 2: Custom Eval Framework (TypeScript)

When you need full control — custom scoring logic, database-backed test sets, domain-specific metrics.

```typescript
// eval.ts — Custom AI eval framework with CI integration
// Runs eval cases against an agent; exits 1 if any score is below its threshold
import { writeFileSync } from "node:fs";
import OpenAI from "openai";

interface EvalCase {
  name: string;
  input: string;
  rubric: string;          // What "good" looks like
  threshold: number;       // Minimum score 0-1
}

interface EvalResult {
  name: string;
  score: number;
  pass: boolean;
  output: string;
  reasoning: string;
  latencyMs: number;
}

const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment
// Judge model is configurable; gpt-4o-mini shuts down on 2027-01-14 (replacement: gpt-6-luna) (OpenAI deprecations page)
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "gpt-6-luna";

// LLM-as-judge: score an output 0-1 against a rubric
async function judge(output: string, rubric: string): Promise<{ score: number; reasoning: string }> {
  const response = await openai.chat.completions.create({
    model: JUDGE_MODEL,    // Small, cheap model for judging
    messages: [
      {
        role: "system",
        content: `You are an eval judge. Score the AI output against the rubric.
Return JSON: {"score": 0.0-1.0, "reasoning": "brief explanation"}
Score 1.0 = perfect match. Score 0.0 = complete failure.`,
      },
      {
        role: "user",
        content: `Rubric: ${rubric}\n\nAI Output:\n${output}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content!);
}

async function runEval(
  agentFn: (input: string) => Promise<string>,
  evalCase: EvalCase
): Promise<EvalResult> {
  const start = Date.now();
  const output = await agentFn(evalCase.input);
  const latencyMs = Date.now() - start;

  const { score, reasoning } = await judge(output, evalCase.rubric);

  return {
    name: evalCase.name,
    score,
    pass: score >= evalCase.threshold,
    output: output.slice(0, 200),
    reasoning,
    latencyMs,
  };
}

async function runSuite(
  agentFn: (input: string) => Promise<string>,
  cases: EvalCase[]
): Promise<void> {
  console.log(`Running ${cases.length} evals...`);

  const results: EvalResult[] = [];
  for (const evalCase of cases) {
    const result = await runEval(agentFn, evalCase);
    results.push(result);
    console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}: ${result.score.toFixed(2)} (threshold: ${evalCase.threshold}) [${result.latencyMs}ms]`);
    if (!result.pass) {
      console.log(`   Reasoning: ${result.reasoning}`);
    }
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);

  // Machine-readable results for the PR comment step
  writeFileSync("eval/results.json", JSON.stringify(results, null, 2));

  // CI exit code
  if (failed > 0) {
    console.log("Eval suite FAILED: quality below threshold");
    process.exit(1);
  }
  console.log("Eval suite PASSED");
}

export { runSuite, EvalCase };
```

### Strategy 3: GitHub Actions Integration

```yaml
# .github/workflows/ai-eval.yml
name: AI Eval
on:
  pull_request:
    paths:
      - "prompts/**"
      - "src/agents/**"
      - "eval/**"

# The comment step needs pull-requests: write. Secrets are not passed to
# workflows triggered by pull requests from forks, so the gate covers
# branches in the same repository.
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

      - name: Run AI evals
        run: npx tsx eval/run.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          JUDGE_MODEL: ${{ vars.JUDGE_MODEL || 'gpt-6-luna' }}

      - name: Post results to PR
        if: ${{ !cancelled() && hashFiles('eval/results.json') != '' }}
        uses: actions/github-script@v9
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('eval/results.json', 'utf8'));
            const body = results.map(r => 
              `${r.pass ? 'PASS' : 'FAIL'} **${r.name}**: ${r.score.toFixed(2)} (${r.latencyMs}ms)`
            ).join('\n');
            await github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: `## AI Eval Results\n\n${body}`
            });
```

## Examples

### Example 1: Add quality gates to a RAG chatbot

**User prompt:** "Set up automated evals for our RAG customer support bot. It should test accuracy on 50 known Q&A pairs and fail the deploy if accuracy drops below 85%."

The agent will:
- Create a test dataset from the 50 known Q&A pairs
- Write promptfoo config with llm-rubric assertions for each
- Set pass threshold at 0.85
- Add GitHub Actions workflow that runs on PR to `prompts/` or `src/agents/`
- Post eval results as PR comment

### Example 2: Compare models before switching

**User prompt:** "We're considering switching from our current OpenAI model to Claude Sonnet. Run our eval suite against both and show me which performs better."

The agent will:
- Configure promptfoo with both providers
- Run the existing eval suite against both models
- Generate comparison table with per-test scores, latency, and cost
- Recommend based on score-to-cost ratio

## Guidelines

- **Eval every prompt change** — treat prompts like code; test before deploying
- **LLM-as-judge is good enough for gating** — a small judge model is cheap, but verdicts are noisy: re-run a failing case before blaming the prompt
- **Pin the judge in an env var** — `JUDGE_MODEL` changes in one place when a model is deprecated, and scores stay comparable between runs that use the same judge
- **Keep test sets diverse** — happy path, edge cases, adversarial inputs, off-topic
- **Set realistic thresholds and track over time** — start at 0.7, tighten as the agent improves, and log results to catch gradual quality drift
- **Keep eval cheap** — judge with cheap models (production uses the best), and cache unchanged tests (hash input+prompt)
- **Run evals on PRs, not just main** — catch regressions before merge
