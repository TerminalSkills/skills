---
name: prediction-markets
description: >-
  Build tools and dashboards for prediction markets — Polymarket, Manifold,
  Kalshi, and Metaculus. Use when tasks involve fetching prediction market data,
  building probability dashboards, analyzing market liquidity, creating trading
  bots for prediction markets, visualizing event probabilities, or tracking
  forecasting accuracy. Covers both API integration and market analysis.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - prediction-markets
    - polymarket
    - kalshi
    - forecasting
    - probability
---

# Prediction Markets

## Overview

Build tools for prediction market platforms — fetch data, analyze markets, create dashboards, and implement trading strategies. Cover Polymarket, Kalshi, Manifold, and Metaculus APIs.

## Instructions

### Platform overview

```
Platform     | Type              | Markets          | API       | Trading
-------------|-------------------|------------------|-----------|--------
Polymarket   | Crypto (Polygon)  | Binary/Multi     | REST+WS   | CLOB, wallet-signed orders
Kalshi       | Regulated (US)    | Binary events    | REST+WS+FIX | CLOB, API-key-signed orders
Manifold     | Play money (mana) | Any question     | REST      | AMM
Metaculus    | Forecasting       | Probability est. | REST      | No trading (API needs an account token)
```

### Polymarket API

Polymarket is the largest by volume. Reading market data needs no authentication. Three public hosts matter: Gamma (discovery and metadata), CLOB (prices, order books, history) and Data (positions, trades). Docs: https://docs.polymarket.com.

Gamma returns `outcomes`, `outcomePrices` and `clobTokenIds` as JSON-encoded strings, so parse them. Price and book endpoints take the outcome **token ID** (from `clobTokenIds`), not the `conditionId`.

```python
# polymarket_client.py

import json
import requests

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"

def get_active_events(limit: int = 100, offset: int = 0) -> list:
    """Fetch active events sorted by 24h volume (each has a `markets` list)."""
    resp = requests.get(f"{GAMMA_API}/events", params={
        "limit": limit, "offset": offset,
        "active": "true", "closed": "false",
        "order": "volume24hr", "ascending": "false",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()

def outcome_prices(market: dict) -> dict:
    """Map outcome label to price, e.g. {'Yes': 0.62, 'No': 0.38}."""
    labels = json.loads(market["outcomes"])
    prices = json.loads(market["outcomePrices"])
    return {l: float(p) for l, p in zip(labels, prices)}

def get_midpoint(token_id: str) -> float:
    r = requests.get(f"{CLOB_API}/midpoint", params={"token_id": token_id}, timeout=15)
    return float(r.json()["mid"])

def get_market_history(token_id: str, interval: str = "1d", fidelity: int = 60) -> list:
    """Price history for one outcome token: [{'t': unix_seconds, 'p': price}, ...]."""
    resp = requests.get(f"{CLOB_API}/prices-history", params={
        "market": token_id, "interval": interval, "fidelity": fidelity}, timeout=15)
    return resp.json().get("history", [])
```

Other CLOB reads: `GET /book?token_id=...` (bids and asks), `GET /price?token_id=...&side=BUY`. Placing orders needs a funded wallet and the official unified SDKs (see the docs, "Place Your First Order"); never put a private key in code, read it from an environment variable.

### Market analysis

```python
# market_analyzer.py
import json

def find_arbitrage_opportunities(markets: list, threshold: float = 0.02) -> list:
    """Find Gamma binary markets whose outcome prices don't sum to ~1.0."""
    opportunities = []
    for market in markets:
        if not market.get('outcomePrices'):
            continue
        prices = [float(p) for p in json.loads(market['outcomePrices'])]
        if len(prices) == 2:
            total = sum(prices)
            if abs(total - 1.0) > threshold:
                opportunities.append({
                    'title': market['question'],
                    'deviation': abs(total - 1.0),
                    'volume_24h': market.get('volume24hr', 0)
                })
    return sorted(opportunities, key=lambda x: x['deviation'], reverse=True)

def calculate_expected_value(probability: float, buy_price: float,
                             fees: float = 0.0) -> float:
    """EV per share. Set `fees` (fraction of price) from the venue's current fee schedule."""
    cost = buy_price * (1 + fees)
    return probability * (1.0 - cost) - (1 - probability) * cost
```

### Kalshi API

Kalshi is CFTC-regulated (US-accessible). Docs: https://docs.kalshi.com. Market data is public; trading needs an API key pair (Ed25519 recommended, or RSA) created in account settings. The old email/password `/login` flow and the `trading-api.kalshi.com` host are gone (the old host now answers 401). Use `https://external-api.kalshi.com/trade-api/v2`; the demo environment `https://external-api.demo.kalshi.co/trade-api/v2` has separate keys.

Prices are fixed-point dollar strings (`yes_bid_dollars: "0.4200"`) and quantities are `_fp` strings (`"13.00"`), not integer cents. The order book returns bids only (`orderbook_fp.yes_dollars` and `no_dollars`, each `[price, count]`): a YES bid at 0.42 is a NO ask at 0.58.

