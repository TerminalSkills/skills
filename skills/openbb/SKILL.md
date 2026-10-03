---
name: openbb
description: >-
  OpenBB Platform is an open-source Python library, REST API and MCP server that gives one
  interface to financial data: stocks, ETFs, crypto, forex, macro economics and SEC filings.
  Use when building financial analysis tools, feeding market data to AI agents, creating
  quantitative research pipelines, or accessing free financial data APIs from Python.
license: AGPL-3.0
compatibility: "Python 3.10+; openbb 5.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - finance
    - market-data
    - quant
    - openbb
    - ai-agents
  repository: https://github.com/OpenBB-finance/OpenBB
---

# OpenBB

## Overview

OpenBB (Open Data Platform, repository OpenBB-finance/OpenBB, Apache-2.0) turns many financial data sources into one typed Python client (`from openbb import obb`), a FastAPI REST server (`openbb-api`) and an MCP server (`openbb-mcp`). Results are `OBBject` objects with `.to_dataframe()`, `.to_dict()` and `.results`. Checked against openbb 5.0.0 / openbb-core 2.0.1 (2026).

Version 5 is a modular rewrite: `openbb-core` ships no commands, and what you can call depends on which extension packages are installed. Older tutorials (4.x) rely on providers such as `yfinance`, `fmp` and `polygon` that are not part of 5.0; commands like `obb.equity.fundamental.metrics` and `obb.equity.discovery.losers` no longer exist. Always list what you have before writing code (see "Discover what is installed").

## Instructions

### Installation

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "openbb[routers]"     # client + provider extensions + equity/economy/crypto/... routers
```

Plain `pip install openbb` installs the providers (cboe, nasdaq, sec, fred, oecd, ecb, imf, tmx, ...), `obb.news`, charting, the API and MCP servers, but not the `equity`, `economy`, `crypto`, `currency`, `technical` routers; those come with the `[routers]` extra or individual packages (`pip install openbb-equity openbb-technical`). After adding or removing an extension, `openbb-build` regenerates the static package (it also rebuilds on import).

### Discover what is installed

```python
from openbb import obb

print([n for n in dir(obb) if not n.startswith("_")])           # namespaces
print([n for n in dir(obb.equity.fundamental) if not n.startswith("_")])
import inspect
print(inspect.signature(obb.equity.price.historical))
print(obb.equity.price.historical.__annotations__["provider"])   # providers allowed for this command
```

Each command accepts `provider="..."`; without it, the first available provider in the command's priority list is used. In this install `equity.price.historical` accepts `cboe`, `nasdaq`, `tmx`; `crypto.price.historical` only `nasdaq`; `currency.price.historical` `ecb` and `tmx`; `news.company` `nasdaq` and `tmx`.

### Equity data

```python
from openbb import obb

prices = obb.equity.price.historical("AAPL", start_date="2026-01-01", provider="cboe").to_dataframe()
quote = obb.equity.price.quote("AAPL", provider="cboe").to_dataframe()

income = obb.equity.fundamental.income("AAPL", provider="sec", limit=4).to_dataframe()   # SEC filings
ratios = obb.equity.fundamental.ratios("AAPL", limit=4).to_dataframe()                   # nasdaq
hits = obb.equity.search("apple").to_dataframe()
universe = obb.equity.screener(provider="nasdaq").to_dataframe()   # about 7,000 rows: filter in pandas
```

Technical indicators take a DataFrame with a `date` index and `close`: `obb.technical.sma(data=prices, length=20)`, `obb.technical.rsi(data=prices, length=14)`, `obb.technical.macd(data=prices)` (columns `macd`, `signal`, `histogram`).

### Macro, currency, news

```python
cpi = obb.economy.cpi(country="united_states", provider="oecd").to_dataframe()
gdp = obb.economy.gdp.nominal(country="united_states").to_dataframe()
eurusd = obb.currency.price.historical("EURUSD").to_dataframe()
news = obb.news.company("AAPL", limit=5, provider="nasdaq").to_dataframe()

