---
title: Build an Algorithmic Trading System with Backtesting and Live Execution
slug: build-algorithmic-trading-system-with-backtesting
description: Design, backtest, and deploy a crypto trading bot with momentum strategy, risk management, and paper trading — from historical data to live execution on Binance.
skills:
  - algo-trading
  - prediction-markets
  - dspycategory: data-ai
tags:
  - trading
  - backtesting
  - crypto
  - quantitative
  - automation
---

## The Problem

Marta is a software engineer who trades crypto as a side project. She has a hypothesis: when Bitcoin's 12-period EMA crosses above the 26-period EMA on the hourly chart, and RSI is between 30-65 (not overbought), there's a tradeable momentum signal. She's been trading this manually — watching charts, placing orders by hand, sometimes missing entries because she was asleep. She wants to know if the strategy actually works (backtest it with realistic fees), then automate it so she doesn't have to watch charts 24/7. Budget for live trading: $5,000, with strict risk limits.

## The Solution

Use algo-trading to build the full pipeline: fetch 2 years of historical BTC/USDT hourly data, implement the momentum strategy with proper signal logic, backtest with realistic assumptions (0.1% fees, slippage, stop-losses), then deploy as a live bot with paper trading first. Use prediction-markets to add a market sentiment overlay — if Polymarket shows high probability of a crypto-negative event (regulation, exchange collapse), reduce position sizes automatically. Use dspy to build a news sentiment classifier that flags macro events affecting the trade.

## Step-by-Step Walkthrough

### Step 1: Fetch and Prepare Historical Data

Before writing a single line of strategy code, get clean data. Crypto markets trade 24/7, so there are no gaps — but exchange data can have missing candles during outages. Fetch 2 years of hourly BTC/USDT candles from Binance and check for completeness.

