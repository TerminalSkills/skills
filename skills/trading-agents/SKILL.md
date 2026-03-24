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
  category: ai-tools
  tags: [trading, finance, multi-agent, llm, stocks, investment, analysis]
  use-cases:
    - "Build a multi-agent system that analyzes stocks from multiple perspectives"
    - "Automate investment research with specialized AI analyst agents"
    - "Create a trading signal generator using LLM fundamental analysis"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# TradingAgents — Multi-Agent LLM Financial Trading Framework

## Overview

Inspired by [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) (40k+ stars), this skill helps you build a multi-agent system where specialized LLM agents collaborate to analyze stocks and make investment decisions — just like a real trading firm's research team.

Each agent has a narrow focus: one reads filings, another tracks technicals, another scans news. They debate. A risk manager stress-tests the thesis. A portfolio manager makes the final call.

## Architecture

```
Analyst Layer
├── Fundamentals Analyst    — P/E, revenue, margins, moat
├── Technical Analyst       — price patterns, momentum, volume
├── News Analyst            — recent events, earnings, macro
└── Social Sentiment Analyst — Reddit, Twitter, options flow

Research Layer
├── Bull Researcher         — builds the long thesis
└── Bear Researcher         — builds the short/avoid thesis
         ↓ debate
Portfolio Layer
├── Risk Manager            — position sizing, downside scenarios
└── Portfolio Manager       — final BUY / HOLD / SELL decision
```

## Installation

```bash
pip install langchain-anthropic langgraph langchain-community
pip install yfinance requests beautifulsoup4
```

## Step 1: Define Trading State

```python
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from typing import TypedDict

class TradingState(TypedDict):
    ticker: str
    fundamentals: str
    technical_signals: str
    news_sentiment: str
    bull_thesis: str
    bear_thesis: str
    risk_assessment: str
    final_decision: str

llm = ChatAnthropic(model="claude-opus-4-5")
```

## Step 2: Analyst Agents

```python
def fundamentals_analyst(state: TradingState) -> TradingState:
    """Analyzes 10-K filings, earnings, balance sheet strength."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a CFA-level fundamentals analyst.
Analyze {state['ticker']}:
- Revenue growth (3-year CAGR), profit margins, free cash flow
- Balance sheet: debt/equity, current ratio, cash position
- Competitive moat: brand, switching costs, network effects, cost advantages
- Management quality and capital allocation history

Return a structured fundamental analysis with a 1-5 score for each dimension."""
    }])
    return {"fundamentals": response.content}


def technical_analyst(state: TradingState) -> TradingState:
    """Reads price patterns, moving averages, momentum indicators."""
    import yfinance as yf
    ticker_data = yf.Ticker(state["ticker"])
    hist = ticker_data.history(period="6mo")
    price_summary = f"Current: {hist['Close'].iloc[-1]:.2f}, 50d avg: {hist['Close'].tail(50).mean():.2f}, 200d avg: {hist['Close'].mean():.2f}"

    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a technical analyst. Given this price data for {state['ticker']}:
{price_summary}

Analyze:
- Trend direction (above/below key moving averages)
- Momentum signals (RSI, MACD interpretation)
- Key support and resistance levels
- Volume patterns

Rate the technical setup: Bullish / Neutral / Bearish with reasoning."""
    }])
    return {"technical_signals": response.content}


def news_analyst(state: TradingState) -> TradingState:
    """Scans recent news, earnings calls, and macro events."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a news and events analyst for {state['ticker']}.

Analyze the following dimensions:
- Recent earnings results vs expectations
- Management guidance changes
- Industry tailwinds or headwinds
- Regulatory or competitive threats
- Macro environment impact (rates, inflation, consumer sentiment)

Provide a news sentiment score: Positive / Neutral / Negative with key catalysts."""
    }])
    return {"news_sentiment": response.content}
```

## Step 3: Bull vs Bear Debate

```python
def bull_researcher(state: TradingState) -> TradingState:
    """Builds the strongest possible long thesis."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are an aggressive bull researcher for {state['ticker']}.

Using this analysis:
Fundamentals: {state['fundamentals']}
Technicals: {state['technical_signals']}
News: {state['news_sentiment']}

Build the strongest possible case for buying {state['ticker']}.
Include: price target (12-month), key catalysts, why bears are wrong."""
    }])
    return {"bull_thesis": response.content}


def bear_researcher(state: TradingState) -> TradingState:
    """Builds the strongest possible short/avoid thesis."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a skeptical bear researcher for {state['ticker']}.

Using this analysis:
Fundamentals: {state['fundamentals']}
Technicals: {state['technical_signals']}
News: {state['news_sentiment']}

Build the strongest possible case AGAINST buying {state['ticker']}.
Include: downside scenario, key risks, why bulls are wrong."""
    }])
    return {"bear_thesis": response.content}
```

## Step 4: Risk Manager & Portfolio Manager

```python
def risk_manager(state: TradingState) -> TradingState:
    """Assesses position sizing and downside scenarios."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a risk manager reviewing {state['ticker']}.

Bull thesis: {state['bull_thesis']}
Bear thesis: {state['bear_thesis']}

Assess:
- Probability-weighted return (3 scenarios: bull/base/bear)
- Maximum drawdown risk
- Recommended position size (% of portfolio)
- Stop-loss level
- Key risk factors to monitor"""
    }])
    return {"risk_assessment": response.content}


def portfolio_manager(state: TradingState) -> TradingState:
    """Makes the final investment decision."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are the portfolio manager. Make a final decision on {state['ticker']}.

Full analysis:
- Fundamentals: {state['fundamentals']}
- Technicals: {state['technical_signals']}
- News: {state['news_sentiment']}
- Bull thesis: {state['bull_thesis']}
- Bear thesis: {state['bear_thesis']}
- Risk assessment: {state['risk_assessment']}

Output a structured Investment Memo:
DECISION: [BUY / HOLD / SELL / AVOID]
CONVICTION: [High / Medium / Low]
TIME HORIZON: [months]
ENTRY PRICE TARGET: $X
EXIT TARGET: $X
STOP LOSS: $X
THESIS: [2-3 sentence summary]
KEY RISKS: [bullet list]"""
    }])
    return {"final_decision": response.content}
```

## Step 5: Wire the LangGraph Workflow

```python
def build_trading_graph():
    graph = StateGraph(TradingState)

    graph.add_node("fundamentals", fundamentals_analyst)
    graph.add_node("technical", technical_analyst)
    graph.add_node("news", news_analyst)
    graph.add_node("bull", bull_researcher)
    graph.add_node("bear", bear_researcher)
    graph.add_node("risk", risk_manager)
    graph.add_node("portfolio", portfolio_manager)

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

# Run analysis
app = build_trading_graph()
result = app.invoke({"ticker": "NVDA"})
print(result["final_decision"])
```

## Tips

- **Parallel analysts**: Run fundamentals/technical/news in parallel using `add_edge` from `__start__` to all three, then fan back in.
- **Data sources**: Wire in real data via `yfinance`, Alpha Vantage, or Polygon.io for live results.
- **Memory**: Add a `checkpointer` to LangGraph to resume interrupted analyses.
- **Backtesting**: Store decisions with timestamps and compare against actual price outcomes after 30/90 days.
- **Cost control**: Use `claude-haiku-4-5` for analyst agents and `claude-opus-4-5` only for the portfolio manager.
