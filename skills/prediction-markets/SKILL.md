---
name: prediction-markets
description: >-
  Build tools and dashboards for prediction markets — Polymarket, Manifold,
  Kalshi, and Metaculus. Use when tasks involve fetching prediction market data,
  building probability dashboards, analyzing market liquidity, creating trading
  bots for prediction markets, visualizing event probabilities, or tracking
  forecasting accuracy. Covers both API integration and market analysis.
license: Apache-2.0
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
    - trading
---

# Prediction Markets

Build tools for prediction market platforms — fetch data, analyze markets, create dashboards, and implement trading strategies. Cover Polymarket, Kalshi, Manifold, and Metaculus APIs.

## Platform Overview

```
Platform     | Type              | Markets          | API       | Trading
-------------|-------------------|------------------|-----------|--------
Polymarket   | Crypto (Polygon)  | Binary/Multi     | REST+WS   | CLOB
Kalshi       | Regulated (US)    | Binary events    | REST+WS   | CLOB
Manifold     | Play money + Mana | Any question     | REST       | AMM
Metaculus    | Forecasting       | Probability est.  | REST       | No trading
PredictIt   | Regulated (US)    | Political events  | REST       | Order book
```

## Polymarket API

Polymarket is the largest prediction market by volume. Data is publicly accessible without authentication.

### Fetching markets

```python
# polymarket_client.py
# Fetch and analyze Polymarket event data

import requests
from datetime import datetime

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"

def get_active_markets(limit: int = 100, offset: int = 0) -> list:
    """Fetch active prediction markets from Polymarket.
    
    Args:
        limit: Number of markets to fetch (max 100)
        offset: Pagination offset
    
    Returns:
        List of market dicts with title, outcomes, volume, end_date
    """
    resp = requests.get(f"{GAMMA_API}/events", params={
        "limit": limit,
        "offset": offset,
        "active": True,
        "closed": False,
        "order": "volume24hr",  # Sort by 24h trading volume
        "ascending": False
    })
    return resp.json()

def get_market_prices(condition_id: str) -> dict:
    """Get current prices (probabilities) for a market's outcomes.
    
    Args:
        condition_id: The market's condition token ID
    
    Returns:
        Dict with outcome names and current prices (0-1 probability)
    """
    resp = requests.get(f"{CLOB_API}/prices", params={
        "token_ids": condition_id
    })
    return resp.json()

def get_market_history(condition_id: str, interval: str = "1d") -> list:
    """Fetch price history for a market.
    
    Args:
        condition_id: Market condition token ID
        interval: Candle interval ('1m', '1h', '1d')
    
    Returns:
        List of [timestamp, price] pairs
    """
    resp = requests.get(f"{CLOB_API}/prices-history", params={
        "market": condition_id,
        "interval": interval,
        "fidelity": 60  # Data points
    })
    return resp.json().get("history", [])
```

### Market analysis

```python
# market_analyzer.py
# Analyze prediction market data for opportunities

def find_arbitrage_opportunities(markets: list, threshold: float = 0.02) -> list:
    """Find markets where outcome probabilities don't sum to ~1.0.
    
    In a well-priced binary market, Yes + No should equal ~$1.00.
    Deviations above threshold may indicate mispricing.
    
    Args:
        markets: List of market data from get_active_markets()
        threshold: Minimum deviation from 1.0 to flag (default 2%)
    
    Returns:
        List of mispriced markets with deviation details
    """
    opportunities = []
    for market in markets:
        outcomes = market.get('outcomes', [])
        if len(outcomes) == 2:
            total = sum(float(o.get('price', 0)) for o in outcomes)
            deviation = abs(total - 1.0)
            if deviation > threshold:
                opportunities.append({
                    'title': market['title'],
                    'total_probability': total,
                    'deviation': deviation,
                    'volume_24h': market.get('volume24hr', 0),
                    'outcomes': outcomes
                })
    return sorted(opportunities, key=lambda x: x['deviation'], reverse=True)

def calculate_expected_value(probability: float, 
                             buy_price: float,
                             fees: float = 0.02) -> float:
    """Calculate expected value of a prediction market position.
    
    Args:
        probability: Your estimated true probability (0-1)
        buy_price: Current market price (0-1)
        fees: Trading fees as fraction (default 2%)
    
    Returns:
        Expected value per dollar risked
    """
    # If you buy Yes at buy_price and event happens (probability):
    # Payout = $1.00, Cost = buy_price + fees
    # EV = probability × (1 - buy_price - fees) - (1 - probability) × (buy_price + fees)
    cost = buy_price * (1 + fees)
    ev = probability * (1.0 - cost) - (1 - probability) * cost
    return ev
```

