---
name: trading-agents
description: >-
  Build multi-agent LLM trading systems for financial analysis and automated trading decisions.
  Use when: building AI-powered investment research, automating financial analysis pipelines,
  creating multi-agent systems that analyze markets, news, and fundamentals.
license: Apache-2.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [trading, finance, multi-agent, llm, analysis]
---

# TradingAgents — Multi-Agent LLM Financial Trading Framework

## Overview

Inspired by [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents), this skill helps you build a multi-agent system where specialized LLM agents collaborate to analyze stocks and make investment decisions — like a real trading firm's research team.

Each agent has a narrow focus: one reads filings, another tracks technicals, another scans news. A bull and bear researcher debate. A risk manager stress-tests the thesis. A portfolio manager makes the final call.

### Architecture

```
Analyst Layer: Fundamentals | Technical | News/Sentiment
     |
Research Layer: Bull Researcher <-debate-> Bear Researcher
     |
Portfolio Layer: Risk Manager -> Portfolio Manager -> BUY/HOLD/SELL
```

## Instructions

### 1. Define State and Initialize

```python
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from typing import TypedDict
import yfinance as yf

class TradingState(TypedDict):
    ticker: str
    fundamentals: str
    technical_signals: str
    news_sentiment: str
    bull_thesis: str
    bear_thesis: str
    risk_assessment: str
    final_decision: str

llm = ChatAnthropic(model="claude-sonnet-4-20250514")
```

### 2. Analyst Agents

Create specialized agents that each analyze one dimension:

```python
def fundamentals_analyst(state: TradingState) -> TradingState:
    info = yf.Ticker(state["ticker"]).info
    metrics = f"P/E: {info.get('trailingPE', 'N/A')}, Revenue Growth: {info.get('revenueGrowth', 'N/A')}, Margins: {info.get('profitMargins', 'N/A')}, D/E: {info.get('debtToEquity', 'N/A')}"
    response = llm.invoke([{"role": "user", "content": f"Analyze fundamentals for {state['ticker']}: {metrics}. Score valuation, profitability, balance sheet, moat (1-5 each)."}])
    return {"fundamentals": response.content}

def technical_analyst(state: TradingState) -> TradingState:
    hist = yf.Ticker(state["ticker"]).history(period="6mo")
    price = hist["Close"].iloc[-1]
    ma50 = hist["Close"].tail(50).mean()
    ma200 = hist["Close"].mean()
    response = llm.invoke([{"role": "user", "content": f"Technical analysis for {state['ticker']}: Price ${price:.2f}, 50d MA ${ma50:.2f}, 200d MA ${ma200:.2f}. Rate: Bullish/Neutral/Bearish."}])
    return {"technical_signals": response.content}

def news_analyst(state: TradingState) -> TradingState:
    response = llm.invoke([{"role": "user", "content": f"News/sentiment analysis for {state['ticker']}: recent earnings, guidance, industry trends, regulatory risks. Rate: Positive/Neutral/Negative."}])
    return {"news_sentiment": response.content}
```

### 3. Bull vs Bear Debate

```python
def bull_researcher(state: TradingState) -> TradingState:
    response = llm.invoke([{"role": "user", "content": f"Bull case for {state['ticker']}. Data: {state['fundamentals']} | {state['technical_signals']} | {state['news_sentiment']}. Include: 12-month price target, catalysts, why bears are wrong."}])
    return {"bull_thesis": response.content}

def bear_researcher(state: TradingState) -> TradingState:
    response = llm.invoke([{"role": "user", "content": f"Bear case AGAINST {state['ticker']}. Data: {state['fundamentals']} | {state['technical_signals']} | {state['news_sentiment']}. Include: downside target, key risks, why bulls are wrong."}])
    return {"bear_thesis": response.content}
```

### 4. Risk Manager and Portfolio Manager

