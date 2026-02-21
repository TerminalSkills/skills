---
title: "Build a Cost-Optimized Local AI Inference Stack"
slug: build-cost-optimized-local-ai-stack
description: "Run a multi-model AI system locally with smart routing so simple tasks use free local models and only complex tasks hit paid APIs."
skills:
  - ollama-local
  - lm-studio-subagents
  - model-router
category: data-ai
tags:
  - local-llm
  - cost-optimization
  - ollama
  - model-routing
  - inference
---

# Build a Cost-Optimized Local AI Inference Stack

## The Problem

A 20-person agency spends $4,800 per month on OpenAI API calls for internal workflows: summarizing meeting notes, classifying support emails, generating first drafts of client reports, and answering internal knowledge base questions. But 70% of those calls are simple tasks -- short summaries, sentiment labels, template fills -- that do not need GPT-4o. They need a system where cheap or free local models handle the easy work, and expensive cloud models only get called when quality actually requires it.

## The Solution

Using the **ollama-local**, **lm-studio-subagents**, and **model-router** skills, the workflow sets up two local inference engines running open-source models, then builds a routing layer that classifies incoming requests by complexity and sends them to the cheapest model capable of handling the task -- falling back to cloud APIs only when local models cannot deliver acceptable quality.

## Step-by-Step Walkthrough

### 1. Set up Ollama with production models

Install Ollama and pull models optimized for different task types so the router has options to choose from.

> Install Ollama, pull llama3.1:8b for general tasks, pull qwen2.5-coder:7b for code-related work, and pull nomic-embed-text for embeddings. Configure Ollama to use GPU acceleration and set OLLAMA_NUM_PARALLEL=4 for concurrent requests.

This gives you three local models: a general-purpose model for summarization and Q&A, a code-specialized model for technical tasks, and an embedding model for semantic search -- all running on your hardware with zero API costs.

### 2. Configure LM Studio for specialized subagents

Set up LM Studio as a second inference engine running models that Ollama does not support well, and create task-specific subagents that handle classification and extraction.

> Start LM Studio server on port 1234 with Phi-3-mini-128k loaded. Create a subagent that classifies incoming support emails into categories: billing, technical, feature-request, or escalation. The subagent should use the LM Studio local endpoint and return structured JSON.

LM Studio handles models with long context windows (128K tokens) that Ollama struggles with, like processing entire documents or long email threads. The subagent pattern means each task gets a purpose-built worker with its own system prompt and output format.

### 3. Build the model router with fallback chains

Create a routing layer that inspects each request and sends it to the optimal model based on task type, complexity, and required quality level.

> Build a model router with these rules: classification and sentiment tasks go to Phi-3-mini via LM Studio. Summarization under 2000 tokens goes to llama3.1:8b via Ollama. Code generation goes to qwen2.5-coder:7b via Ollama. Anything requiring reasoning over 4000 tokens or tasks that fail quality checks falls back to Claude via API. Log every routing decision with the model used, latency, and estimated cost.

The router evaluates each request against complexity heuristics -- token count, task type keywords, required output format -- and picks the cheapest model that meets the quality bar. Failed responses trigger automatic retry on the next model in the fallback chain.

### 4. Monitor costs and routing effectiveness

Track which models handle which tasks and compare quality scores to validate that the routing decisions are correct.

> Generate a weekly routing report showing: total requests per model, average latency per model, estimated cost savings vs sending everything to GPT-4o, and any requests that fell back to cloud APIs. Flag any task categories where local models are failing more than 10% of the time.

The report identifies optimization opportunities. If 90% of code generation tasks succeed locally but 40% of long-form writing falls back to cloud, you know where to focus: either find a better local writing model or adjust the routing threshold.

## Real-World Example

A digital marketing agency running 15,000 LLM calls per month set up this three-tier stack on a workstation with an RTX 4090. Ollama handled summarization and embeddings, LM Studio ran classification subagents on Phi-3, and the router sent only complex creative briefs and long-form analysis to Claude. Monthly API costs dropped from $4,800 to $1,100 -- a 77% reduction. The local models handled 73% of all requests with equivalent quality, and the routing logs showed that only 8% of fallback calls were actually necessary (the rest were borderline tasks where local models would have been fine). After tuning the routing thresholds based on a month of data, they pushed local handling to 81% and brought costs down to $890.
