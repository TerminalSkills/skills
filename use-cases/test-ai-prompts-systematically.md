---
title: "Test AI Prompts Systematically Before Shipping to Production"
slug: test-ai-prompts-systematically
description: "Design evaluation rubrics, build test suites, and compare prompt variants to find the best-performing AI instructions."
skills: [prompt-tester, data-analysis]
category: data-ai
tags: [prompt-engineering, llm, evaluation, ai-agents, testing]
---

# Test AI Prompts Systematically Before Shipping to Production

## The Problem

Your team ships an AI feature — a support ticket classifier, a document summarizer, an email drafter — and the prompt was written by one engineer who tested it on three examples that happened to work. In production, it misclassifies edge cases, hallucinates details, and the output format breaks downstream parsing. Prompt changes are deployed by vibes: "this version feels better." There's no test suite, no evaluation rubric, no way to know if a change improved or regressed quality.

## The Solution

Use the **prompt-tester** skill to bring engineering rigor to prompt development. Define what good output looks like, build test cases covering normal and edge scenarios, run multiple prompt variants, and compare results with metrics. Combine with **data-analysis** to analyze patterns in failures and measure improvement over iterations.

```bash
npx terminal-skills install prompt-tester
npx terminal-skills install data-analysis
```

## Step-by-Step Walkthrough

### 1. Define your evaluation rubric

```
I'm building an AI feature that extracts invoice data from emails. Help me define evaluation criteria for the extraction prompt.
```

The agent creates a scoring rubric:

```
## Evaluation Rubric: Invoice Email Extractor

| Criterion        | Weight | Pass Condition                          |
|------------------|--------|-----------------------------------------|
| Field accuracy   | 40%    | All 6 fields correct (vendor, amount,   |
|                  |        | date, invoice #, due date, line items)  |
| Partial extract  | 20%    | At least 4/6 fields correct             |
| Format validity  | 15%    | Output is valid JSON matching schema    |
| No hallucination | 15%    | No invented fields or values            |
| Graceful failure | 10%    | Returns null fields instead of guessing |
```

### 2. Build a test suite

```
Create 10 test cases for the invoice extractor. Include normal invoices, edge cases like partial data, and adversarial inputs.
```

```
## Test Suite: 10 cases

Normal (5):
- TC-01: Standard invoice email with all fields
- TC-02: Invoice as PDF attachment (text in body only)
- TC-03: Invoice in HTML table format
- TC-04: Multi-line-item invoice
- TC-05: International invoice (EUR, DD/MM/YYYY format)

Edge cases (3):
- TC-06: Email mentions invoice but is actually a receipt
- TC-07: Two invoices in one email thread
- TC-08: Invoice with missing due date

Adversarial (2):
- TC-09: Marketing email with dollar amounts (not an invoice)
- TC-10: Empty email body with subject "Invoice #1234"
```

### 3. Test prompt variants

```
Here are two versions of my extraction prompt. Run both against all 10 test cases and compare.
```

The agent runs each variant and produces a comparison:

```
## Results: Variant A vs Variant B

| Metric           | Variant A | Variant B |
|------------------|-----------|-----------|
| Full accuracy    | 60%       | 80%       |
| Partial accuracy | 80%       | 90%       |
| Format valid     | 100%      | 100%      |
| Hallucination    | 2 cases   | 0 cases   |
| Graceful failure | 1/3       | 3/3       |

Key differences:
- Variant B handles the marketing email correctly (returns null)
- Variant A invented a due date for TC-08 (hallucination)
- Variant B correctly extracts both invoices from TC-07

Winner: Variant B (80% accuracy, zero hallucinations)
```

### 4. Iterate on failures

```
Variant B failed on TC-05 (international format) and TC-10 (empty body). Help me fix the prompt for these cases.
```

The agent analyzes the failures, suggests adding explicit instructions for date format handling and subject-line-only extraction, and reruns just the failed cases to verify.

### 5. Document the final prompt

```
Create a prompt spec document with the final version, its test results, and when to re-evaluate.
```

```
## Prompt Spec: Invoice Email Extractor v2.1

Last tested: 2026-02-17
Model: claude-sonnet-4-20250514
Test suite: 10 cases, 90% pass rate

Known limitations:
- Scanned PDF invoices (no OCR in email body)
- Invoices in languages other than English/Spanish

Re-evaluate when:
- Switching model versions
- Adding new invoice formats
- Accuracy drops below 85% in production monitoring
```

## Real-World Example

Amir is an ML engineer at a legal tech startup called DocuParse. They built an AI feature that extracts key clauses from contracts — termination terms, liability caps, payment schedules. The initial prompt worked on their 5 sample contracts but failed badly on real customer documents with unusual formatting.

1. Amir asks the agent: "Help me build an eval suite for our contract clause extractor"
2. The agent creates 15 test cases from different contract types (SaaS agreements, NDAs, consulting contracts, international contracts)
3. He tests his current prompt: 53% accuracy — much worse than expected
4. The agent analyzes failures: most are from contracts with nested clauses and cross-references
5. They iterate through 3 prompt versions, each time fixing the specific failure patterns
6. Final version scores 88% accuracy with zero hallucinations on the test suite
7. Amir adds the test suite to CI — every prompt change now runs against the eval before deployment

Time invested: 2 hours. Result: prompt accuracy went from 53% to 88%, and every future change is tested before shipping.

## Related Skills

- [data-analysis](../skills/data-analysis/) — Analyze failure patterns and accuracy trends across prompt versions
- [test-generator](../skills/test-generator/) — Generate edge case test inputs from existing examples
- [coding-agent](../skills/coding-agent/) — Build automated eval harnesses that run prompt tests in CI
