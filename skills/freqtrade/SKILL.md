---
name: freqtrade
description: >-
  Freqtrade is a free, open-source crypto trading bot written in Python: you write a strategy class, download exchange candles, backtest it, then run it in dry-run mode (simulated orders) before risking money. Use when a user says "backtest a crypto strategy", "download historical candles for freqtrade", "write a freqtrade strategy", "run a trading bot in dry-run", or "set up FreqUI". Not financial advice: strategies usually lose money, and live trading can lose all of it. This skill defaults to dry-run and never handles exchange keys.
license: Apache-2.0
compatibility: "Python 3.12+ (freqtrade 2026.10), pip; internet access to a supported exchange for candle downloads. Optional: Docker 24+ for the freqtradeorg/freqtrade image."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "freqtrade, crypto, trading-bot, backtesting, python"
  repository: https://github.com/freqtrade/freqtrade
---
# Freqtrade — write, backtest and dry-run crypto trading strategies

## Overview

Freqtrade (PyPI `freqtrade`, GPL-3.0 tool) runs a loop over exchange candles. Your strategy class computes indicators and sets entry and exit signals on a pandas DataFrame; the bot backtests that logic on downloaded history or runs it live. This skill covers the workflow that was run end to end on release 2026.10: create a user directory, write a config and a strategy, download data, list strategies, backtest, and start a dry-run.

Read this first:

- This is not financial advice. A strategy that wins in a backtest often loses live (fees, slippage, overfitting). Live trading can lose the whole stake.
- Every config in this skill sets `"dry_run": true`. In dry-run the bot simulates orders against real market prices and places nothing. Do not change that flag on the user's behalf; switching to live trading is the owner's decision after reading the official docs.
- The agent never writes, reads or asks for exchange API keys. Market-data download and backtesting need no key (the download below ran anonymously on Binance spot).

## Instructions

### Installation

```bash
python3 -m venv .venv
.venv/bin/pip install "freqtrade==2026.10"
.venv/bin/freqtrade --version     # Freqtrade Version: freqtrade 2026.10
```

The PyPI wheel is Python 3.12+. Docker alternative (official image, tag `stable`, not pulled while checking this skill): the compose file in the repository maps the API to `127.0.0.1:8080` only, mounts `./user_data`, and runs `trade` with `--config /freqtrade/user_data/config.json` and its own strategy name, which you set to yours.

### Create the user directory

```bash
.venv/bin/freqtrade create-userdir --userdir user_data
```

This creates `strategies/` (with `sample_strategy.py`), `data/`, `backtest_results/`, `hyperopt_results/`, `logs/`, `notebooks/`, `plot/`, `freqaimodels/` and `hyperopts/`. Pass `--userdir user_data` to every later command except `install-ui`, which has no such flag and uses `user_data/` in the current directory (run it from the project root).

### Write the config

`freqtrade new-config` is an interactive wizard that asks for exchange keys; do not run it from an agent. Write `user_data/config.json` by hand. A minimal dry-run spot config (validated by `list-strategies`, `download-data`, `backtesting` and `trade`):

```json
{
  "max_open_trades": 3,
  "stake_currency": "USDT",
  "stake_amount": 100,
  "dry_run": true,
  "dry_run_wallet": 1000,
  "trading_mode": "spot",
  "timeframe": "1h",
  "entry_pricing": {"price_side": "same", "use_order_book": true, "order_book_top": 1},
  "exit_pricing": {"price_side": "same", "use_order_book": true, "order_book_top": 1},
  "exchange": {
    "name": "binance",
    "key": "",
    "secret": "",
    "pair_whitelist": ["BTC/USDT", "ETH/USDT"],
    "pair_blacklist": []
  },
  "pairlists": [{"method": "StaticPairList"}],
  "bot_name": "ema-rsi-dryrun",
  "initial_state": "running"
}
```

Leave `key` and `secret` empty. Binance may be geo-blocked for some users; pick another exchange name from `freqtrade list-exchanges` and check the exchange's page in the docs.

### Write a strategy

`freqtrade new-strategy --userdir user_data -s MyStrategy --template minimal` writes a template (`--template` takes `full`, `minimal` or `advanced`). The three methods you must keep are `populate_indicators`, `populate_entry_trend` and `populate_exit_trend`; entries use the column `enter_long` and exits `exit_long`. A complete strategy, `user_data/strategies/EmaRsiStrategy.py`:

```python
from pandas import DataFrame
import talib.abstract as ta
from freqtrade.strategy import IStrategy, IntParameter


class EmaRsiStrategy(IStrategy):
    INTERFACE_VERSION = 3

    timeframe = "1h"
    can_short = False
    minimal_roi = {"0": 0.06}
    stoploss = -0.02
    startup_candle_count = 30

    rsi_max = IntParameter(50, 75, default=65, space="buy")

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema_fast"] = ta.EMA(dataframe, timeperiod=12)
        dataframe["ema_slow"] = ta.EMA(dataframe, timeperiod=26)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        cross_up = (dataframe["ema_fast"] > dataframe["ema_slow"]) & (
            dataframe["ema_fast"].shift(1) <= dataframe["ema_slow"].shift(1)
        )
        dataframe.loc[
            cross_up & (dataframe["rsi"] < self.rsi_max.value) & (dataframe["volume"] > 0),
            "enter_long",
        ] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        cross_down = (dataframe["ema_fast"] < dataframe["ema_slow"]) & (
            dataframe["ema_fast"].shift(1) >= dataframe["ema_slow"].shift(1)
        )
        dataframe.loc[cross_down, "exit_long"] = 1
        return dataframe
```

Check it loads:

