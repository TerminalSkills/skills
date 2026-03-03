---
name: algo-trading
description: >-
  Build algorithmic trading systems — backtesting, strategy development, live
  execution, and risk management. Use when tasks involve backtesting trading
  strategies, connecting to exchange APIs (Binance, Alpaca, Interactive Brokers),
  implementing technical indicators, portfolio optimization, order execution,
  risk management rules, market data processing, or building trading bots.
  Covers both crypto and traditional markets.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags:
    - trading
    - algorithmic
    - backtesting
    - finance
    - quantitative
---

# Algorithmic Trading

## Overview

Build, backtest, and deploy algorithmic trading strategies. Cover market data ingestion, strategy development, backtesting with realistic assumptions, risk management, and live execution.

## Instructions

### Architecture

```
Market Data → Data Pipeline → Strategy Engine → Risk Manager → Order Executor → Exchange
     ↑                              ↓                                    ↓
     └──────────── Performance Monitor ←────── Position Tracker ←────────┘
```

### Data pipeline

```python
# data_fetcher.py — Fetch historical OHLCV data

import ccxt
import yfinance as yf

def fetch_crypto_ohlcv(symbol: str, timeframe: str, since: str) -> list:
    """Fetch candles from Binance. Returns [timestamp, O, H, L, C, V]."""
    exchange = ccxt.binance()
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe,
                                  since=exchange.parse8601(since), limit=1000)
    return ohlcv

def fetch_stock_data(ticker: str, period: str = '2y', interval: str = '1d'):
    """Fetch stock OHLCV from Yahoo Finance."""
    return yf.download(ticker, period=period, interval=interval)
```

For real-time data, use WebSocket feeds (ccxt.pro):

```python
async def stream_orderbook(symbol: str = 'BTC/USDT'):
    exchange = ccxtpro.binance()
    while True:
        ob = await exchange.watch_order_book(symbol)
        spread = (ob['asks'][0][0] - ob['bids'][0][0]) / ob['bids'][0][0] * 100
        print(f"{symbol} Spread: {spread:.4f}%")
```

### Strategy development

**Common types**: Momentum/trend following (MAs, RSI, MACD), mean reversion (z-scores, Bollinger Bands), statistical arbitrage (pairs trading, cross-exchange), market making (spread capture).

```python
# strategy.py — Dual Moving Average Crossover with RSI filter

import pandas as pd

def calculate_signals(df: pd.DataFrame, fast=20, slow=50, rsi_period=14):
    """Generate trading signals from OHLCV data."""
    df['sma_fast'] = df['close'].rolling(window=fast).mean()
    df['sma_slow'] = df['close'].rolling(window=slow).mean()

    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=rsi_period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=rsi_period).mean()
    df['rsi'] = 100 - (100 / (1 + gain / loss))

    df['signal'] = 0
    df.loc[(df['sma_fast'] > df['sma_slow']) &
           (df['sma_fast'].shift(1) <= df['sma_slow'].shift(1)) &
           (df['rsi'] < 70), 'signal'] = 1   # Buy
    df.loc[(df['sma_fast'] < df['sma_slow']) &
           (df['sma_fast'].shift(1) >= df['sma_slow'].shift(1)) &
           (df['rsi'] > 30), 'signal'] = -1  # Sell
    return df
```

### Backtesting

A backtest must model real conditions — fees, slippage, and stop-losses:

```python
# backtester.py — Vectorized backtester with realistic assumptions

class BacktestConfig:
    commission: float = 0.001     # 0.1% per trade
    slippage: float = 0.0005      # 0.05% estimated
    initial_capital: float = 10000
    position_size: float = 0.1    # 10% of portfolio per trade
    stop_loss: float = 0.02       # 2% stop-loss
    take_profit: float = 0.06     # 6% take-profit (3:1 R/R)
```

**Key metrics:**

```
RETURNS: Total Return, Annualized Return, Alpha (vs buy-and-hold)
RISK: Max Drawdown (<15%), Sharpe Ratio (>1.0 good, >2.0 excellent), Sortino, Calmar
TRADING: Win Rate (>45% for trend, >55% for mean reversion), Profit Factor (>1.5)
```

### Risk management

**Position sizing**: Fixed fractional (X% per trade) or Kelly Criterion (f = (bp - q) / b, use half-Kelly for safety).

```python
# risk_manager.py — Enforce risk rules before every order

RISK_RULES = {
    'max_position_pct': 0.10,       # Max 10% per position
    'max_portfolio_risk': 0.02,     # Max 2% risk per trade
    'max_daily_loss': 0.05,         # Stop after 5% daily loss
    'max_drawdown': 0.15,           # Stop after 15% drawdown
    'max_correlation': 0.7,         # No correlated positions
}
```

### Live execution

```python
# executor.py — Live orders with safety checks

def place_order(exchange, symbol, side, amount, order_type='limit', price=None):
    ticker = exchange.fetch_ticker(symbol)
    if order_type == 'market':
        spread = (ticker['ask'] - ticker['bid']) / ticker['bid'] * 100
        if spread > 0.5:
            raise ValueError(f"Spread too wide: {spread:.2f}%")
    if order_type == 'limit' and price:
        deviation = abs(price - ticker['last']) / ticker['last'] * 100
        if deviation > 2.0:
            raise ValueError(f"Limit price {deviation:.1f}% from market")
    return exchange.create_order(symbol, order_type, side, amount, price)
```

Always paper trade first: Alpaca (built-in), Binance Testnet, Interactive Brokers (TWS). Run 1 month or 100 trades minimum before live capital.

## Examples

### Build a crypto momentum strategy

```prompt
Build a momentum trading strategy for BTC/USDT on Binance. Use EMA crossover (12/26) with volume confirmation and RSI filter. Backtest on 2 years of hourly data with realistic fees (0.1% taker), calculate Sharpe ratio and max drawdown, and compare against buy-and-hold. Include stop-loss at 2% and take-profit at 6%.
```

### Create a pairs trading system

```prompt
Build a statistical arbitrage system that trades correlated stock pairs. Use cointegration testing to find pairs from the S&P 500, implement a z-score mean reversion strategy, and backtest with transaction costs. Include the pair selection process, entry/exit rules, and risk management.
```

### Set up a live trading bot with risk management

```prompt
Deploy a live trading bot on Alpaca for US stocks. It should run a simple momentum strategy on a universe of 20 liquid ETFs, execute via limit orders, enforce position size limits (max 10% per holding), and stop trading if daily loss exceeds 2%. Include monitoring, logging, and alerting via Telegram.
```

## Guidelines

- Always backtest with realistic fees, slippage, and stop-losses — unrealistic backtests are worthless
- Never skip paper trading — run for at least 1 month or 100 trades before deploying live capital
- Use half-Kelly criterion for position sizing to add a safety margin
- Implement hard daily loss limits and max drawdown circuit breakers
- Check spread width before market orders — never market-order into thin books
- Compare every strategy against buy-and-hold; if it underperforms, it's not worth the complexity
- Log every order, signal, and risk check for post-mortem analysis
