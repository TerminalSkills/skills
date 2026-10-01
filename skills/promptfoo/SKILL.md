---
name: promptfoo
description: >-
  Promptfoo is an open-source framework that tests and evaluates LLM prompts
  systematically. Use when someone asks to "test my prompts", "evaluate LLM
  output", "Promptfoo", "prompt regression testing", "compare LLM models",
  "LLM evaluation framework", or "benchmark prompts against test cases".
  Covers test cases, assertions, model comparison, red-teaming, and CI
  integration.
license: Apache-2.0
compatibility: "Node.js 22.22.0 or newer (24 LTS recommended). Works with any LLM provider."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["llm", "testing", "evaluation", "promptfoo", "prompts"]
  repository: https://github.com/promptfoo/promptfoo
---

# Promptfoo

## Overview

Promptfoo is an open-source framework for testing LLM prompts — define test cases, run them against one or more models, and assert on outputs. Think "unit tests for prompts." Compare models side-by-side, catch regressions when you change a prompt, and run red-team attacks to find vulnerabilities. Web UI for viewing results, CLI for CI integration. Evals run on your machine and call the providers with your own API keys; the project is MIT licensed and is now part of OpenAI.

## When to Use

- Changing a prompt and want to make sure it doesn't break existing behavior
- Comparing model performance (GPT vs Claude vs Gemini on your use case)
- Red-teaming an LLM application for prompt injection and harmful outputs
- Building a prompt evaluation suite for CI/CD
- Systematic prompt engineering (not vibes-based)

## Instructions

### Setup

```bash
npm install -g promptfoo      # or: brew install promptfoo
# Or run without installing: npx promptfoo@latest eval
promptfoo --version

promptfoo init --no-interactive     # writes a starter promptfooconfig.yaml
```

Providers read their keys from the environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ...) or from a file passed with `--env-file .env`. A missing key is reported before any test runs.

### Basic Evaluation

```yaml
# promptfooconfig.yaml — Eval configuration
prompts:
  - |
    You are a customer support agent for a SaaS product.
    Answer the following customer question concisely and helpfully.

    Question: {{question}}

providers:
  - openai:gpt-6-sol
  - anthropic:messages:claude-sonnet-5

defaultTest:
  options:
    provider:
      text: openai:gpt-6-luna                               # judge for llm-rubric
      embedding: openai:embeddings:text-embedding-3-large   # embeddings for similar

tests:
  - description: password reset
    vars:
      question: "How do I reset my password?"
    assert:
      - type: contains
        value: "password"
      - type: llm-rubric
        value: "Response should include step-by-step instructions"
      - type: similar
        value: "Go to Settings > Security > Reset Password"
        threshold: 0.7

  - vars:
      question: "Can I get a refund?"
    assert:
      - type: contains-any
        value: ["refund", "return", "money back"]
      - type: llm-rubric
        value: "Response should mention the refund policy and timeline"
      - type: not-contains
        value: "I don't know"

  - vars:
      question: "Your product sucks and I hate it"
    assert:
      - type: llm-rubric
        value: "Response should be professional and empathetic, not defensive"
      - type: not-contains-any
        value: ["sorry you feel that way", "I understand your frustration but"]
```

```bash
# Check the file, then dry-run it: echo replaces the models under test and returns the rendered
# prompt. llm-rubric and similar still call the judge and embeddings model (and need their key).
promptfoo validate config
promptfoo eval -r echo

# Run evaluation (results are cached on disk; --no-cache forces fresh calls)
promptfoo eval
promptfoo eval --filter-pattern "password" -o results.json -o report.html

# View results in web UI (http://localhost:15500)
promptfoo view
```

`promptfoo eval` exits with code 100 when any test fails and 1 on other errors. `PROMPTFOO_PASS_RATE_THRESHOLD=90` lets a run pass at 90% instead of 100%.

### Assertion Types

```yaml
tests:
  - vars: { input: "Translate 'hello' to French" }
    assert:
      # Exact/partial match
      - type: equals
        value: "Bonjour"
      - type: contains
        value: "bonjour"
      - type: icontains           # Case-insensitive
        value: "bonjour"

      # Regex
      - type: regex
        value: "\\b[Bb]onjour\\b"

      # LLM-as-judge
      - type: llm-rubric
        value: "Translation is accurate and natural-sounding"

      # Semantic similarity (embeddings; OpenAI text-embedding-3-large unless overridden)
      - type: similar
        value: "Hello in French is Bonjour"
        threshold: 0.8

      # JSON validation
      - type: is-json
      - type: javascript
        value: "output.length < 500"

      # Safety
      - type: not-contains
        value: "I cannot"
      - type: llm-rubric
        value: "Response does not contain harmful content"

      # Latency and cost
      - type: latency
        threshold: 3000           # Max 3 seconds; errors on a cached response, run with --no-cache
      - type: cost
        threshold: 0.01           # Max $0.01 per call
```

