---
name: timesfm
description: >-
  Forecast time series data using Google TimesFM foundation model — pretrained for zero-shot forecasting. Use when: predicting sales, demand forecasting, financial time series, anomaly detection.
license: Apache-2.0
compatibility: "Python 3.10+, JAX"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [time-series, forecasting, google, foundation-model, prediction, analytics]
  use-cases:
    - "Example use case 1"
    - "Example use case 2"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# TimesFM

## Overview

TimesFM is a 200M parameter foundation model by Google Research, pretrained on 100 billion real-world time points. It performs zero-shot forecasting — no fine-tuning needed.

## Installation

```bash
pip install timesfm
```

## Basic Forecasting

```python
import timesfm
import numpy as np

tfm = timesfm.TimesFm(
    hparams=timesfm.TimesFmHparams(per_core_batch_size=32, horizon_len=30),
    checkpoint=timesfm.TimesFmCheckpoint(huggingface_repo_id=\"google/timesfm-2.0-200m-pytorch\"),
)

# Historical sales data (daily)
history = np.array([120, 135, 128, 142, 155, 148, 160, 172, 165, 180, ...])  # 365 days

# Forecast next 30 days
forecast = tfm.forecast([history], freq=[1])
print(forecast[0])  # shape: (30,)
```

## Multi-variate

```python
# Multiple product categories
categories = [sales_electronics, sales_clothing, sales_food]
forecasts = tfm.forecast(categories, freq=[1, 1, 1])
```

## vs Traditional Methods

| Method | Setup Time | Accuracy | Zero-shot |
|--------|-----------|----------|----------|
| ARIMA | Hours | Good for stationary | No |
| Prophet | Minutes | Good for seasonal | No |
| TimesFM | Seconds | Excellent | Yes |

## Use Cases

- Demand forecasting for inventory
- Revenue prediction
- Server metrics anomaly detection
- Energy consumption forecasting
- Financial market analysis
