---
title: Build a Multi-Agent AI Trading Framework
slug: build-ai-trading-framework
description: Build a multi-agent LLM system that screens stocks, debates investment theses, and generates research-grade investment memos — using specialized analyst agents, a bull-vs-bear debate, and a portfolio manager making the final call.
skills:
  - trading-agents
  - langchain
  - anthropic-sdk
category: finance
tags:
  - trading
  - finance
  - multi-agent
  - investment
  - stocks
  - llm
  - analysis
---

## The Problem

Daniel is a quant analyst at a mid-size hedge fund. His team screens 500+ stocks each quarter using a combination of Bloomberg terminals, earnings call transcripts, and gut feel. The process is slow, inconsistent, and dependent on whoever is covering each sector. When two analysts look at the same stock, their conclusions often differ wildly — not because of different data, but because of different analytical frameworks and cognitive biases.

He wants a system that applies a consistent, rigorous analytical framework to every stock — examining fundamentals, technical signals, and news sentiment — then generates a structured investment memo that his team can review and act on. The system should think like a trading firm: multiple specialists, a structured debate, and a senior PM making the final call.

## The Solution

Use `trading-agents` to build a LangGraph-orchestrated multi-agent system. Specialized analyst agents each own a domain (fundamentals, technicals, news). A bull and bear researcher debate the thesis. A risk manager quantifies downside. A portfolio manager synthesizes everything into a final investment memo. The entire workflow takes ~2 minutes per stock.

## Step-by-Step Walkthrough

### Step 1: Environment Setup

```bash
pip install langchain-anthropic langgraph yfinance requests
export ANTHROPIC_API_KEY="your-key"
```

### Step 2: Define State and Initialize Models

```python
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from typing import TypedDict
import yfinance as yf

class TradingState(TypedDict):
    ticker: str
    company_name: str
    sector: str
    fundamentals: str
    technical_signals: str
    news_sentiment: str
    bull_thesis: str
    bear_thesis: str
    risk_assessment: str
    final_decision: str

# Use powerful model for high-stakes decisions, fast model for analysis
analyst_llm = ChatAnthropic(model="claude-haiku-4-5")
pm_llm = ChatAnthropic(model="claude-opus-4-5")
```

### Step 3: Analyst Agents — Parallel Data Analysis