```python
# kalshi_client.py
import base64, os, time
import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

BASE = "https://external-api.kalshi.com"
PREFIX = "/trade-api/v2"

def get_markets(series_ticker: str = "KXHIGHNY", status: str = "open") -> list:
    r = requests.get(f"{BASE}{PREFIX}/markets",
                     params={"series_ticker": series_ticker, "status": status, "limit": 100}, timeout=15)
    return r.json()["markets"]          # paginate with the returned `cursor`

def get_orderbook(ticker: str) -> dict:
    r = requests.get(f"{BASE}{PREFIX}/markets/{ticker}/orderbook", timeout=15)
    return r.json()["orderbook_fp"]

def signed_headers(method: str, path: str) -> dict:
    """Sign timestamp+METHOD+path (no query string). Ed25519 key; RSA keys use RSA-PSS/SHA-256."""
    key = load_pem_private_key(open(os.environ["KALSHI_PRIVATE_KEY_FILE"], "rb").read(), password=None)
    ts = str(int(time.time() * 1000))
    sig = key.sign((ts + method + path).encode())      # Ed25519 signs the message directly
    return {"KALSHI-ACCESS-KEY": os.environ["KALSHI_KEY_ID"],
            "KALSHI-ACCESS-TIMESTAMP": ts,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode()}

def get_balance() -> dict:
    path = f"{PREFIX}/portfolio/balance"
    return requests.get(BASE + path, headers=signed_headers("GET", path), timeout=15).json()
```

Orders go to `POST /portfolio/events/orders` (Create Order V2: `ticker`, `side` of `bid`/`ask`, `count` and `price` as strings, `time_in_force`, `self_trade_prevention_type`). Try them on the demo host first. Official SDKs: `pip install kalshi_python_sync`, `npm install kalshi-typescript` (the old `kalshi-python` is deprecated); the OpenAPI spec at docs.kalshi.com/openapi.yaml is the source of truth. Each authenticated request spends tokens from a per-tier budget, see "Rate Limits and Tiers" in the docs.

### Manifold Markets API

Play money (mana) — great for experimenting, no auth for reading (500 requests/minute/IP). Times are Unix milliseconds. `sort` accepts `score`, `liquidity`, `24-hour-vol`, `most-popular`, `newest`, `close-date` and others; `filter` accepts `open`, `closed`, `resolved`. The API is still marked alpha, and writes need an `Authorization: Key` header carrying your API key.

```python
MANIFOLD_API = "https://api.manifold.markets/v0"

def search_markets(query: str, limit: int = 20) -> list:
    return requests.get(f"{MANIFOLD_API}/search-markets",
                        params={"term": query, "limit": limit, "sort": "liquidity", "filter": "open"}, timeout=15).json()
```

### Dashboard building

Key visualizations for a prediction market dashboard:
1. **Market cards**: Title, probability (color-coded), 24h volume, time to resolution
2. **Probability timeline**: Line chart showing momentum over time
3. **Volume bars**: 24h volume history showing market attention
4. **Alerts**: Markets where probability moved >10% in 24 hours

```python
# market_scorer.py — Score markets for dashboard prominence

def score_market(market: dict) -> float:
    score = 0.0
    volume = float(market.get('volume24hr') or 0)
    prob = market.get('probability', 0.5)   # from outcomePrices[0] or Manifold `probability`

    if volume > 100000: score += 30
    elif volume > 10000: score += 20
    elif volume > 1000: score += 10

    uncertainty = 1 - abs(prob - 0.5) * 2  # 1.0 at 50%, 0.0 at extremes
    score += uncertainty * 25

    prob_change = abs(market.get('probability_change_24h', 0))
    if prob_change > 0.10: score += 20
    elif prob_change > 0.05: score += 10

    return min(score, 100)
```

## Examples

### Build a prediction market dashboard

```prompt
Build a real-time dashboard showing the top 50 Polymarket events sorted by 24-hour volume. Show each market as a card with: title, current probability (color-coded red-green), volume, time to resolution, and 7-day probability chart. Group by category (politics, crypto, sports, tech). Add alerts for markets where probability moved more than 10% in the last 24 hours. Use React and Chart.js.
```

### Find mispriced prediction markets

```prompt
Analyze all active Polymarket binary markets. Find markets where the Yes + No prices deviate more than 3% from $1.00 (indicating potential mispricing). Also find markets where the probability has been stable for weeks but a relevant news event just occurred. Output a ranked list of opportunities with expected value calculations.
```

### Build a forecasting accuracy tracker

```prompt
Build a system that tracks my prediction market bets across Polymarket and Kalshi, calculates my Brier score over time, and shows a calibration chart (predicted probabilities vs actual outcomes). Include position-size-weighted returns and compare my accuracy against the market's consensus probabilities.
```

## Guidelines

- Always check market liquidity (24h volume) before placing trades — low-liquidity markets have wide spreads
- In binary markets, verify Yes + No prices sum to ~$1.00; small deviations are normal spread, not free money
- Use Manifold (play money) for strategy testing before deploying capital on Polymarket or Kalshi
- Compare your forecasts against market consensus to measure calibration over time
- Monitor for >10% probability swings in 24 hours — these often signal new information or mispricing
- Be aware that Polymarket is crypto-based (Polygon) while Kalshi is CFTC-regulated with different rules, fees and access restrictions by country; check current eligibility and fee schedules before trading
- Calculate expected value before every trade; don't trade based on conviction alone
