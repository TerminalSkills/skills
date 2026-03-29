---
name: openbb
description: >-
  Access financial data for analysis, quantitative research, and AI agents using OpenBB
  platform — stocks, crypto, forex, macro economics, alternative data. Use when: building
  financial analysis tools, feeding market data to AI agents, creating quantitative research
  pipelines, accessing free financial data APIs.
license: AGPL-3.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: 1.0.0
  category: finance
  tags:
    - finance
    - stocks
    - market-data
    - quant
    - openbb
    - trading
    - crypto
    - ai-agents
  use-cases:
    - "Pull stock fundamentals, technical indicators, and news for AI analysis"
    - "Build a quantitative research pipeline with free financial data"
    - "Feed real-time market data to AI trading agents"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# OpenBB

Open Data Platform for financial data. Connect once, consume everywhere — Python for quants, REST API for apps, MCP server for AI agents. Access stocks, crypto, forex, macro indicators, and alternative data.

GitHub: [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB)

## Installation

```bash
# Core package
pip install openbb

# With all data providers
pip install "openbb[all]"
```

## Quick Start

```python
from openbb import obb

# Stock price history
output = obb.equity.price.historical("AAPL")
df = output.to_dataframe()
print(df.head())
```

Output:

```
            open    high     low   close    volume
2026-03-24  178.5  180.2  177.8  179.6  52340000
2026-03-25  179.8  181.5  179.0  180.9  48210000
...
```

## Equity Data

### Price and Historical Data

```python
# Historical prices
df = obb.equity.price.historical("AAPL", start_date="2025-01-01").to_dataframe()

# Real-time quote
quote = obb.equity.price.quote("AAPL").to_dataframe()

# Multiple tickers
df = obb.equity.price.historical("AAPL,MSFT,GOOGL").to_dataframe()
```

### Fundamental Analysis

```python
# Income statement
income = obb.equity.fundamental.income("AAPL", period="annual").to_dataframe()

# Balance sheet
balance = obb.equity.fundamental.balance("AAPL").to_dataframe()

# Cash flow
cashflow = obb.equity.fundamental.cash("AAPL").to_dataframe()

# Key metrics
metrics = obb.equity.fundamental.metrics("AAPL").to_dataframe()

# Earnings estimates
earnings = obb.equity.estimates.consensus("AAPL").to_dataframe()
```

### Technical Indicators

```python
# Get price data first
df = obb.equity.price.historical("AAPL", start_date="2025-01-01").to_dataframe()

# Moving averages
from openbb_technical import moving_averages
sma = obb.technical.sma(data=df, length=20)

# RSI
rsi = obb.technical.rsi(data=df, length=14)

# MACD
macd = obb.technical.macd(data=df)

# Bollinger Bands
bb = obb.technical.bbands(data=df, length=20, std=2)
```

### Screening and Discovery

```python
# Stock screener
screener = obb.equity.screener(
    market_cap_min=1e9,
    pe_ratio_max=20,
    dividend_yield_min=2.0
).to_dataframe()

# Top gainers/losers
gainers = obb.equity.discovery.gainers().to_dataframe()
losers = obb.equity.discovery.losers().to_dataframe()

# IPO calendar
ipos = obb.equity.calendar.ipo().to_dataframe()
```

## Crypto Data

```python
# Crypto price history
btc = obb.crypto.price.historical("BTC-USD").to_dataframe()

# Multiple cryptos
crypto = obb.crypto.price.historical("BTC-USD,ETH-USD,SOL-USD").to_dataframe()
```

## Forex Data

```python
# Currency pair history
eurusd = obb.currency.price.historical("EUR/USD").to_dataframe()

# Available pairs
pairs = obb.currency.search("EUR").to_dataframe()
```

## Macro Economics

```python
# GDP data
gdp = obb.economy.gdp.nominal(country="united_states").to_dataframe()

# CPI / Inflation
cpi = obb.economy.cpi(country="united_states").to_dataframe()

# Interest rates
rates = obb.economy.fred_series("FEDFUNDS").to_dataframe()

# Unemployment
unemployment = obb.economy.fred_series("UNRATE").to_dataframe()

# Economic calendar
calendar = obb.economy.calendar().to_dataframe()
```