```python
def fundamentals_analyst(state: TradingState) -> TradingState:
    """Pulls financial data and assesses company fundamentals."""
    ticker_obj = yf.Ticker(state["ticker"])
    info = ticker_obj.info

    # Extract key metrics
    metrics = {
        "pe_ratio": info.get("trailingPE", "N/A"),
        "revenue_growth": info.get("revenueGrowth", "N/A"),
        "profit_margin": info.get("profitMargins", "N/A"),
        "debt_to_equity": info.get("debtToEquity", "N/A"),
        "free_cash_flow": info.get("freeCashflow", "N/A"),
        "return_on_equity": info.get("returnOnEquity", "N/A"),
        "market_cap": info.get("marketCap", "N/A"),
    }

    response = analyst_llm.invoke([{
        "role": "user",
        "content": f"""Analyze the fundamentals of {state['ticker']} ({state['company_name']}) in the {state['sector']} sector.

Financial metrics:
{metrics}

Assess:
1. Valuation: Is the P/E justified by growth?
2. Profitability: Are margins expanding or contracting?
3. Balance sheet: Can the company fund its growth?
4. Competitive position: Does this company have durable advantages?

Score each dimension 1-5 and provide an overall fundamental rating."""
    }])

    return {"fundamentals": response.content}


def technical_analyst(state: TradingState) -> TradingState:
    """Analyzes price action and momentum signals."""
    ticker_obj = yf.Ticker(state["ticker"])
    hist = ticker_obj.history(period="1y")

    if hist.empty:
        return {"technical_signals": "Insufficient price data"}

    current_price = hist["Close"].iloc[-1]
    ma_50 = hist["Close"].tail(50).mean()
    ma_200 = hist["Close"].mean()
    ytd_return = (current_price / hist["Close"].iloc[0] - 1) * 100
    volatility = hist["Close"].pct_change().std() * (252 ** 0.5) * 100

    response = analyst_llm.invoke([{
        "role": "user",
        "content": f"""Technical analysis for {state['ticker']}:

Current Price: ${current_price:.2f}
50-day MA: ${ma_50:.2f} ({'above' if current_price > ma_50 else 'below'})
200-day MA: ${ma_200:.2f} ({'above' if current_price > ma_200 else 'below'})
YTD Return: {ytd_return:.1f}%
Annualized Volatility: {volatility:.1f}%

Assess:
1. Trend: Uptrend, downtrend, or consolidation?
2. Momentum: Accelerating or decelerating?
3. Risk: Is volatility elevated?
4. Setup: Is this an attractive entry point technically?

Provide a technical rating: Strong Buy / Buy / Neutral / Avoid / Strong Avoid"""
    }])

    return {"technical_signals": response.content}


def news_analyst(state: TradingState) -> TradingState:
    """Analyzes recent news and sector sentiment."""
    response = analyst_llm.invoke([{
        "role": "user",
        "content": f"""News and sentiment analysis for {state['ticker']} ({state['company_name']}).
Sector: {state['sector']}

Based on your training data and general knowledge of this company:
1. Recent earnings: Did they beat or miss expectations?
2. Guidance: Is management optimistic or cautious about the outlook?
3. Industry trends: What macro tailwinds or headwinds affect this sector?
4. Recent events: Any acquisitions, product launches, regulatory actions?
5. Sentiment: How does Wall Street view this stock currently?

Provide an overall news/sentiment score: Positive / Neutral / Negative"""
    }])

    return {"news_sentiment": response.content}
```

### Step 4: Bull vs Bear Researcher Debate

```python
def bull_researcher(state: TradingState) -> TradingState:
    """Constructs the strongest possible case for buying this stock."""
    response = pm_llm.invoke([{
        "role": "user",
        "content": f"""You are an aggressive bull researcher. Build the STRONGEST possible case for buying {state['ticker']}.

Data available:
- Fundamentals: {state['fundamentals']}
- Technicals: {state['technical_signals']}
- News/Sentiment: {state['news_sentiment']}

Your bull thesis must include:
1. Core investment thesis (1-2 sentences)
2. Three strongest bull arguments with supporting evidence
3. Addressable market and growth opportunity
4. Price target (12-month) with methodology
5. Key catalysts that could drive outperformance
6. Why bears are wrong about the main risks

Be specific and data-driven. Steelman the long case."""
    }])

    return {"bull_thesis": response.content}


def bear_researcher(state: TradingState) -> TradingState:
    """Constructs the strongest possible case against buying this stock."""
    response = pm_llm.invoke([{
        "role": "user",
        "content": f"""You are a skeptical bear researcher. Build the STRONGEST possible case AGAINST buying {state['ticker']}.

Data available:
- Fundamentals: {state['fundamentals']}
- Technicals: {state['technical_signals']}
- News/Sentiment: {state['news_sentiment']}

Your bear thesis must include:
1. Core concern (1-2 sentences)
2. Three strongest bear arguments with evidence
3. Valuation risk: what happens if multiples compress?
4. Downside price target (12-month) with methodology
5. Key risks that could cause underperformance
6. Why bulls are wrong about the core thesis

Be specific and merciless. Steelman the short case."""
    }])

    return {"bear_thesis": response.content}
```

### Step 5: Risk Manager Assessment

