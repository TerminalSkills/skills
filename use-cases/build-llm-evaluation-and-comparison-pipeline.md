---
title: "Build an LLM Evaluation and Model Comparison Pipeline"
slug: build-llm-evaluation-and-comparison-pipeline
description: "Systematically test prompts across multiple models to find the best cost-quality tradeoff before committing to a provider for production."
skills:
  - langgraph
  - langsmith
category: data-ai
tags:
  - llm-evaluation
  - langgraph
  - langsmith
  - model-comparison
  - prompt-testing
---

# Build an LLM Evaluation and Model Comparison Pipeline

## The Problem

A startup building an AI-powered legal document reviewer is locked into GPT-4o at $1,200 per month in API costs. They chose it 6 months ago because it was the best at the time, but Claude, Gemini, and several open-source models have improved since then. Switching models manually is risky -- they do not know if a different model will handle their edge cases (contract clauses with nested conditions, ambiguous liability language, multi-jurisdiction compliance). They need a way to evaluate multiple models against the same test suite, compare quality metrics side by side, and catch regressions before they affect users, without running a month-long manual comparison.

## The Solution

Using the **langgraph** and **langsmith** skills, the workflow builds a multi-model evaluation graph with LangGraph that runs the same test cases through every model in parallel, then traces and scores every response in LangSmith to produce a comparison dashboard with per-model accuracy, latency, cost, and failure analysis.

## Step-by-Step Walkthrough

### 1. Build the evaluation dataset in LangSmith

Create a curated test suite from real legal documents with known-correct outputs that cover normal cases, edge cases, and adversarial inputs.

> Create a LangSmith evaluation dataset called "legal-doc-review-v2" with 150 test cases from our production data. Include 3 categories: standard contract clauses (80 cases with clear correct answers), edge cases (50 cases with ambiguous language, nested conditions, or multi-party agreements), and adversarial inputs (20 cases designed to trigger hallucination or overly confident wrong answers). Each example should have the input document, the expected output classification, and the expected extracted key terms.

The dataset represents the real distribution of document types the system handles. Overweighting edge cases (33% of the dataset vs 15% in production) intentionally stresses the models on the cases that matter most -- a model that scores 95% on easy cases but 60% on edge cases is worse in practice than one scoring 90%/85%.

### 2. Build the multi-model evaluation graph with LangGraph

Create a LangGraph workflow that sends each test case to multiple models in parallel, collects responses, and routes them to scoring nodes.

> Build a LangGraph evaluation graph with these nodes: "prepare" formats the input for each model's expected format, "evaluate_gpt4o" and "evaluate_claude_sonnet" and "evaluate_gemini_pro" and "evaluate_llama_70b" each call their respective model with the same prompt, "score" evaluates each response against the expected output using 4 criteria (accuracy, completeness, hallucination_check, format_compliance), and "compare" aggregates scores across all models per test case. Use parallel execution so all 4 models run simultaneously. Add LangSmith tracing to every node.

The parallel execution means evaluating 150 test cases across 4 models takes 15 minutes instead of an hour. Each model node uses the same system prompt and few-shot examples, so differences in output are purely model capability, not prompt engineering.

### 3. Run the evaluation and analyze results in LangSmith

Execute the full evaluation suite and use LangSmith's dashboard to compare models across every metric.

> Run the evaluation graph against the full 150-case dataset. In LangSmith, create a comparison view showing per-model scores on: overall accuracy, edge-case accuracy, hallucination rate, average latency, p95 latency, and estimated cost per 1000 documents. Highlight any test cases where models disagree -- those are the most informative for understanding capability differences.

The LangSmith traces reveal not just which model is best overall, but where each model fails. Model A might handle nested conditions perfectly but hallucinate on multi-jurisdiction cases, while Model B does the opposite. The disagreement analysis identifies the 15-20 test cases where model choice actually matters.

### 4. Set up regression detection for ongoing monitoring

Configure automated evaluation runs that trigger on prompt changes, model version updates, or weekly schedules to catch quality drift.

> Set up a LangSmith evaluation pipeline that runs automatically: on every pull request that modifies prompts or model configuration, on a weekly schedule against the full 150-case dataset, and whenever a model provider announces a version update. Create alert rules: flag if overall accuracy drops below 88%, if edge-case accuracy drops below 80%, or if hallucination rate exceeds 5%. Store results as experiment runs in LangSmith so the team can compare across time.

The automated pipeline catches the silent regressions that manual testing misses. When GPT-4o updated from version 0613 to 1106, a legal tech company discovered that accuracy on nested contract clauses dropped 7% -- visible in the weekly evaluation run but invisible in day-to-day usage because the affected cases are only 12% of total volume.

## Real-World Example

The legal tech startup ran their 150-case evaluation suite across GPT-4o, Claude Sonnet, Gemini 1.5 Pro, and Llama 3.1 70B. GPT-4o scored 91% overall, Claude Sonnet 93%, Gemini 88%, and Llama 70B 82%. But the edge-case breakdown told a different story: Claude scored 89% on nested conditions (vs GPT-4o's 83%), while GPT-4o outperformed on multi-jurisdiction cases (90% vs 85%). The team switched their primary model to Claude Sonnet for a projected $400/month savings (lower per-token cost at higher accuracy), kept GPT-4o as a fallback for the specific case types where it excels, and set up weekly LangSmith evaluations that have since caught two model-version regressions before they affected production users. Total monthly cost dropped from $1,200 to $780 while accuracy improved from 91% to 94%.