## News and Sentiment

```python
# Company news
news = obb.news.company("AAPL", limit=20).to_dataframe()

# Market news
market_news = obb.news.world(limit=20).to_dataframe()
```

## AI Agent Integration

### REST API Server

Run OpenBB as an API server for any application:

```bash
openbb-api
# Launches FastAPI at http://127.0.0.1:6900
```

Then query from any language:

```bash
curl http://127.0.0.1:6900/api/v1/equity/price/historical?symbol=AAPL
```

### MCP Server for AI Agents

OpenBB exposes an MCP server — AI agents can query financial data directly:

```python
# In your AI agent setup, connect to OpenBB MCP
# The agent can then make calls like:
# "Get me AAPL's revenue growth for the last 4 quarters"
# "Compare P/E ratios of FAANG stocks"
```

### Building a Research Pipeline

```python
from openbb import obb
import pandas as pd

def analyze_stock(ticker: str) -> dict:
    """Full analysis for AI agent consumption."""
    price = obb.equity.price.historical(ticker, start_date="2025-01-01").to_dataframe()
    fundamentals = obb.equity.fundamental.metrics(ticker).to_dataframe()
    news = obb.news.company(ticker, limit=5).to_dataframe()

    return {
        "ticker": ticker,
        "current_price": price["close"].iloc[-1],
        "52w_high": price["high"].max(),
        "52w_low": price["low"].min(),
        "pe_ratio": fundamentals["pe_ratio"].iloc[0] if len(fundamentals) > 0 else None,
        "market_cap": fundamentals["market_cap"].iloc[0] if len(fundamentals) > 0 else None,
        "recent_news": news["title"].tolist() if len(news) > 0 else [],
    }

# Feed to AI agent
analysis = analyze_stock("AAPL")
```

### OpenBB Workspace Integration

Connect the API to the OpenBB Workspace UI for visual analytics:

1. Start API: `openbb-api`
2. Go to [pro.openbb.co](https://pro.openbb.co)
3. Apps → Connect Backend → URL: `http://127.0.0.1:6900`

## Data Providers

OpenBB aggregates data from multiple providers:

| Provider | Data | Free Tier |
|----------|------|-----------|
| Yahoo Finance | Prices, fundamentals | ✅ |
| FRED | Macro economics | ✅ |
| SEC (EDGAR) | Filings, insider trades | ✅ |
| FMP | Fundamentals, estimates | Limited |
| Polygon | Real-time prices | Limited |
| Intrinio | Fundamentals | Paid |
| Benzinga | News, ratings | Paid |

Configure providers:

```python
# Use a specific provider
obb.equity.price.historical("AAPL", provider="yfinance")

# Set API keys for premium providers
obb.user.credentials.fmp_api_key = "your_key"
obb.user.credentials.polygon_api_key = "your_key"
```

## Tips

- Start with `pip install openbb` (core) — add `[all]` only if you need every provider
- Use `.to_dataframe()` on all outputs for pandas integration
- Free data from Yahoo Finance and FRED covers most research needs
- Run `openbb-api` to expose data to non-Python applications
- The MCP server lets AI agents query financial data autonomously
- Check [docs.openbb.co/python/reference](https://docs.openbb.co/python/reference) for all available endpoints

## Resources

- [Documentation](https://docs.openbb.co)
- [Python Reference](https://docs.openbb.co/python/reference)
- [OpenBB Workspace](https://pro.openbb.co)
- [Agents for OpenBB](https://github.com/OpenBB-finance/agents-for-openbb)
- [Backends for OpenBB](https://github.com/OpenBB-finance/backends-for-openbb)
- [Discord](https://discord.com/invite/xPHTuHCmuV)
- [Colab Notebook](https://colab.research.google.com/github/OpenBB-finance/OpenBB/blob/develop/examples/googleColab.ipynb)
