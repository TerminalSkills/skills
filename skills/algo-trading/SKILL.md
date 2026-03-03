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
    - crypto
---

# Algorithmic Trading

Build, backtest, and deploy algorithmic trading strategies. Cover market data ingestion, strategy development, backtesting with realistic assumptions, risk management, and live execution.

## Architecture

```
Market Data → Data Pipeline → Strategy Engine → Risk Manager → Order Executor → Exchange
     ↑                              ↓                                    ↓
     └──────────── Performance Monitor ←────── Position Tracker ←────────┘
```

Components:
- **Data Pipeline**: Real-time and historical market data (OHLCV, order book, trades)
- **Strategy Engine**: Signal generation based on indicators, models, or rules
- **Risk Manager**: Position sizing, stop-losses, drawdown limits, correlation checks
- **Order Executor**: Smart order routing, slippage management, exchange API
- **Performance Monitor**: PnL tracking, metric calculation, alerting

## Data Pipeline

### Historical data sources

```python
# data_fetcher.py
# Fetch historical OHLCV data from multiple sources
# Free tiers available for development and backtesting

import ccxt       # Crypto exchanges (Binance, Coinbase, Kraken, etc.)
import yfinance   # US stocks, ETFs, forex (Yahoo Finance)
import alpaca_trade_api  # US stocks with paper trading

# Crypto — using ccxt unified API
def fetch_crypto_ohlcv(symbol: str, timeframe: str, since: str) -> list:
    """Fetch historical candles from Binance.
    
    Args:
        symbol: Trading pair (e.g., 'BTC/USDT')
        timeframe: Candle period ('1m', '5m', '1h', '1d')
        since: Start date ISO string ('2025-01-01T00:00:00Z')
    
    Returns:
        List of [timestamp, open, high, low, close, volume] arrays
    """
    exchange = ccxt.binance()
    since_ts = exchange.parse8601(since)
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe, since=since_ts, limit=1000)
    return ohlcv  # Paginate for more data

# US Stocks — using yfinance
import yfinance as yf

def fetch_stock_data(ticker: str, period: str = '2y', interval: str = '1d'):
    """Fetch stock OHLCV from Yahoo Finance.
    
    Args:
        ticker: Stock symbol (e.g., 'AAPL', 'SPY')
        period: Lookback period ('1mo', '6mo', '1y', '2y', '5y', 'max')
        interval: Candle period ('1m', '5m', '1h', '1d', '1wk')
    """
    data = yf.download(ticker, period=period, interval=interval)
    return data  # DataFrame with Open, High, Low, Close, Volume
```

### Real-time data

```python
# websocket_feed.py
# Real-time price stream via WebSocket

import ccxt.pro as ccxtpro  # Async WebSocket support
import asyncio

async def stream_orderbook(symbol: str = 'BTC/USDT'):
    """Stream live order book updates from Binance.
    
    Args:
        symbol: Trading pair to subscribe to
    """
    exchange = ccxtpro.binance()
    while True:
        orderbook = await exchange.watch_order_book(symbol)
        best_bid = orderbook['bids'][0][0]  # Highest buy price
        best_ask = orderbook['asks'][0][0]  # Lowest sell price
        spread = (best_ask - best_bid) / best_bid * 100
        print(f"{symbol} Bid: {best_bid} Ask: {best_ask} Spread: {spread:.4f}%")
    await exchange.close()
```

## Strategy Development

### Common strategy types

**Momentum/Trend following**: Buy when price trends up, sell when it reverses. Uses moving averages, RSI, MACD, Bollinger Bands.

**Mean reversion**: Buy when price deviates below average, sell when it returns. Works best in ranging markets. Uses z-scores, Bollinger Bands, RSI oversold/overbought.

**Statistical arbitrage**: Exploit price inefficiencies between correlated assets. Pairs trading, triangular arbitrage, cross-exchange arbitrage.