The data pipeline fetches OHLCV (open, high, low, close, volume) candles in batches of 1000 (Binance's limit per request), handles pagination automatically, and saves to a local Parquet file for fast backtesting. After fetching, validate: 2 years of hourly data should have ~17,520 candles. If more than 0.1% are missing, fill gaps with the previous candle's close (or flag them as no-trade zones).

### Step 2: Implement the Strategy

The strategy logic is clean: calculate the 12-period and 26-period exponential moving averages, plus 14-period RSI. Generate a buy signal when the fast EMA crosses above the slow EMA and RSI is in the 30-65 range (momentum starting, not overbought). Generate a sell signal on the reverse cross or when RSI exceeds 75.

The key insight with EMA crossovers: the crossover itself is lagging by design — it confirms a trend rather than predicting one. The RSI filter reduces false signals by ensuring the move has room to run. Without the RSI filter, backtests show ~40% more trades but a lower win rate.

Implement the signals as a pure function that takes a DataFrame and returns it with signal columns. No side effects, no exchange calls — this makes backtesting deterministic and reproducible.

### Step 3: Backtest with Realistic Assumptions

The backtest must model real-world conditions or it's useless. Three things kill strategies that look good on paper:

**Fees**: Binance charges 0.1% per trade (taker). A strategy that trades 200 times per year pays 40% of capital in fees at 0.1% round-trip. The backtest must subtract fees from every entry and exit.

**Slippage**: Market orders execute at the best available price, which may be worse than the signal price — especially for larger orders or thin order books. Model 0.05% slippage on each trade.

**Stop-losses**: Without stops, a single bad trade can erase months of gains. Set a 2% stop-loss per trade and 6% take-profit (3:1 risk/reward ratio). The backtester must check stop-loss and take-profit levels on every candle between entry and exit.

Run the backtest on the full 2-year dataset. Key metrics to evaluate:

- **Sharpe ratio > 1.0**: The strategy beats risk-free returns after adjusting for volatility
- **Max drawdown < 15%**: The worst peak-to-trough decline is survivable
- **Win rate > 45%**: With 3:1 risk/reward, you profit even below 50% win rate
- **Profit factor > 1.5**: Gross profit divided by gross loss
- **Comparison to buy-and-hold**: If the strategy underperforms simply holding BTC, it's not worth the complexity

### Step 4: Add Prediction Market Sentiment Overlay

Raw momentum signals don't account for macro events. If regulators announce a crypto crackdown or a major exchange faces solvency issues, momentum signals become unreliable.

Pull data from Polymarket's API for crypto-related markets: "Will Bitcoin drop below $X by date Y?", "Will [exchange] face regulatory action?", and similar. When negative-sentiment markets show >60% probability, reduce position sizes by half. When they show >80%, stop opening new positions entirely.

This isn't about predicting markets — it's about risk management. Prediction markets aggregate thousands of informed participants' views, making them a useful sentiment proxy. The implementation fetches relevant Polymarket events hourly, calculates a composite "crypto risk score," and passes it to the position sizing module.

### Step 5: Build a News Sentiment Classifier

Use DSPy to build a self-optimizing classifier that reads crypto news headlines and scores them as bullish, bearish, or neutral. The classifier feeds into the trading system as an additional filter.

Define the DSPy signature: headline → sentiment (bullish/neutral/bearish) + confidence (0-1) + impact (low/medium/high). Train with 50 labeled examples of headlines that preceded significant BTC moves. Use BootstrapFewShot optimizer to find the best prompting strategy.

The classifier runs on a feed of headlines from CoinDesk, CoinTelegraph, and Bloomberg Crypto. When it detects a high-confidence, high-impact bearish headline, the system either closes open positions or tightens stop-losses — depending on the current position's PnL.

### Step 6: Paper Trade for Validation

Never go live without paper trading. Set up the bot on Binance Testnet — it uses the same API but with fake money. Run for at least 30 days or 50 trades (whichever comes first).

During paper trading, verify:
- Orders execute at expected prices (within slippage tolerance)
- Stop-losses trigger correctly
- The sentiment overlay actually reduces exposure during volatile events
- WebSocket reconnection works (connections drop, the bot must recover)
- Logging captures every decision for post-mortem analysis

Compare paper trading results to the backtest. If paper performance is more than 20% worse than the backtest, something is wrong — usually timing (signals on candle close vs. actual execution delay) or slippage assumptions.

### Step 7: Deploy with Risk Management

After successful paper trading, deploy with real capital ($5,000). But the risk management is more important than the strategy:

- **Position size**: Max 10% of portfolio per trade ($500 per position)
- **Daily loss limit**: Stop trading if daily PnL drops below -2% ($100)
- **Max drawdown**: Stop all trading if portfolio drops below $4,250 (15% from peak)
- **Max concurrent positions**: 3 (limits correlation risk)
- **Alert on anomalies**: Telegram notification for every trade, daily PnL summary, and immediate alert if any risk limit is hit

The bot runs on a VPS (not a local machine) for uptime. Use a process manager (PM2 or systemd) with automatic restart. Log every order, signal, and risk check to a database for weekly performance review.

## Real-World Example

Marta's backtest shows a Sharpe ratio of 1.4, max drawdown of 11.2%, and 52% win rate over 2 years — outperforming buy-and-hold by 23% with lower volatility. The sentiment overlay prevented 3 major losing trades during the test period (a regulatory FUD event and two exchange incidents). After 30 days of paper trading confirming the backtest results within 8% deviation, she deploys with $5,000. The bot trades 3-5 times per week, sends execution reports to Telegram, and respects all risk limits automatically. Marta reviews performance weekly, adjusting parameters quarterly based on accumulated data. The system replaces 15+ hours per week of chart-watching with a disciplined, emotion-free execution engine.

## Related Skills

- **algo-trading** — Core trading system: backtesting, strategy development, risk management, and live execution
- **prediction-markets** — Market sentiment overlay using Polymarket data for risk-adjusted position sizing
- **dspy** — Self-optimizing news sentiment classifier for macro event detection