```bash
.venv/bin/freqtrade list-strategies --userdir user_data -c user_data/config.json
```

The table shows each strategy with Status `OK` (or an error naming the problem). Use only past data inside the three methods; looking at future rows (negative `shift`) makes backtests lie. `freqtrade lookahead-analysis` and `recursive-analysis` exist to check this.

### Download candles and backtest

```bash
.venv/bin/freqtrade download-data --userdir user_data -c user_data/config.json \
  --timerange 20260801-20261101 -t 1h
.venv/bin/freqtrade list-data --userdir user_data -c user_data/config.json
.venv/bin/freqtrade backtesting --userdir user_data -c user_data/config.json \
  -s EmaRsiStrategy --timerange 20260901-20261101 --fee 0.001
```

`download-data` takes pairs from the config unless `-p BTC/USDT ETH/USDT` is given and stores feather files under `user_data/data/binance/`. The default timeframes are `1m 5m`, so always pass `-t`. Download a window longer than the backtest window by `startup_candle_count` candles. `--fee 0.001` is applied on entry and exit. The report prints per-pair results, enter tag, exit reason and summary tables (final balance, drawdown, win rate). Results are saved in `user_data/backtest_results/`; `freqtrade backtesting-show --userdir user_data` re-prints the last one. Other useful flags: `--max-open-trades`, `--stake-amount`, `--dry-run-wallet`, `--breakdown month`.

### Dry-run

```bash
.venv/bin/freqtrade trade --userdir user_data -c user_data/config.json \
  -s EmaRsiStrategy --db-url sqlite:///dry-run.sqlite
```

The log says `Dry run is enabled` and `Instance is running with dry_run enabled`. Keep it running under a process manager and stop it with Ctrl+C or SIGTERM; it may take some seconds to shut down. `--dry-run` also exists as a flag to force simulation even when a config says otherwise.

### REST API and FreqUI (optional, local only)

Merge an `api_server` key into the top-level config object. `enabled`, `listen_ip_address`, `listen_port`, `username`, `password` and `jwt_secret_key` are all required by the schema, and `jwt_secret_key` must be at least 32 characters. Keep secrets out of the file: freqtrade reads environment variables named `FREQTRADE__<SECTION>__<KEY>`, which override the config (this worked for both keys below).

```json
{
  "api_server": {
    "enabled": true,
    "listen_ip_address": "127.0.0.1",
    "listen_port": 8081,
    "username": "freqtrader",
    "verbosity": "error",
    "CORS_origins": []
  }
}
```

```bash
export FREQTRADE__API_SERVER__PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
export FREQTRADE__API_SERVER__JWT_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
.venv/bin/freqtrade install-ui     # downloads the latest FreqUI (--ui-version pins one)
```

Outside Docker, bind to `127.0.0.1` only (a trade run with this config answered `GET /api/v1/ping` with `pong` on that address). In Docker the process inside the container must listen on `0.0.0.0` to be reachable through the port mapping; keep the host side as `127.0.0.1:8080:8080` as the official compose file does. Use an SSH tunnel for remote access, never an open port.

## Examples

### Example 1: "Backtest an EMA 12/26 crossover on BTC and ETH for two months"

```bash
.venv/bin/freqtrade create-userdir --userdir user_data
# write user_data/config.json and user_data/strategies/EmaRsiStrategy.py as above
.venv/bin/freqtrade download-data --userdir user_data -c user_data/config.json --timerange 20260801-20261101 -t 1h
.venv/bin/freqtrade backtesting --userdir user_data -c user_data/config.json -s EmaRsiStrategy --timerange 20260901-20261101 --fee 0.001
```

Result (actual run on 2026-11-06, Binance spot): each pair downloaded 2,350 hourly candles; the backtest made 52 trades over 2026-09-01 to 2026-11-01 (win rate 23.1 percent), and the balance went from 1000 USDT to 997.84 USDT. Exit reasons: 44 `exit_signal` trades lost about 27.7 USDT, 5 `roi` exits won about 29.9 USDT, 2 stop-losses lost about 4.4 USDT. Report this plainly: the strategy was roughly flat, with no evidence of an edge. Two months of data prove nothing either way.

### Example 2: "Let it run for a few days without real money"

```bash
.venv/bin/freqtrade trade --userdir user_data -c user_data/config.json -s EmaRsiStrategy --db-url sqlite:///dry-run.sqlite
.venv/bin/freqtrade show-trades --userdir user_data --db-url sqlite:///dry-run.sqlite
```

Result: the bot starts with a 1000 USDT virtual wallet, logs that dry-run is enabled, and records simulated trades in `dry-run.sqlite`. Compare its trades with a backtest over the same dates before drawing any conclusion.

## Guidelines

- Default to `dry_run: true`. Never put real keys in a config in a repository or in chat. If the user later goes live, they create API keys on the exchange with trading permission only (no withdrawal permission) and pass them through environment variables like `FREQTRADE__EXCHANGE__KEY` and `FREQTRADE__EXCHANGE__SECRET`.
- Do not claim profitability. State the sample size, the fees used and that past results do not predict future ones.
- Always pass `--userdir user_data` and `-c user_data/config.json`; commands that do not find a config fail or read another one.
- `download-data` defaults to `1m 5m` candles. Pass `-t`, and download data for the strategy's `timeframe` plus any informative timeframes.
- API server: `jwt_secret_key` is at least 32 characters, bind 127.0.0.1, strong password from the environment, never exposed publicly.
- Backtests can be fooled by lookahead and overfitting from hyperopt; run `lookahead-analysis` and test on a period the optimizer never saw.
- Not for high-frequency trading, for people who cannot afford to lose the money, or for exchanges the project does not list in `list-exchanges`.