```python
def risk_manager(state: TradingState) -> TradingState:
    """Quantifies risk and recommends position sizing."""
    response = pm_llm.invoke([{
        "role": "user",
        "content": f"""You are a risk manager reviewing {state['ticker']}.

Bull thesis: {state['bull_thesis']}
Bear thesis: {state['bear_thesis']}

Provide a risk assessment:
1. Probability weights: Bull scenario (%), Base scenario (%), Bear scenario (%)
2. Expected returns for each scenario
3. Probability-weighted expected return
4. Maximum drawdown risk (worst-case %)
5. Recommended position size as % of portfolio
6. Stop-loss level ($) and rationale
7. Key risk factors to monitor weekly

Be quantitative. Use the debate to ground your probability estimates."""
    }])

    return {"risk_assessment": response.content}
```

### Step 6: Portfolio Manager — Generate Investment Memo

```python
def portfolio_manager(state: TradingState) -> TradingState:
    """Makes final decision and writes the investment memo."""
    response = pm_llm.invoke([{
        "role": "user",
        "content": f"""You are the Portfolio Manager. Write a final investment memo for {state['ticker']}.

FULL ANALYSIS PACKAGE:
Fundamentals: {state['fundamentals']}
Technicals: {state['technical_signals']}
News/Sentiment: {state['news_sentiment']}
Bull Thesis: {state['bull_thesis']}
Bear Thesis: {state['bear_thesis']}
Risk Assessment: {state['risk_assessment']}

FORMAT YOUR MEMO EXACTLY AS FOLLOWS:

═══════════════════════════════════════
INVESTMENT MEMO: {state['ticker']}
Date: [today]
═══════════════════════════════════════

DECISION: [BUY / ADD / HOLD / REDUCE / SELL / AVOID]
CONVICTION: [High / Medium / Low]
TIME HORIZON: [X months]

ENTRY ZONE: $X.XX – $X.XX
PRICE TARGET (12M): $X.XX  (+XX%)
STOP LOSS: $X.XX  (-XX%)
POSITION SIZE: X% of portfolio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INVESTMENT THESIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3-4 sentences: why this stock, why now]

KEY BULL POINTS
• [point 1]
• [point 2]
• [point 3]

KEY RISKS
• [risk 1]
• [risk 2]
• [risk 3]

MONITORING CHECKLIST
□ [check 1]
□ [check 2]
□ [check 3]
═══════════════════════════════════════"""
    }])

    return {"final_decision": response.content}
```

### Step 7: Backtest Decision Storage

```python
import json
from datetime import datetime

def save_decision(state: TradingState):
    """Stores decision for backtesting — compare against actual returns later."""
    decision_log = {
        "ticker": state["ticker"],
        "date": datetime.now().isoformat(),
        "decision": state["final_decision"],
        "price_at_decision": yf.Ticker(state["ticker"]).history(period="1d")["Close"].iloc[-1]
    }

    try:
        with open("trading_decisions.json", "r") as f:
            log = json.load(f)
    except FileNotFoundError:
        log = []

    log.append(decision_log)
    with open("trading_decisions.json", "w") as f:
        json.dump(log, f, indent=2)
```

### Step 8: Wire It All Together

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

# Run analysis on a stock
app = build_trading_graph()

result = app.invoke({
    "ticker": "NVDA",
    "company_name": "NVIDIA Corporation",
    "sector": "Semiconductors",
    "fundamentals": "",
    "technical_signals": "",
    "news_sentiment": "",
    "bull_thesis": "",
    "bear_thesis": "",
    "risk_assessment": "",
    "final_decision": ""
})

print(result["final_decision"])
save_decision(result)
```

## Tips & Extensions

- **Batch screening**: Loop over a watchlist of 20 tickers, store memos, rank by conviction score.
- **Parallel analysts**: Use LangGraph's `Send` API to run fundamentals, technical, and news agents simultaneously.
- **Real news data**: Integrate with NewsAPI, Alpha Vantage News, or Polygon.io for actual recent headlines.
- **Backtest comparison**: After 30/90 days, compare the decision against actual returns to score model accuracy.
- **Sector rotation**: Add a macro agent that assesses sector attractiveness before drilling into individual stocks.