# FRED needs a free key
fedfunds = obb.economy.fred_series("FEDFUNDS", provider="fred").to_dataframe()
```

### Credentials

Providers that need a key read `<PROVIDER>_<CREDENTIAL>` environment variables (they take precedence), then `~/.openbb_platform/user_settings.json`, or you set them per session:

```bash
export FRED_API_KEY="your FRED key from fredaccount.stlouisfed.org"
export BLS_API_KEY="your BLS key"
```

```python
import os
obb.user.credentials.fred_api_key = os.environ["FRED_API_KEY"]
```

A missing key raises `OpenBBError: Missing credential 'fred_api_key'`.

### REST API and MCP server for agents

```bash
openbb-api                                   # http://127.0.0.1:6900, OpenAPI docs at /docs
curl "http://127.0.0.1:6900/api/v1/equity/price/historical?symbol=AAPL&provider=cboe&start_date=2026-09-28"

openbb-mcp --transport stdio                 # default transport is streamable-http on 127.0.0.1:8001
```

The MCP server exposes the installed commands as tools. Limit them with `--allowed-categories` and keep the server on 127.0.0.1. For OpenBB Workspace, add `http://127.0.0.1:6900` as a custom backend in the Apps tab.

### Providers (what each gives, key needed)

| Provider | Data | Key |
|----------|------|-----|
| cboe | US equity prices and quotes, options | none |
| nasdaq | fundamentals, ratios, news, screener, crypto | none |
| sec | EDGAR filings and financial statements | none |
| fred | US macro series | `fred_api_key` (free) |
| oecd, imf, ecb, bls | macro, rates, FX, labor | oecd/imf/ecb none, bls key |
| tmx | Canadian markets | none |

The `openbb-yfinance` extension exists on PyPI only as a 2.0.0 release candidate (July 2026); install it with `pip install --pre openbb-yfinance` only if you accept that.

## Examples

### Example 1: Stock snapshot for an AI agent

**User request:** "Give me a one-call function that summarizes AAPL: last close, 52-week range, latest revenue and net income, and three headlines."

```python
from openbb import obb

def snapshot(ticker: str) -> dict:
    px = obb.equity.price.historical(ticker, start_date="2025-10-01", provider="cboe").to_dataframe()
    inc = obb.equity.fundamental.income(ticker, provider="sec", limit=1).to_dataframe()
    news = obb.news.company(ticker, limit=3, provider="nasdaq").to_dataframe()
    return {
        "ticker": ticker,
        "last_close": float(px["close"].iloc[-1]),
        "range_52w": (float(px["low"].tail(252).min()), float(px["high"].tail(252).max())),
        "revenue": inc["total_revenue"].iloc[0],
        "headlines": news["title"].tolist(),
    }

print(snapshot("AAPL"))
```

The agent checks column names with `inc.columns` first, since they differ between providers (`total_revenue` for sec, `revenue` for nasdaq). The result is a dict with the last close, a (low, high) tuple and three titles.

### Example 2: Inflation versus rates without paid keys

**User request:** "Plot US inflation against the policy rate since 2020 using free data."

The agent calls `obb.economy.cpi(country="united_states", provider="oecd", start_date="2020-01-01")` and `obb.economy.interest_rates(country="united_states", provider="oecd")`, joins the two DataFrames on `date`, and plots both series with matplotlib. If the user has a FRED key, it swaps in `provider="fred"` for daily-fresh series.

## Guidelines

- Do not copy 4.x snippets: check `dir(obb.<namespace>)` and the provider list of a command before using it.
- Pass `provider=` explicitly in agent code so results do not change when you install another extension.
- Free providers have delays, rate limits and gaps (`crypto.price.historical("BTC-USD")` returned no rows in testing); handle `EmptyDataError` and `OpenBBError`.
- Market data is not investment advice; cite the provider and date in anything shown to users.
- Never hard-code API keys; use environment variables or `~/.openbb_platform/.env`.
- Run `openbb-api` and `openbb-mcp` on 127.0.0.1 only.
- Not a fit for tick-level or low-latency trading data.

## Resources

- [Documentation](https://docs.openbb.co)
- [Repository and README](https://github.com/OpenBB-finance/OpenBB)
- [Agents for OpenBB](https://github.com/OpenBB-finance/agents-for-openbb)