**Market making**: Place limit orders on both sides of the order book, profit from the spread. Requires low-latency execution and careful inventory management.

### Strategy implementation

```python
# strategy.py
# Example: Dual Moving Average Crossover with RSI filter

import pandas as pd
import numpy as np

def calculate_signals(df: pd.DataFrame, 
                      fast_period: int = 20, 
                      slow_period: int = 50,
                      rsi_period: int = 14) -> pd.DataFrame:
    """Generate trading signals from OHLCV data.
    
    Args:
        df: DataFrame with 'close' column (OHLCV data)
        fast_period: Fast moving average window (default 20)
        slow_period: Slow moving average window (default 50)
        rsi_period: RSI calculation period (default 14)
    
    Returns:
        DataFrame with added signal columns
    """
    # Moving averages
    df['sma_fast'] = df['close'].rolling(window=fast_period).mean()
    df['sma_slow'] = df['close'].rolling(window=slow_period).mean()
    
    # RSI — Relative Strength Index
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=rsi_period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=rsi_period).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # Signal logic:
    # BUY when fast MA crosses above slow MA AND RSI < 70 (not overbought)
    # SELL when fast MA crosses below slow MA AND RSI > 30 (not oversold)
    df['signal'] = 0
    df.loc[(df['sma_fast'] > df['sma_slow']) & 
           (df['sma_fast'].shift(1) <= df['sma_slow'].shift(1)) & 
           (df['rsi'] < 70), 'signal'] = 1   # Buy
    df.loc[(df['sma_fast'] < df['sma_slow']) & 
           (df['sma_fast'].shift(1) >= df['sma_slow'].shift(1)) & 
           (df['rsi'] > 30), 'signal'] = -1  # Sell
    
    return df
```

## Backtesting

### Realistic backtesting rules

A backtest is worthless if it doesn't model real trading conditions:

```python
# backtester.py
# Vectorized backtester with realistic assumptions

class BacktestConfig:
    """Configuration for realistic backtesting.
    
    All costs must be included to avoid overfitting to
    unrealistic conditions.
    """
    commission: float = 0.001     # 0.1% per trade (Binance taker fee)
    slippage: float = 0.0005      # 0.05% estimated slippage
    initial_capital: float = 10000
    position_size: float = 0.1    # 10% of portfolio per trade
    max_positions: int = 5        # Max concurrent positions
    stop_loss: float = 0.02       # 2% stop-loss per trade
    take_profit: float = 0.06     # 6% take-profit (3:1 risk/reward)

def run_backtest(df: pd.DataFrame, config: BacktestConfig) -> dict:
    """Run backtest on signal-annotated OHLCV data.
    
    Args:
        df: DataFrame with 'close' and 'signal' columns
        config: Backtesting parameters
    
    Returns:
        Dict with performance metrics
    """
    capital = config.initial_capital
    positions = []
    trades = []
    equity_curve = [capital]
    
    for i, row in df.iterrows():
        # Check stop-loss and take-profit on open positions
        for pos in positions[:]:
            pnl_pct = (row['close'] - pos['entry']) / pos['entry']
            if pos['side'] == 'short':
                pnl_pct = -pnl_pct
            
            if pnl_pct <= -config.stop_loss or pnl_pct >= config.take_profit:
                # Close position
                cost = pos['size'] * config.commission
                pnl = pos['size'] * pnl_pct - cost
                capital += pos['size'] + pnl
                trades.append({'entry': pos['entry'], 'exit': row['close'], 
                              'pnl': pnl, 'pnl_pct': pnl_pct})
                positions.remove(pos)
        
        # New signals
        if row['signal'] == 1 and len(positions) < config.max_positions:
            size = capital * config.position_size
            entry_price = row['close'] * (1 + config.slippage)  # Slippage on entry
            cost = size * config.commission
            capital -= size + cost
            positions.append({'entry': entry_price, 'size': size, 'side': 'long'})
        
        equity_curve.append(capital + sum(p['size'] for p in positions))
    
    return calculate_metrics(trades, equity_curve, config.initial_capital)
```

