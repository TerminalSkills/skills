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
  version: "1.0.0"
  category: data-ai
  tags:
    - finance
    - market-data
    - quant
    - openbb
    - ai-agents
---

# OpenBB

Open Data Platform for financial data. Connect once, consume everywhere — Python for quants, REST API for apps, MCP server for AI agents. Access stocks, crypto, forex, macro indicators, and alternative data.

GitHub: [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB)

## Overview

OpenBB is an open-source financial data platform that aggregates data from multiple providers (Yahoo Finance, FRED, SEC, FMP, Polygon, and more). It offers a Python SDK, REST API server, and MCP server for AI agents, covering equities, crypto, forex, macro economics, and news.

## Instructions

### Installation

```bash
# Core package
pip install openbb

# With all data providers
pip install "openbb[all]"
```

### Quick Start

```python
from openbb import obb

# Stock price history
output = obb.equity.price.historical("AAPL")
df = output.to_dataframe()
print(df.head())
```

### Equity Data

```python
# Historical prices
df = obb.equity.price.historical("AAPL", start_date="2025-01-01").to_dataframe()

# Real-time quote
quote = obb.equity.price.quote("AAPL").to_dataframe()

# Fundamental analysis
income = obb.equity.fundamental.income("AAPL", period="annual").to_dataframe()
balance = obb.equity.fundamental.balance("AAPL").to_dataframe()
metrics = obb.equity.fundamental.metrics("AAPL").to_dataframe()

# Technical indicators
df = obb.equity.price.historical("AAPL", start_date="2025-01-01").to_dataframe()
sma = obb.technical.sma(data=df, length=20)
rsi = obb.technical.rsi(data=df, length=14)
macd = obb.technical.macd(data=df)
```

### Crypto, Forex, and Macro

```python
# Crypto
btc = obb.crypto.price.historical("BTC-USD").to_dataframe()

# Forex
eurusd = obb.currency.price.historical("EUR/USD").to_dataframe()

# Macro economics
gdp = obb.economy.gdp.nominal(country="united_states").to_dataframe()
cpi = obb.economy.cpi(country="united_states").to_dataframe()
rates = obb.economy.fred_series("FEDFUNDS").to_dataframe()
```

### AI Agent Integration

Run OpenBB as an API server:

```bash
openbb-api
# Launches FastAPI at http://127.0.0.1:6900
```

Query from any language:

```bash
curl http://127.0.0.1:6900/api/v1/equity/price/historical?symbol=AAPL
```

OpenBB also exposes an MCP server so AI agents can query financial data directly.

### Data Providers

| Provider | Data | Free Tier |
|----------|------|-----------|
| Yahoo Finance | Prices, fundamentals | Yes |
| FRED | Macro economics | Yes |
| SEC (EDGAR) | Filings, insider trades | Yes |
| FMP | Fundamentals, estimates | Limited |
| Polygon | Real-time prices | Limited |

```python
# Use a specific provider
obb.equity.price.historical("AAPL", provider="yfinance")

# Set API keys for premium providers
obb.user.credentials.fmp_api_key = "your_key"
```

## Examples

### Example 1: Full Stock Analysis Pipeline

```python
from openbb import obb

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

analysis = analyze_stock("AAPL")
```

### Example 2: Screening and Discovery

```python
# Stock screener — find undervalued dividend stocks
screener = obb.equity.screener(
    market_cap_min=1e9,
    pe_ratio_max=20,
    dividend_yield_min=2.0
).to_dataframe()

# Top gainers/losers
gainers = obb.equity.discovery.gainers().to_dataframe()
losers = obb.equity.discovery.losers().to_dataframe()

# Company news
news = obb.news.company("AAPL", limit=20).to_dataframe()
```

## Guidelines

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
- [Discord](https://discord.com/invite/xPHTuHCmuV)
