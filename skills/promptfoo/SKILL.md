---
name: promptfoo
description: >-
  Test and evaluate LLM prompts systematically with Promptfoo — open-source
  eval framework. Use when someone asks to "test my prompts", "evaluate LLM
  output", "Promptfoo", "prompt regression testing", "compare LLM models",
  "LLM evaluation framework", or "benchmark prompts against test cases".
  Covers test cases, assertions, model comparison, red-teaming, and CI
  integration.
license: Apache-2.0
compatibility: "Node.js 18+. Works with any LLM provider."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai
  tags: ["llm", "testing", "evaluation", "promptfoo", "prompts", "red-team"]
---

# Promptfoo

## Overview

Promptfoo is an open-source framework for testing LLM prompts — define test cases, run them against one or more models, and assert on outputs. Think "unit tests for prompts." Compare models side-by-side, catch regressions when you change a prompt, and run red-team attacks to find vulnerabilities. Web UI for viewing results, CLI for CI integration.

## When to Use

- Changing a prompt and want to make sure it doesn't break existing behavior
- Comparing model performance (GPT-4o vs Claude vs Gemini on your use case)
- Red-teaming an LLM application for prompt injection and harmful outputs
- Building a prompt evaluation suite for CI/CD
- Systematic prompt engineering (not vibes-based)

## Instructions

### Setup

```bash
npm install -g promptfoo
# Or: npx promptfoo@latest
```

### Basic Evaluation

```yaml
# promptfooconfig.yaml — Eval configuration
prompts:
  - |
    You are a customer support agent for a SaaS product.
    Answer the following customer question concisely and helpfully.

    Question: {{question}}

providers:
  - openai:gpt-4o
  - anthropic:messages:claude-sonnet-4-20250514

tests:
  - vars:
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
# Run evaluation
promptfoo eval

# View results in web UI
promptfoo view
```

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

      # Semantic similarity
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
        threshold: 3000           # Max 3 seconds
      - type: cost
        threshold: 0.01           # Max $0.01 per call
```

### Model Comparison

```yaml
# compare.yaml — Side-by-side model comparison
prompts:
  - "Summarize this article in 3 bullet points:\n\n{{article}}"

providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini
  - anthropic:messages:claude-sonnet-4-20250514
  - anthropic:messages:claude-haiku-4-20250514

tests:
  - vars:
      article: "{{file://test-articles/ai-regulation.txt}}"
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
# Auto-generate adversarial test cases
promptfoo redteam init
promptfoo redteam run

# Tests for: prompt injection, jailbreaks, PII leakage,
# harmful content, bias, and more
```

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
      - run: npx promptfoo@latest eval --ci
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - run: npx promptfoo@latest eval --output results.json
      - uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: results.json
```

## Examples

### Example 1: Test a customer support chatbot

**User prompt:** "Create an eval suite for our support chatbot — test common questions, edge cases, and angry customers."

The agent will create test cases across categories (FAQ, billing, technical, hostile), with LLM-rubric assertions for quality and safety checks.

### Example 2: Choose the best model for my use case

**User prompt:** "I need to pick between GPT-4o, Claude Sonnet, and Gemini Flash for code review. Help me decide."

The agent will set up a comparison eval with code review prompts, assertions for accuracy and helpfulness, and cost/latency thresholds.

## Guidelines

- **`llm-rubric` is the most flexible assertion** — uses an LLM to judge quality
- **`similar` for semantic matching** — doesn't require exact text match
- **`vars` for test data** — parameterize prompts with different inputs
- **File-based test data** — `{{file://path}}` for long test inputs
- **Red-team before production** — `promptfoo redteam` finds injection vulnerabilities
- **CI integration catches regressions** — run on every prompt change
- **Web UI for analysis** — `promptfoo view` shows results side-by-side
- **Cost assertions** — prevent expensive prompts from slipping into production
- **Multiple providers = comparison** — run same tests across models
- **Start with 10-20 test cases** — cover happy path, edge cases, and adversarial inputs
