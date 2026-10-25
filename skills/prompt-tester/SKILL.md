---
name: prompt-tester
description: >-
  Design, test, and iterate on AI prompts systematically using structured
  evaluation criteria. Use when building AI features, optimizing agent
  instructions, comparing prompt variants, or evaluating output quality
  across edge cases. Trigger words: prompt engineering, prompt testing,
  eval, LLM evaluation, prompt comparison, A/B test prompts, prompt
  optimization, system prompt, instruction tuning.
license: Apache-2.0
compatibility: "Works with any LLM-based workflow or AI agent system"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "prompt-engineering, llm, evaluation, ai-agents"
---

# Prompt Tester

## Overview

Build a systematic approach to prompt engineering. Design test cases, define evaluation rubrics, run prompt variants against edge cases, and compare results to find the best-performing prompt for your use case.

## Instructions

### 1. Define the evaluation criteria

Before testing prompts, establish what "good" looks like:

```
## Evaluation Rubric: Customer Support Classifier

| Criterion     | Weight | Description                              |
|---------------|--------|------------------------------------------|
| Accuracy      | 40%    | Correct category assigned                |
| Consistency   | 25%    | Same input → same output across runs     |
| Latency       | 15%    | Response time under threshold            |
| Format        | 10%    | Output matches expected JSON schema      |
| Edge cases    | 10%    | Handles ambiguous/unusual inputs         |
```

### 2. Create test cases

Build a test suite covering normal cases, edge cases, and adversarial inputs:

```yaml
test_cases:
  - id: TC-001
    input: "My order hasn't arrived and it's been 2 weeks"
    expected_category: "shipping_delay"
    expected_priority: "high"
    tags: [normal, shipping]

  - id: TC-002
    input: "I love your product! Also my payment failed"
    expected_category: "payment_issue"
    expected_priority: "high"
    tags: [mixed-intent, edge-case]

  - id: TC-003
    input: "asdf jkl; 12345"
    expected_category: "unclassifiable"
    expected_priority: "low"
    tags: [adversarial, garbage-input]

  - id: TC-004
    input: ""
    expected_category: "unclassifiable"
    expected_priority: "low"
    tags: [adversarial, empty-input]
```

### 3. Design prompt variants

Create 2-3 prompt variants to compare:

**Variant A (Concise):**
```
Classify this support ticket into one category: payment_issue, shipping_delay,
product_defect, account_access, feature_request, unclassifiable.
Return JSON: {"category": "...", "priority": "high|medium|low"}
```

**Variant B (Detailed with examples):**
```
You are a support ticket classifier. Analyze the customer message and
assign exactly one category and priority level.

Categories: payment_issue, shipping_delay, product_defect, account_access,
feature_request, unclassifiable

Rules:
- If the message contains multiple issues, classify by the most urgent
- If the message is gibberish or empty, use "unclassifiable"
- Priority is "high" for payment/shipping issues, "medium" for product
  issues, "low" for feature requests

Examples:
Input: "I was charged twice for my subscription"
Output: {"category": "payment_issue", "priority": "high"}

Input: "It would be nice to have dark mode"
Output: {"category": "feature_request", "priority": "low"}

Now classify this message:
```

### 4. Run the evaluation

Run each variant against every case several times with the same model id and temperature 0 (or the lowest the provider allows), and score automatically wherever the answer can be checked by code. This harness (Python 3.9+, `pip install pyyaml`) works with any provider: fill in `call_model` with your SDK call, and run `python run_eval.py cases.yml A=variant_a.txt B=variant_b.txt`.

```python
"""run_eval.py: score prompt variants against a YAML test suite."""
import json
import statistics
import sys
import time

import yaml  # pip install pyyaml


def call_model(prompt: str, user_input: str) -> str:
    """Replace the body with your provider call (temperature 0, a pinned model id).
    Return the raw text of the reply."""
    raise NotImplementedError


def score_case(case: dict, raw: str) -> dict:
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {"format": False, "correct": False, "got": raw[:60]}
    if not isinstance(out, dict):  # valid JSON but not an object, e.g. a list or null
        return {"format": False, "correct": False, "got": raw[:60]}
    return {
        "format": set(out) == {"category", "priority"},
        "correct": out.get("category") == case["expected_category"]
        and out.get("priority") == case["expected_priority"],
        "got": out.get("category"),
    }


def evaluate(prompt: str, cases: list, runs: int = 3) -> dict:
    rows = []
    for case in cases:
        answers, latencies = [], []
        for _ in range(runs):
            start = time.perf_counter()
            raw = call_model(prompt, case["input"])
            latencies.append(time.perf_counter() - start)
            answers.append(score_case(case, raw))
        rows.append({
            "id": case["id"],
            "accuracy": sum(a["correct"] for a in answers) / runs,
            "format": sum(a["format"] for a in answers) / runs,
            "consistent": len({a["got"] for a in answers}) == 1,
            "p50_latency_s": statistics.median(latencies),
        })
    return {
        "accuracy": statistics.mean(r["accuracy"] for r in rows),
        "format": statistics.mean(r["format"] for r in rows),
        "consistency": statistics.mean(r["consistent"] for r in rows),
        "p50_latency_s": statistics.median(r["p50_latency_s"] for r in rows),
        "failed": [r["id"] for r in rows if r["accuracy"] < 1],
    }


if __name__ == "__main__":
    suite = yaml.safe_load(open(sys.argv[1]))["test_cases"]
    for name, path in (arg.split("=", 1) for arg in sys.argv[2:]):
        print(name, evaluate(open(path).read(), suite))
```

