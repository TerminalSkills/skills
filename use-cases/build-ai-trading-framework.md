---
title: Build a Multi-Agent AI Trading Framework
slug: build-ai-trading-framework
description: >-
  Build a multi-agent LLM system that screens stocks, debates investment theses, and generates
  research-grade investment memos using specialized analyst agents and a portfolio manager.
skills:
  - trading-agents
  - langchain
  - anthropic-sdk
category: data-ai
tags:
  - trading
  - finance
  - multi-agent
  - investment
  - analysis
---

## The Problem

A quant analyst screens 500+ stocks each quarter using Bloomberg terminals, earnings transcripts, and manual analysis. The process is slow, inconsistent, and dependent on individual analyst biases. Two analysts looking at the same stock often reach different conclusions not because of different data, but because of different frameworks and cognitive biases. The team needs a system that applies a consistent analytical framework to every stock — fundamentals, technicals, and news — then produces a structured investment memo.

## The Solution

Use `trading-agents` to build a LangGraph-orchestrated multi-agent system. Specialized analyst agents each own a domain (fundamentals, technicals, news). Bull and bear researchers debate the thesis. A risk manager quantifies downside. A portfolio manager synthesizes everything into a final investment memo. The workflow takes ~2 minutes per stock.

## Step-by-Step Walkthrough

### Step 1: Environment Setup

```bash
pip install langchain-anthropic langgraph yfinance
export ANTHROPIC_API_KEY="your-key"
```

### Step 2: Define State and Analyst Agents

Define a `TradingState` TypedDict and create three analyst agents — fundamentals (pulls yfinance metrics and scores valuation/profitability/balance sheet), technical (computes 50d/200d moving averages and rates trend), and news (assesses earnings, guidance, and sector sentiment). Each returns its analysis as a string in the shared state.

### Step 3: Bull vs Bear Debate

Create `bull_researcher` and `bear_researcher` agents that receive all analyst data and construct the strongest possible case for and against the stock. The bull includes a 12-month price target and catalysts; the bear includes downside scenarios and why bulls are wrong.

### Step 4: Risk Manager and Portfolio Manager

The risk manager probability-weights bull/base/bear scenarios and recommends position sizing and stop-loss levels. The portfolio manager synthesizes everything into a structured memo: DECISION, CONVICTION, ENTRY/EXIT/STOP prices, THESIS, and KEY RISKS.

### Step 5: Wire the LangGraph Workflow

```python
graph = StateGraph(TradingState)
# Add all 7 nodes, wire: fundamentals -> technical -> news -> bull/bear -> risk -> portfolio
app = graph.compile()
result = app.invoke({"ticker": "NVDA"})
print(result["final_decision"])
```

The graph fans out at the news node (bull and bear run from the same input), then converges at risk.

## Real-World Example

Screening NVDA produces an investment memo in ~90 seconds:

```
DECISION: BUY | CONVICTION: High | TIME HORIZON: 6-12 months
ENTRY: $118-$125 | TARGET: $165 (+35%) | STOP: $98 (-18%)
THESIS: Data center revenue +409% YoY, 76% gross margins, hyperscaler capex strong.
RISKS: Customer concentration, China export controls, AMD MI300X competition.
```

Running the same workflow on JNJ yields HOLD with Medium conviction — the system correctly identifies the Kenvue spinoff discount but flags talc litigation as capping upside.

## Related Skills

- [trading-agents](/skills/trading-agents) — the core multi-agent trading framework
- [langchain](/skills/langchain) — LangChain for LLM orchestration
- [anthropic-sdk](/skills/anthropic-sdk) — direct Anthropic API integration