```python
def risk_manager(state: TradingState) -> TradingState:
    response = llm.invoke([{"role": "user", "content": f"Risk assessment for {state['ticker']}. Bull: {state['bull_thesis']} | Bear: {state['bear_thesis']}. Provide: probability-weighted return, max drawdown, position size %, stop-loss."}])
    return {"risk_assessment": response.content}

def portfolio_manager(state: TradingState) -> TradingState:
    response = llm.invoke([{"role": "user", "content": f"Final investment memo for {state['ticker']}. Analysis: {state['fundamentals']} | {state['technical_signals']} | {state['news_sentiment']} | Bull: {state['bull_thesis']} | Bear: {state['bear_thesis']} | Risk: {state['risk_assessment']}. Output: DECISION, CONVICTION, TIME HORIZON, ENTRY/EXIT/STOP, THESIS, KEY RISKS."}])
    return {"final_decision": response.content}
```

### 5. Wire the LangGraph Workflow

```python
def build_trading_graph():
    graph = StateGraph(TradingState)
    for name, fn in [("fundamentals", fundamentals_analyst), ("technical", technical_analyst),
                     ("news", news_analyst), ("bull", bull_researcher), ("bear", bear_researcher),
                     ("risk", risk_manager), ("portfolio", portfolio_manager)]:
        graph.add_node(name, fn)
    graph.set_entry_point("fundamentals")
    graph.add_edge("fundamentals", "technical")
    graph.add_edge("technical", "news")
    graph.add_edge("news", "bull")
    graph.add_edge("news", "bear")
    graph.add_edge("bull", "risk")
    graph.add_edge("bear", "risk")
    graph.add_edge("risk", "portfolio")
    graph.add_edge("portfolio", END)
    return graph.compile()
```

## Examples

### Example 1: Analyzing NVDA Before Earnings

```python
app = build_trading_graph()
result = app.invoke({"ticker": "NVDA"})
print(result["final_decision"])
# DECISION: BUY
# CONVICTION: High
# TIME HORIZON: 6-12 months
# ENTRY ZONE: $118-$125
# PRICE TARGET: $165 (+35%)
# STOP LOSS: $98 (-18%)
# THESIS: NVIDIA data center revenue grew 409% YoY driven by AI infrastructure
#   demand. Gross margins at 76% reflect pricing power. Risk is multiple compression
#   if AI capex slows, but hyperscaler spending guidance remains strong.
# KEY RISKS: Customer concentration (top 4 = 40% revenue), China export controls,
#   AMD MI300X competitive pressure
```

### Example 2: Screening a Defensive Stock — JNJ

```python
result = app.invoke({"ticker": "JNJ"})
print(result["final_decision"])
# DECISION: HOLD
# CONVICTION: Medium
# TIME HORIZON: 12+ months
# ENTRY ZONE: $148-$153
# PRICE TARGET: $172 (+14%)
# STOP LOSS: $138 (-7%)
# THESIS: JNJ trades at 14.8x forward P/E, below its 5-year average of 16.5x,
#   after the Kenvue spinoff. Pharmaceutical pipeline (Darzalex, Tremfya) drives
#   mid-single-digit growth but talc litigation overhang caps upside near-term.
# KEY RISKS: Talc settlement costs ($9B+), Stelara biosimilar erosion starting 2025,
#   MedTech segment margin pressure from inflation
```

## Guidelines

- **Use cheap models for analysts**: Use claude-haiku-4-5 for analyst agents, powerful model only for portfolio manager
- **Wire in real data**: Use yfinance, Alpha Vantage, or Polygon.io for live market data
- **Parallel analysts**: Run fundamentals/technical/news in parallel via LangGraph Send API for 3x speedup
- **Backtest decisions**: Store decisions with timestamps and compare against actual price outcomes after 30/90 days
- **Cost control**: A full analysis runs ~6 LLM calls; batch screening 20 stocks costs ~$2-5 with Haiku analysts
- **Not financial advice**: This is a research tool — always validate with your own analysis before trading
