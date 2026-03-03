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
  version: "1.0.0"
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
Polymarket   | Crypto (Polygon)  | Binary/Multi     | REST+WS   | CLOB
Kalshi       | Regulated (US)    | Binary events    | REST+WS   | CLOB
Manifold     | Play money + Mana | Any question     | REST       | AMM
Metaculus    | Forecasting       | Probability est. | REST       | No trading
```

### Polymarket API

Polymarket is the largest by volume. Data is publicly accessible without authentication.

```python
# polymarket_client.py

import requests

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"

def get_active_markets(limit: int = 100, offset: int = 0) -> list:
    """Fetch active markets sorted by 24h volume."""
    resp = requests.get(f"{GAMMA_API}/events", params={
        "limit": limit, "offset": offset,
        "active": True, "closed": False,
        "order": "volume24hr", "ascending": False
    })
    return resp.json()

def get_market_prices(condition_id: str) -> dict:
    """Get current prices (probabilities) for a market's outcomes."""
    return requests.get(f"{CLOB_API}/prices",
                        params={"token_ids": condition_id}).json()

def get_market_history(condition_id: str, interval: str = "1d") -> list:
    """Fetch price history for a market."""
    resp = requests.get(f"{CLOB_API}/prices-history", params={
        "market": condition_id, "interval": interval, "fidelity": 60
    })
    return resp.json().get("history", [])
```

### Market analysis

```python
# market_analyzer.py

def find_arbitrage_opportunities(markets: list, threshold: float = 0.02) -> list:
    """Find markets where outcome probabilities don't sum to ~1.0."""
    opportunities = []
    for market in markets:
        outcomes = market.get('outcomes', [])
        if len(outcomes) == 2:
            total = sum(float(o.get('price', 0)) for o in outcomes)
            if abs(total - 1.0) > threshold:
                opportunities.append({
                    'title': market['title'],
                    'deviation': abs(total - 1.0),
                    'volume_24h': market.get('volume24hr', 0)
                })
    return sorted(opportunities, key=lambda x: x['deviation'], reverse=True)

def calculate_expected_value(probability: float, buy_price: float,
                             fees: float = 0.02) -> float:
    """Calculate EV of a prediction market position."""
    cost = buy_price * (1 + fees)
    return probability * (1.0 - cost) - (1 - probability) * cost
```

### Kalshi API

Kalshi is CFTC-regulated (US-accessible). Requires authentication:

```python
# kalshi_client.py

KALSHI_API = "https://trading-api.kalshi.com/trade-api/v2"

class KalshiClient:
    def __init__(self, email: str, password: str):
        self.session = requests.Session()
        resp = self.session.post(f"{KALSHI_API}/login",
                                 json={"email": email, "password": password})
        self.session.headers["Authorization"] = f"Bearer {resp.json()['token']}"

    def get_events(self, status: str = "open", limit: int = 100) -> list:
        return self.session.get(f"{KALSHI_API}/events",
                                params={"status": status, "limit": limit}).json().get("events", [])

    def get_orderbook(self, ticker: str) -> dict:
        return self.session.get(f"{KALSHI_API}/orderbook",
                                params={"ticker": ticker}).json()

    def place_order(self, ticker: str, side: str, count: int, price: int) -> dict:
        return self.session.post(f"{KALSHI_API}/portfolio/orders", json={
            "ticker": ticker, "side": side, "count": count, "type": "limit",
            "yes_price": price if side == "yes" else None,
            "no_price": price if side == "no" else None
        }).json()
```

### Manifold Markets API

Play money — great for experimenting, no auth required for reading:

```python
MANIFOLD_API = "https://api.manifold.markets/v0"

def search_markets(query: str, limit: int = 20) -> list:
    return requests.get(f"{MANIFOLD_API}/search-markets",
                        params={"term": query, "limit": limit, "sort": "liquidity"}).json()
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
    volume = market.get('volume24hr', 0)
    prob = market.get('probability', 0.5)

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
- In binary markets, verify Yes + No prices sum to ~$1.00; deviations indicate mispricing or fees
- Use Manifold (play money) for strategy testing before deploying capital on Polymarket or Kalshi
- Compare your forecasts against market consensus to measure calibration over time
- Monitor for >10% probability swings in 24 hours — these often signal new information or mispricing
- Be aware that Polymarket is crypto-based (Polygon) while Kalshi is CFTC-regulated with different rules
- Calculate expected value before every trade; don't trade based on conviction alone
