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

Your team ships an AI feature (a support ticket classifier, a document summarizer, an email drafter) and the prompt was written by one engineer who tested it on three examples that happened to work. In production, it misclassifies edge cases, hallucinates details, and the output format breaks downstream parsing. Prompt changes are deployed by vibes: "this version feels better." There is no test suite, no evaluation rubric, no way to know whether a change improved or regressed quality.

This works fine until the first production incident where the model confidently extracts a wrong invoice amount or files a billing complaint as a feature request.

## The Solution

Use the **prompt-tester** skill to bring engineering rigor to prompt development: define what good output looks like, build test cases covering normal, edge and adversarial inputs, run each prompt variant several times against the same pinned model, and compare the scores. Use **data-analysis** (pandas) on the saved run results to see which cases fail, for which variant and in which category.

## Step-by-Step Walkthrough

### Step 1: Define Your Evaluation Rubric

```text
I'm building an AI feature that extracts invoice data from emails. Help me
define evaluation criteria for the extraction prompt.
```

Before testing anything, define what "correct" means. For an invoice extractor:

| Criterion | Weight | Pass Condition |
|-----------|--------|----------------|
| Field accuracy | 40% | All 6 fields correct (vendor, amount, date, invoice number, due date, line items) |
| Partial extraction | 20% | At least 4 of 6 fields correct |
| Format validity | 15% | Output is valid JSON matching the expected schema |
| No hallucination | 15% | No invented fields or values |
| Graceful failure | 10% | Returns null fields instead of guessing when data is missing |

The weighting reflects cost: wrong data is worse than missing data, and a confidently wrong amount causes real financial problems. Whatever can be checked by code (valid JSON, exact field match, null where the input has no value) is scored by code, not by a second model.

### Step 2: Build a Test Suite

```text
Create 10 test cases for the invoice extractor. Include normal invoices,
edge cases like partial data, and adversarial inputs. Write them as YAML
with an id, the input email, the expected JSON and tags.
```

Ten cases in three categories of increasing difficulty:

**Normal cases (5):**
- TC-01: Standard invoice email with all fields present
- TC-02: Invoice details in the email body with a PDF attached (only the body text is in scope)
- TC-03: Invoice in an HTML table
- TC-04: Multi-line-item invoice with subtotals
- TC-05: International invoice (EUR, DD/MM/YYYY dates)

**Edge cases (3):**
- TC-06: Email mentions an invoice but is actually a receipt
- TC-07: Two invoices in one email thread
- TC-08: Invoice with no due date

**Adversarial inputs (2):**
- TC-09: Marketing email with dollar amounts that looks like an invoice but is not
- TC-10: Empty body with the subject line "Invoice #1234"

Each case holds the input and the expected output. Adversarial cases are where most prompts break: they test whether the model says "this isn't an invoice" instead of extracting data from noise. Ten cases is a floor; add a real failure from production to the suite every time one turns up, and keep a held-out set you never tune on, so improvements are not just overfitting to the visible tests.

### Step 3: Test Prompt Variants

```text
Here are two versions of my extraction prompt. Run both against all 10 test
cases, 3 runs each, and compare.
```

The agent uses the harness from the prompt-tester skill: it calls the same model id at the lowest temperature the provider allows, runs every case several times, and scores each answer in code. Save one row per run (case, variant, run, correct, format_ok, hallucinated) to `results.csv`, then summarize with pandas:

```python
import pandas as pd

runs = pd.read_csv("results.csv")
print(runs.groupby("variant")[["correct", "format_ok", "hallucinated"]].mean().round(2))

# Cases a variant gets wrong in any run, hardest first
failing = (runs.groupby(["variant", "case", "tags"])["correct"].mean()
           .reset_index().query("correct < 1").sort_values("correct"))
print(failing)

# Accuracy by test category
print(runs.pivot_table(index="tags", columns="variant", values="correct", aggfunc="mean"))
```

An example of what the comparison can show (numbers from this example suite, not benchmarks):

| Metric | Variant A | Variant B |
|--------|-----------|-----------|
| Full accuracy (6/6 fields) | 60% | 80% |
| Partial accuracy (4+/6 fields) | 80% | 90% |
| Valid JSON | 100% | 100% |
| Hallucinated values | 2 cases | 0 cases |
| Graceful failure (of 3 edge cases) | 1/3 | 3/3 |

- Variant B identifies the marketing email (TC-09) as "not an invoice" and returns null; Variant A extracts a fake invoice from the marketing copy.
- Variant A invents a due date for TC-08, a hallucination that could cause a real payment error.
- Variant B extracts both invoices from TC-07.

Variant B wins. A 10-case suite with 3 runs per case is a smoke test, not statistics: a gap of one case is within noise, so treat only consistent differences as real.

### Step 4: Iterate on Failures

```text
Variant B failed on TC-05 (international format) and TC-10 (empty body).
Help me fix the prompt for these cases.
```

Failure analysis points to two specific gaps:

**TC-05 (international format):** the prompt never says dates may be DD/MM/YYYY, so the model reads "05/03/2026" as May 3rd instead of March 5th. Fix: tell it to parse dates using the currency, sender locale and any other dates in the message, and to return the ISO date.

**TC-10 (empty body):** the prompt says "extract from the email" but does not name the subject line as a data source. Fix: "Check both the body and the subject line."

Both fixes are targeted. Rerun only the two failed cases to confirm, then rerun the whole suite to confirm nothing else regressed. If the model provider offers structured output (a JSON schema or tool-calling option), use it for the JSON format instead of relying on prompt wording.

### Step 5: Document the Final Prompt

```text
Create a prompt spec document with the final version, its test results,
and when to re-evaluate.
```

The spec records the prompt version, the exact model id it was tested with, the date, the suite size and scores, the known limitations (for example scanned invoices and languages outside the suite), and the triggers for re-evaluation: a model change, new invoice formats from customers, or production accuracy dropping below the agreed threshold. Always call a pinned model id, because an alias can change behind your back.

The test suite lives next to the prompt in version control, and CI reruns it on every prompt change or model upgrade.

## Real-World Example

Amir is an ML engineer at a legal tech startup. Their feature extracts key clauses from contracts: termination terms, liability caps, payment schedules. The first prompt worked on five sample contracts but failed on real customer documents.

He builds a suite of 15 cases across SaaS agreements, NDAs, consulting contracts and international contracts, and runs the current prompt three times per case. The pandas summary shows an accuracy much lower than the team assumed, and the per-category pivot shows the misses concentrate in contracts with nested clauses and cross-references. Each of the next two prompt versions targets one of those patterns and is checked against the same suite plus a held-out set of contracts he did not tune on.

He adds the suite to CI so every prompt or model change runs against it before deployment. The first version of the eval took him a couple of hours to build, and every later change is tested before shipping.

## Related Skills

- [prompt-tester](/skills/prompt-tester) — rubrics, test suites, variant comparison and the scoring harness.
- [data-analysis](/skills/data-analysis) — pandas summaries of run results by variant, case and category.
