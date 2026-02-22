---
name: unusual-whales-api
category: data
tags:
  - finance
  - options
  - trading
  - api
  - dark-pool
  - market-data
  - stocks
version: 1.0.0
description: >
  Query the Unusual Whales API for unusual options flow, dark pool prints,
  market tide sentiment, gamma exposure, congressional trading, and stock
  greeks. Use when someone asks about "unusual options activity", "whale trades",
  "dark pool prints", "market sentiment", "gamma exposure", "GEX",
  "congressional trading", "insider trading", or needs real-time and historical
  market data for trading analysis and AI agent integration.
author: terminal-skills
---

# Unusual Whales API

Query the Unusual Whales API for institutional-grade market data — unusual options flow, dark pool prints, market tide sentiment, gamma exposure, congressional trading, and stock greeks.

## When to Use

Use this skill when the user asks for financial data related to:

- Unusual options activity, "whale" trades, flow alerts, or "hottest chains"
- Dark pool prints, trades, or levels
- Market sentiment (Market Tide, Net Premium, Put/Call ratios)
- Insider trading, politician trading, or specific stock/option details (Greeks, IV)
- Gamma exposure (GEX) analysis
- Building AI-powered trading systems or market analysis tools

## Prerequisites

- Unusual Whales API key (get one at https://unusualwhales.com/api_lander)
- Set `UNUSUAL_WHALES_API_TOKEN` in your environment
- Pricing starts at $50/week or $150/month

## Instructions

### Critical Rules (Anti-Hallucination Protocol)

**Base URL:** Always use `https://api.unusualwhales.com`

**Authentication:** All requests MUST include the header:
```
Authorization: Bearer <API_TOKEN>
```

**Method:** All endpoints are GET requests. Never use POST, PUT, or DELETE.

**Strict Whitelist:** You may ONLY use endpoints listed in the "Valid Endpoint Reference" section below. If a URL is not on that list, it does not exist.

### Hallucination Blacklist (NEVER USE THESE)

These endpoints are fake but commonly hallucinated by AI models:

- ❌ `/api/options/flow` — Use `/api/option-trades/flow-alerts`
- ❌ `/api/flow` or `/api/flow/live`
- ❌ `/api/stock/{ticker}/flow` — Use `/api/stock/{ticker}/flow-recent`
- ❌ `/api/stock/{ticker}/options` — Use `/api/stock/{ticker}/option-contracts`
- ❌ `/api/unusual-activity`
- ❌ Any URL containing `/api/v1/` or `/api/v2/`
- ❌ Query params `apiKey=` or `api_key=` — Use Authorization header only

### Concept Mapping

Translate user intent to the correct endpoint:

- "Live Flow" / "Whale Trades" / "Option Flow" → `/api/option-trades/flow-alerts`
- "Options Filter" / "Options Screener" / "Flow Filter" → `/api/screener/option-contracts`
- "Market Sentiment" → `/api/market/market-tide`
- "Dark Pool" → `/api/darkpool/recent` or `/api/darkpool/{ticker}`
- "Contract Greeks" → `/api/stock/{ticker}/greeks`
- "Spot Gamma" / "Spot GEX" / "GEX" / "Gamma Exposure" → `/api/stock/{ticker}/spot-exposures/strike`

## Valid Endpoint Reference

### Core Data & Flow

- **Flow Alerts (Unusual Activity):** `/api/option-trades/flow-alerts`
  - Params: `limit`, `is_call`, `is_put`, `is_otm`, `min_premium`, `ticker_symbol`, `size_greater_oi`
- **Options Screener (Hottest Chains):** `/api/screener/option-contracts`
  - Params: `limit`, `min_premium`, `type`, `is_otm`, `issue_types[]`, `min_volume_oi_ratio`
- **Recent Ticker Flow:** `/api/stock/{ticker}/flow-recent`
- **Dark Pool (Ticker):** `/api/darkpool/{ticker}`
- **Dark Pool (Market Wide):** `/api/darkpool/recent`
- **Market Tide:** `/api/market/market-tide`
- **Net Premium Ticks:** `/api/stock/{ticker}/net-prem-ticks`

### Options, Greeks & IV

- **Option Contracts List:** `/api/stock/{ticker}/option-contracts`
- **Greeks for Each Strike & Expiry:** `/api/stock/{ticker}/greeks`
- **Static Gamma Exposure (GEX) by Strike:** `/api/stock/{ticker}/greek-exposure/strike`
- **Spot Gamma Exposure (GEX) by Strike:** `/api/stock/{ticker}/spot-exposures/strike`
- **Interpolated IV and Percentiles:** `/api/stock/{ticker}/interpolated-iv`
- **Options Volume/PC Ratio:** `/api/stock/{ticker}/options-volume`

### Other Data

- **Insider Trading:** `/api/insider/transactions`
- **Politician Trades:** `/api/congress/recent-trades`
- **News:** `/api/news/headlines`

## Examples

### Example 1: Detect Smart Money Sweeps

**User prompt:** "Show me the latest unusual option trades for TSLA."

```python
# unusual_whales_flow.py — Fetch unusual options flow alerts for a ticker
import httpx

url = "https://api.unusualwhales.com/api/option-trades/flow-alerts"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
params = {
    "ticker_symbol": "TSLA",
    "min_premium": 50_000,       # Minimum $50K premium
    "size_greater_oi": True,     # Opening trades where size > open_interest
    "limit": 10,
    "is_otm": True               # Out-of-the-money only
}
response = httpx.get(url, headers=headers, params=params)
trades = response.json().get("data", [])

for trade in trades:
    print(f"{trade['ticker']} | {trade['type']} | ${trade['total_premium']:,.0f}")
```

### Example 2: Screen for Unusually Bullish Activity

**User prompt:** "Show me unusually bullish option activity for today."

```python
# unusual_whales_screener.py — Screen for bullish options activity
import httpx

url = "https://api.unusualwhales.com/api/screener/option-contracts"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
params = {
    "limit": 150,
    "is_otm": True,
    "issue_types[]": ["Common Stock", "ADR"],
    "max_dte": 183,                    # Max 6 months to expiry
    "max_multileg_volume_ratio": 0.1,  # Filter out spread trades
    "min_ask_perc": 0.7,               # Aggressive buyers (paying near ask)
    "min_volume": 500,
    "min_premium": 250_000,            # $250K+ premium
    "type": "Calls",                   # Bullish = calls
    "vol_greater_oi": True,            # Volume exceeds open interest
}
response = httpx.get(url, headers=headers, params=params)
data = response.json().get("data", [])

for contract in data:
    print(f"{contract['ticker_symbol']} {contract['option_symbol']} | Vol: {contract.get('ask_side_volume')}")
```

### Example 3: Monitor Dark Pool Activity

**User prompt:** "Any big dark pool prints on NVDA?"

```python
# unusual_whales_darkpool.py — Fetch dark pool trades for a ticker
import httpx

url = "https://api.unusualwhales.com/api/darkpool/NVDA"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
response = httpx.get(url, headers=headers)
prints = response.json().get("data", [])

for p in prints:
    notional = float(p['price']) * int(p['size'])
    print(f"${notional:,.0f} | {p['size']} shares @ ${p['price']} | {p['executed_at']}")
```

### Example 4: Check Market Sentiment

**User prompt:** "What is the overall market sentiment right now?"

```python
# unusual_whales_tide.py — Fetch market tide sentiment data
import httpx

url = "https://api.unusualwhales.com/api/market/market-tide"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
params = {"interval_5m": False}  # Full day view
response = httpx.get(url, headers=headers, params=params)
data = response.json().get("data", [])

latest = data[-1] if data else {}
net_call = float(latest.get('net_call_premium', 0))
net_put = float(latest.get('net_put_premium', 0))
sentiment = "BULLISH" if net_call > net_put else "BEARISH"
print(f"Market Tide: {sentiment} | Calls: ${net_call:,.0f} | Puts: ${net_put:,.0f}")
```

### Example 5: Gamma Exposure Analysis

**User prompt:** "Show me the gamma exposure for RIVN by strike."

```python
# unusual_whales_gex.py — Fetch spot gamma exposure by strike
import httpx

url = "https://api.unusualwhales.com/api/stock/RIVN/spot-exposures/strike"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
response = httpx.get(url, headers=headers)
data = response.json().get("data", [])

for level in sorted(data, key=lambda x: abs(float(x.get('call_gamma_oi', 0))), reverse=True)[:10]:
    print(f"Strike ${level['strike']} | Call GEX: {level.get('call_gamma_oi')} | Put GEX: {level.get('put_gamma_oi')}")
```

### Example 6: Track Congressional Trading

**User prompt:** "Show me recent congressional stock trades."

```python
# unusual_whales_congress.py — Fetch politician trading disclosures
import httpx

url = "https://api.unusualwhales.com/api/congress/recent-trades"
headers = {"Authorization": "Bearer YOUR_TOKEN"}
response = httpx.get(url, headers=headers)
trades = response.json().get("data", [])

for trade in trades[:20]:
    print(f"{trade.get('politician')} | {trade.get('ticker')} | {trade.get('type')} | {trade.get('amount')}")
```

## Guidelines

- Always use the Authorization header, never query parameters for authentication
- Check the hallucination blacklist before generating any endpoint URL
- Use `size_greater_oi=True` to filter for opening positions (new money entering)
- Use `is_otm=True` to filter for out-of-the-money options (higher leverage bets)
- `min_premium` is in dollars — use 50000 for $50K, 500000 for $500K
- Dark pool data is delayed ~15 minutes from execution
- Market Tide with `interval_5m=False` gives full-day aggregated view
- Congressional trading data reflects filed disclosures, not real-time trades
- For WebSocket streaming (live feeds), an Advanced tier subscription is required
- Rate limits apply — check response headers for `X-RateLimit-Remaining`