### Key performance metrics

```
RETURNS
- Total Return: [x]%
- Annualized Return: [x]%
- Benchmark Return: [x]% (buy-and-hold comparison)
- Alpha: [x]% (excess return over benchmark)

RISK
- Max Drawdown: [x]% (largest peak-to-trough decline)
- Sharpe Ratio: [x] (risk-adjusted return, >1.0 is good, >2.0 is excellent)
- Sortino Ratio: [x] (like Sharpe but only penalizes downside volatility)
- Calmar Ratio: [x] (annualized return / max drawdown)

TRADING
- Win Rate: [x]% (benchmark: >45% for trend following, >55% for mean reversion)
- Profit Factor: [x] (gross profit / gross loss, >1.5 is good)
- Average Win/Loss Ratio: [x]:1 (>2:1 for trend following)
- Total Trades: [count]
- Average Trade Duration: [time]
```

## Risk Management

### Position sizing

```
Fixed fractional: Risk X% of portfolio per trade
Kelly Criterion: f = (bp - q) / b
  where b = win/loss ratio, p = win probability, q = 1-p
  Use half-Kelly for safety: f/2

Example:
Win rate: 55%, average win: $300, average loss: $150
b = 300/150 = 2.0
f = (2.0 × 0.55 - 0.45) / 2.0 = 0.325
Half-Kelly: 16.25% of portfolio per trade
```

### Risk limits

```python
# risk_manager.py
# Enforce risk rules before every order

RISK_RULES = {
    'max_position_pct': 0.10,       # Max 10% of portfolio in one position
    'max_portfolio_risk': 0.02,     # Max 2% portfolio risk per trade
    'max_daily_loss': 0.05,         # Stop trading after 5% daily loss
    'max_drawdown': 0.15,           # Stop trading after 15% drawdown
    'max_correlation': 0.7,         # Don't open correlated positions
    'max_sector_exposure': 0.30,    # Max 30% in one sector
}
```

## Live Execution

### Exchange connections

```python
# executor.py
# Live order execution with safety checks

import ccxt

def place_order(exchange: ccxt.Exchange, 
                symbol: str, 
                side: str, 
                amount: float,
                order_type: str = 'limit',
                price: float = None) -> dict:
    """Place an order with pre-flight safety checks.
    
    Args:
        exchange: Authenticated ccxt exchange instance
        symbol: Trading pair (e.g., 'BTC/USDT')
        side: 'buy' or 'sell'
        amount: Quantity to trade
        order_type: 'market' or 'limit'
        price: Limit price (required for limit orders)
    
    Returns:
        Exchange order response dict
    """
    # Safety checks
    ticker = exchange.fetch_ticker(symbol)
    if order_type == 'market':
        # Check spread — don't market-order into thin books
        spread_pct = (ticker['ask'] - ticker['bid']) / ticker['bid'] * 100
        if spread_pct > 0.5:  # 0.5% spread threshold
            raise ValueError(f"Spread too wide: {spread_pct:.2f}%")
    
    if order_type == 'limit' and price:
        # Check limit price is reasonable (within 2% of market)
        deviation = abs(price - ticker['last']) / ticker['last'] * 100
        if deviation > 2.0:
            raise ValueError(f"Limit price {deviation:.1f}% from market")
    
    order = exchange.create_order(symbol, order_type, side, amount, price)
    return order
```

### Paper trading

Always paper trade before going live. Most exchanges and brokers offer paper trading:
- **Alpaca**: Built-in paper trading API (identical to live)
- **Binance Testnet**: testnet.binancefuture.com
- **Interactive Brokers**: Paper trading account (TWS)

Run paper trading for at least 1 month or 100 trades before considering live capital.

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