## Kalshi API

Kalshi is a CFTC-regulated prediction market (US-accessible):

```python
# kalshi_client.py
# Kalshi API client for regulated prediction markets

import requests

KALSHI_API = "https://trading-api.kalshi.com/trade-api/v2"

class KalshiClient:
    """Client for Kalshi regulated prediction market API.
    
    Requires API key from https://kalshi.com/developers
    """
    
    def __init__(self, email: str, password: str):
        self.session = requests.Session()
        self._login(email, password)
    
    def _login(self, email: str, password: str):
        resp = self.session.post(f"{KALSHI_API}/login", json={
            "email": email, "password": password
        })
        token = resp.json()["token"]
        self.session.headers["Authorization"] = f"Bearer {token}"
    
    def get_events(self, status: str = "open", limit: int = 100) -> list:
        """Fetch prediction events.
        
        Args:
            status: 'open', 'closed', or 'settled'
            limit: Results per page
        """
        resp = self.session.get(f"{KALSHI_API}/events", params={
            "status": status, "limit": limit
        })
        return resp.json().get("events", [])
    
    def get_orderbook(self, ticker: str) -> dict:
        """Get order book for a specific market.
        
        Args:
            ticker: Market ticker (e.g., 'KXBTC-26MAR14-100000')
        """
        resp = self.session.get(f"{KALSHI_API}/orderbook", params={
            "ticker": ticker
        })
        return resp.json()
    
    def place_order(self, ticker: str, side: str, 
                    count: int, price: int) -> dict:
        """Place a limit order.
        
        Args:
            ticker: Market ticker
            side: 'yes' or 'no'
            count: Number of contracts
            price: Price in cents (1-99)
        """
        resp = self.session.post(f"{KALSHI_API}/portfolio/orders", json={
            "ticker": ticker,
            "side": side,
            "count": count,
            "type": "limit",
            "yes_price": price if side == "yes" else None,
            "no_price": price if side == "no" else None
        })
        return resp.json()
```

## Manifold Markets API

Manifold uses play money (mana) and is great for experimenting:

```python
# manifold_client.py
# Manifold Markets API — free, no auth required for reading

import requests

MANIFOLD_API = "https://api.manifold.markets/v0"

def search_markets(query: str, limit: int = 20) -> list:
    """Search Manifold Markets by keyword.
    
    Args:
        query: Search string (e.g., 'AI regulation 2026')
        limit: Max results
    """
    resp = requests.get(f"{MANIFOLD_API}/search-markets", params={
        "term": query, "limit": limit, "sort": "liquidity"
    })
    return resp.json()

def get_market_positions(market_id: str) -> list:
    """Get all positions (bets) on a market.
    
    Args:
        market_id: Manifold market ID or slug
    """
    resp = requests.get(f"{MANIFOLD_API}/bets", params={
        "contractId": market_id, "limit": 1000
    })
    return resp.json()
```

## Dashboard Building

### Key visualizations

For a prediction market dashboard, show:

1. **Market cards**: Title, current probability, 24h volume, time to resolution
2. **Probability timeline**: Line chart of probability over time (shows momentum)
3. **Volume bars**: 24h volume history (shows market attention)
4. **Category grouping**: Politics, crypto, sports, tech, science clusters
5. **Alerts**: Markets where probability moved >10% in 24 hours

### Market scoring

```python
# market_scorer.py
# Score markets by "interestingness" for dashboard display

def score_market(market: dict) -> float:
    """Score a market for dashboard prominence.
    
    Higher scores = more interesting/actionable markets.
    
    Args:
        market: Market data dict
    
    Returns:
        Score 0-100
    """
    score = 0.0
    
    volume_24h = market.get('volume24hr', 0)
    probability = market.get('probability', 0.5)
    end_date = market.get('end_date')
    
    # Volume — active markets are more interesting
    if volume_24h > 100000: score += 30
    elif volume_24h > 10000: score += 20
    elif volume_24h > 1000: score += 10
    
    # Uncertainty — markets near 50% are most informative
    uncertainty = 1 - abs(probability - 0.5) * 2  # 1.0 at 50%, 0.0 at 0%/100%
    score += uncertainty * 25
    
    # Recency — markets resolving soon are more urgent
    if end_date:
        days_to_resolution = (end_date - datetime.now()).days
        if days_to_resolution < 7: score += 25
        elif days_to_resolution < 30: score += 15
        elif days_to_resolution < 90: score += 5
    
    # Momentum — large recent probability changes
    prob_change_24h = abs(market.get('probability_change_24h', 0))
    if prob_change_24h > 0.10: score += 20
    elif prob_change_24h > 0.05: score += 10
    
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
