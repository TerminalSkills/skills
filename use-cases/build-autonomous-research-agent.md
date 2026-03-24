---
title: Build an Autonomous Research Agent
slug: build-autonomous-research-agent
description: >-
  Build a LangGraph research agent that takes a question and produces a full report with
  citations — searching the web, synthesizing sources, with human-in-the-loop checkpoints.
skills:
  - deer-flow
  - langchain
  - langgraph
  - anthropic-sdk
category: research
tags:
  - agents
  - research
  - langgraph
  - autonomous
  - report-generation
---

## The Problem

A research analyst at a consulting firm spends 8-12 hours on each competitive landscape report — reading analyst reports, vendor websites, G2 reviews, and LinkedIn posts — then another 4 hours writing the summary. Every AI tool she has tried either hallucinates sources, stops after a shallow summary, or requires manually guiding every step. She needs an agent that runs autonomously, does the deep dive she would do, and produces a report with real citations.

## The Solution

Use `deer-flow` as the orchestration backbone: a LangGraph workflow modeled after ByteDance's DeerFlow architecture. The workflow routes tasks through a Coordinator (understands the goal), Planner (breaks it into sub-questions), Researcher (executes web searches via Tavily), Writer (synthesizes findings), and Publisher (formats the final report). Human approval checkpoints prevent runaway costs.

## Step-by-Step Walkthrough

### Step 1: Define Research State

```python
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from typing import TypedDict, List

class ResearchState(TypedDict):
    query: str
    research_plan: List[str]
    search_results: List[dict]
    synthesized_findings: str
    final_report: str
    human_approved: bool
```

### Step 2: Coordinator — Break Down the Question

The coordinator analyzes the research request and produces 5-8 specific sub-questions that would fully answer it. For "What's the competitive landscape for B2B CRM tools?", it generates sub-questions about market size, key players, pricing models, feature comparison, growth trends, and customer segments.

### Step 3: Researcher — Execute Web Searches

For each sub-question, the researcher calls Tavily's advanced search API with `max_results=5` and `include_raw_content=True`. Results are stored as structured objects with question, URL, and content.

### Step 4: Human-in-the-Loop Checkpoint

Before the expensive synthesis step, the system pauses and shows: the original query, all sub-questions, and total sources found. The human approves or cancels. This prevents runaway API costs on poorly scoped queries.

### Step 5: Writer — Synthesize Findings

The writer receives all search results and produces a structured analysis: executive summary, key players, market trends, competitive positioning, risks, and conclusions. All claims include inline citations like `[Source: URL]`.

### Step 6: Publisher — Format the Report

The publisher formats the analysis into a professional report with title, table of contents, numbered sections, key metrics in bold, and a sources appendix. Output is clean Markdown suitable for PDF export.

### Step 7: Wire the Graph

```python
graph = StateGraph(ResearchState)
# coordinator -> researcher -> human_review -> writer -> publisher
# human_review branches: approved -> writer, rejected -> END
app = graph.compile()

result = app.invoke({"query": "Competitive landscape for B2B CRM tools in 2025"})
```

## Real-World Example

Running the agent on "Competitive landscape for B2B CRM tools in 2025" produces a 12-page report in ~4 minutes:

- **Coordinator** generates 7 sub-questions (market size, top vendors, pricing, AI features, mid-market vs enterprise, growth rates, emerging players)
- **Researcher** finds 35 sources across Gartner summaries, vendor pricing pages, G2 comparisons, and analyst blog posts
- **Human review** confirms scope — analyst adds one sub-question about vertical CRM players
- **Writer** synthesizes into 6 sections with 28 inline citations
- **Publisher** outputs formatted Markdown with executive summary box and sources appendix

The analyst reviews and edits for 30 minutes instead of spending 12 hours from scratch.

## Related Skills

- [deer-flow](/skills/deer-flow) — DeerFlow-inspired autonomous research orchestration
- [langgraph](/skills/langgraph) — LangGraph workflow engine for multi-step agents
- [anthropic-sdk](/skills/anthropic-sdk) — direct Anthropic API integration
