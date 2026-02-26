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
  version: "1.0.0"
  category: data-ai
  tags: ["eval", "testing", "ci-cd", "llm", "quality", "regression", "benchmark"]
---

# AI Eval in CI

## Overview

Test AI agents and LLM outputs the same way you test code — automated evaluations that run in CI, compare against baselines, and fail the build when quality drops. No dashboards to check manually. Just `npx eval run --ci` and a red or green build.

## When to Use

- Adding quality gates before deploying AI features to production
- Catching prompt regressions when system prompts or models change
- Comparing model performance (GPT-4o vs Claude Sonnet vs local Llama)
- Validating RAG pipeline accuracy against a test dataset
- Benchmarking agent tool-calling accuracy and latency

## Instructions

### Strategy 1: Promptfoo (Config-Driven Evals)

Promptfoo is the most popular open-source eval framework. Define test cases in YAML, run against multiple providers, get a comparison matrix.

```yaml
# promptfooconfig.yaml — Eval configuration
# Tests a customer support agent across 3 models with quality assertions
description: "Customer support agent eval"

providers:
  - id: openai:gpt-4o
  - id: anthropic:messages:claude-sonnet-4-20250514
  - id: ollama:llama3.1:8b

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
        value: "Response shows empathy, takes the issue seriously, and offers next steps"
      - type: sentiment
        threshold: 0.3  # Must not be dismissive

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

# Run in CI with threshold — exits non-zero if any test fails
npx promptfoo@latest eval --ci --output results.json

# Compare two prompt versions
npx promptfoo@latest eval --prompts prompt-v1.txt prompt-v2.txt --share
```

### Strategy 2: Custom Eval Framework (TypeScript)

When you need full control — custom scoring logic, database-backed test sets, domain-specific metrics.

```typescript
// eval.ts — Custom AI eval framework with CI integration
/**
 * Runs evaluation suites against AI agents/LLMs.
 * Each eval defines inputs, expected behavior, and scoring criteria.
 * Exits with code 1 if any score drops below threshold.
 */
import OpenAI from "openai";

interface EvalCase {
  name: string;
  input: string;
  rubric: string;          // What "good" looks like
  threshold: number;       // Minimum score 0-1
  metadata?: Record<string, unknown>;
}

interface EvalResult {
  name: string;
  score: number;
  pass: boolean;
  output: string;
  reasoning: string;
  latencyMs: number;
}

const openai = new OpenAI();

/**
 * Score an AI output using LLM-as-judge.
 * Returns a score 0-1 with reasoning.
 */
async function judge(output: string, rubric: string): Promise<{ score: number; reasoning: string }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",  // Cheap model for judging
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
    temperature: 0,  // Deterministic judging
  });

  return JSON.parse(response.choices[0].message.content!);
}

/**
 * Run a single eval case against your AI agent.
 */
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

/**
 * Run all evals and exit with appropriate code for CI.
 */
async function runSuite(
  agentFn: (input: string) => Promise<string>,
  cases: EvalCase[]
): Promise<void> {
  console.log(`Running ${cases.length} evals...\n`);

  const results: EvalResult[] = [];
  for (const evalCase of cases) {
    const result = await runEval(agentFn, evalCase);
    results.push(result);
    const icon = result.pass ? "✅" : "❌";
    console.log(`${icon} ${result.name}: ${result.score.toFixed(2)} (threshold: ${evalCase.threshold}) [${result.latencyMs}ms]`);
    if (!result.pass) {
      console.log(`   Reasoning: ${result.reasoning}`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (avg score: ${avgScore.toFixed(2)})`);

  // CI exit code
  if (failed > 0) {
    console.log("\n❌ Eval suite FAILED — quality below threshold");
    process.exit(1);
  } else {
    console.log("\n✅ Eval suite PASSED");
  }
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

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      - name: Run AI evals
        run: npx tsx eval/run.ts --ci
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Post results to PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('eval/results.json'));
            const body = results.map(r => 
              `${r.pass ? '✅' : '❌'} **${r.name}**: ${r.score.toFixed(2)} (${r.latencyMs}ms)`
            ).join('\n');
            github.rest.issues.createComment({
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

**User prompt:** "We're considering switching from GPT-4o to Claude Sonnet. Run our eval suite against both and show me which performs better."

The agent will:
- Configure promptfoo with both providers
- Run the existing eval suite against both models
- Generate comparison table with per-test scores, latency, and cost
- Recommend based on score-to-cost ratio

## Guidelines

- **Eval every prompt change** — treat prompts like code; test before deploying
- **LLM-as-judge is good enough** — GPT-4o-mini costs pennies and correlates well with human judgment
- **Use temperature 0 for judges** — deterministic scoring reduces noise
- **Keep test sets diverse** — happy path, edge cases, adversarial inputs, off-topic
- **Set realistic thresholds** — start at 0.7, tighten as the agent improves
- **Track scores over time** — log results to detect gradual quality drift
- **Separate eval cost from production cost** — eval uses cheap judge models, production uses the best
- **Cache eval results** — don't re-run unchanged tests; hash input+prompt for cache keys
- **Run evals on PRs, not just main** — catch regressions before merge