For fields that code cannot check (tone, completeness of a summary), score with a second model call that sees only the rubric, the input and the answer, and spot-check a sample by hand because judge models favour long answers. Record the results in a table:

```
## Evaluation Results

| Metric       | Variant A | Variant B |
|--------------|-----------|-----------|
| Accuracy     | 72%       | 91%       |
| Consistency  | 85%       | 94%       |
| Format match | 100%      | 100%      |
| Edge cases   | 40%       | 80%       |
| Avg tokens   | 12        | 18        |

### Detailed Results

| Test Case | Variant A           | Variant B           | Expected            |
|-----------|---------------------|---------------------|---------------------|
| TC-001    | ✅ shipping_delay   | ✅ shipping_delay   | shipping_delay      |
| TC-002    | ❌ general_inquiry  | ✅ payment_issue    | payment_issue       |
| TC-003    | ❌ feature_request  | ✅ unclassifiable   | unclassifiable      |
| TC-004    | ❌ (error)          | ✅ unclassifiable   | unclassifiable      |

Winner: Variant B (+19% accuracy, +40% edge case handling)
Tradeoff: ~50% more tokens per request
```

### 5. Iterate and refine

Based on failures, improve the winning variant:
- Analyze which test cases failed and why
- Add specific rules for failure patterns
- Rerun only the failed cases to verify fixes
- Document the final prompt with its test results

## Examples

### Example 1: Summarization Prompt

**Input:** "I need a prompt that summarizes meeting transcripts into action items. Help me test it."

**Output:**
```
## Test Suite: Meeting Summary Prompt

Test cases created: 8
- 3 normal meetings (standup, planning, retrospective)
- 2 edge cases (meeting with no action items, all-chat meeting)
- 2 long transcripts (>5000 words)
- 1 adversarial (transcript in mixed languages)

Rubric:
- Action item extraction: 40% (did it find all action items?)
- Owner assignment: 25% (did it identify who owns each item?)
- Brevity: 20% (summary under 200 words?)
- No hallucination: 15% (no invented action items?)

Running 3 variants... Results ready.
```

### Example 2: Code Review Prompt

**Input:** "Compare these two system prompts for our AI code reviewer"

**Output:**
```
## Comparison: Code Review Prompts

Test cases: 6 code snippets (SQL injection, race condition, clean code,
             style-only issues, empty file, 500-line file)

| Metric              | Prompt A | Prompt B |
|---------------------|----------|----------|
| Bug detection       | 4/6      | 6/6      |
| False positives     | 3        | 1        |
| Actionable feedback | 60%      | 90%      |
| Handles large files | ❌       | ✅       |

Prompt B is better: fewer false positives, catches all bugs,
and handles edge cases. Main improvement: explicit severity levels
and "only report issues you are confident about" instruction.
```

## Guidelines

- Always define evaluation criteria BEFORE testing — prevents post-hoc rationalization
- Test at least 8-10 cases: 50% normal, 30% edge cases, 20% adversarial
- Run each variant 3 times to check consistency (LLMs are non-deterministic)
- Track token usage alongside quality — cost matters at scale
- Keep a prompt changelog: version, date, changes, test results
- The winning prompt isn't always the longest — sometimes concise prompts outperform
- Document failure modes: knowing when a prompt breaks is as valuable as knowing when it works
- For production prompts, add regression tests and rerun when updating the model version; always call a pinned model id, because an alias can change behind your back
- Ask for structured output through the provider's JSON-schema or tool-calling option instead of hoping the prompt alone yields valid JSON
- Keep a held-out set of cases you never tune on, so improvements are not overfitting to the visible tests
