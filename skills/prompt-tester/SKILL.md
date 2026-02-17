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
  author: carlos
  version: "1.0.0"
  category: data-ai
  tags: ["prompt-engineering", "llm", "evaluation", "ai-agents"]
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
Classify this support ticket into one category: billing, shipping_delay,
product_defect, account_access, feature_request, unclassifiable.
Return JSON: {"category": "...", "priority": "high|medium|low"}
```

**Variant B (Detailed with examples):**
```
You are a support ticket classifier. Analyze the customer message and
assign exactly one category and priority level.

Categories: billing, shipping_delay, product_defect, account_access,
feature_request, unclassifiable

Rules:
- If the message contains multiple issues, classify by the most urgent
- If the message is gibberish or empty, use "unclassifiable"
- Priority is "high" for payment/shipping issues, "medium" for product
  issues, "low" for feature requests

Examples:
Input: "I was charged twice for my subscription"
Output: {"category": "billing", "priority": "high"}

Input: "It would be nice to have dark mode"
Output: {"category": "feature_request", "priority": "low"}

Now classify this message:
```

### 4. Run the evaluation

Execute each prompt variant against all test cases and score:

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
- For production prompts, add regression tests and rerun when updating the model version