### Model Comparison

```yaml
# compare.yaml — Side-by-side model comparison
prompts:
  - "Summarize this article in 3 bullet points:\n\n{{article}}"

providers:
  - openai:gpt-6-sol
  - openai:gpt-6-luna
  - anthropic:messages:claude-sonnet-5
  - anthropic:messages:claude-haiku-4-5-20251001

tests:
  - vars:
      article: file://test-articles/ai-regulation.txt   # loads the file; do not wrap it in {{ }}
    assert:
      - type: llm-rubric
        value: "Summary captures the 3 most important points"
      - type: javascript
        value: "output.split('\\n').filter(l => l.startsWith('•')).length === 3"
      - type: latency
        threshold: 5000
```

### Red-Teaming

```bash
# Describe the target and pick plugins and strategies
promptfoo redteam init            # opens a browser UI; add --no-gui for terminal prompts
promptfoo redteam run             # generates attacks into redteam.yaml, then runs them
promptfoo redteam report          # open the vulnerability report

# Tests for: prompt injection, jailbreaks, PII leakage,
# harmful content, bias, and more
```

By default the adversarial inputs are generated by Promptfoo's remote service, not on your machine. Set `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true` to generate them locally with your own model (lower quality).

### CI Integration

```yaml
# .github/workflows/prompt-eval.yml
name: Prompt Evaluation
on:
  pull_request:
    paths: ["prompts/**", "promptfooconfig.yaml"]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      # A failed test makes this step exit with code 100 and fails the job
      - run: npx promptfoo@latest eval -o results.json -o results.junit.xml
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: eval-results
          path: results.*
```

For a before/after comment on the pull request, use `promptfoo/promptfoo-action@v1` instead of calling the CLI.

## Examples

### Example 1: Test a customer support chatbot

**User prompt:** "Create an eval suite for our support chatbot — test common questions, edge cases, and angry customers."

Save the config from "Basic Evaluation" as `promptfooconfig.yaml`, then check it before calling the models under test and run it:

```bash
promptfoo validate config          # Configuration is valid.
promptfoo eval -r echo --no-table  # renders every prompt; only the judge and embeddings model are called
promptfoo eval -o results.json
```

A run where one answer misses its rubric ends like this:

```
Results:
  ✓ 5 passed (83.33%)
  ✗ 1 failed (16.67%)
  0 errors (0%)
Duration: 9s (concurrency: 4)

Writing output to results.json
```

Three tests against two providers give six results. The exit code is 100 because one failed; `promptfoo view` shows which assertion failed and why, and `promptfoo eval --filter-failing results.json` reruns only the failures.

### Example 2: Choose the best model for my use case

**User prompt:** "I need to pick between GPT, Claude and Gemini for code review. Help me decide."

Keep the prompt and tests in the config and swap providers and the judge on the command line:

```bash
promptfoo eval -c code-review.yaml \
  -r openai:gpt-6-sol anthropic:messages:claude-sonnet-5 google:gemini-3.8-flash \
  --grader openai:gpt-6-luna \
  -o comparison.html
promptfoo view
```

The table has one column per provider and one row per test, each cell marked `[PASS]` or `[FAIL]`; `comparison.html` holds the same grid for sharing. Add `latency` and `cost` assertions to turn speed and price limits into pass/fail results.

## Guidelines

- **`llm-rubric` is the most flexible assertion** — uses an LLM to judge quality; pin the judge with `defaultTest.options.provider` or `--grader`, otherwise it depends on which API keys are set
- **`similar` for semantic matching** — doesn't require exact text match, but needs an embeddings provider; a single judge ID in `defaultTest.options.provider` or `--grader` replaces it and `similar` errors, so use the `text:`/`embedding:` map
- **`vars` for test data** — parameterize prompts with different inputs
- **File-based test data** — `file://` paths work for prompts, variable values and whole test lists (`tests: file://tests.csv`)
- **Red-team before production** — `promptfoo redteam` finds injection vulnerabilities
- **CI integration catches regressions** — run on every prompt change
- **Web UI for analysis** — `promptfoo view` shows results side-by-side
- **Cost and latency assertions grade finished calls** — they do not cap spending or stop a slow request; `latency` needs `--no-cache`
- **Model IDs go stale** — an unknown ID is an API error, not a failed test; check the provider page when a model is retired
- **Graders are not ground truth** — model-graded scores vary between runs; back them with deterministic assertions
- **Secrets stay in the environment** — never put API keys in `promptfooconfig.yaml`; `--share` uploads results, prompts and outputs included, to a hosted URL
- **Start with 10-20 test cases** — cover happy path, edge cases, and adversarial inputs
