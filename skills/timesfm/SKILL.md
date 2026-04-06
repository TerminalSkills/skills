---
name: timesfm
description: >-
  Forecast time series data using Google's TimesFM foundation model with zero-shot
  prediction. Use when: forecasting sales or demand, predicting server metrics,
  financial time series analysis, anomaly detection without training custom models.
license: Apache-2.0
compatibility: "Python 3.10+, PyTorch"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["forecasting", "time-series", "google-research"]
---

# TimesFM

## Overview

TimesFM is a 200M-parameter foundation model by Google Research, pretrained on 100 billion real-world time points. It performs zero-shot forecasting across domains — no fine-tuning required. Feed it historical data, get predictions immediately.

## Instructions

### Installation

```bash
pip install timesfm
```

### Basic Forecasting

```python
import timesfm
import numpy as np

# Initialize model
tfm = timesfm.TimesFm(
    hparams=timesfm.TimesFmHparams(
        per_core_batch_size=32,
        horizon_len=30,
    ),
    checkpoint=timesfm.TimesFmCheckpoint(
        huggingface_repo_id="google/timesfm-2.0-200m-pytorch",
    ),
)

# Your historical data (e.g., daily sales for 1 year)
history = np.array([120, 135, 128, 142, 155, 148, 160, ...])

# Forecast next 30 days
forecasts = tfm.forecast([history], freq=[1])
predictions = forecasts[0]  # shape: (30,)
```

### Frequency Parameter

Set `freq` to match your data granularity:
- `0`: High frequency (seconds/minutes)
- `1`: Daily
- `2`: Weekly/Monthly

### Multi-Series Forecasting

```python
# Forecast multiple product categories at once
series = [sales_electronics, sales_clothing, sales_food]
forecasts = tfm.forecast(series, freq=[1, 1, 1])
# Returns list of 3 forecast arrays
```

## Examples

**Example 1: Demand forecasting**

Input: 365 days of daily product sales data.
Output: 30-day forecast with the model capturing weekly seasonality and growth trend automatically.

```python
history = load_csv("daily_sales.csv")["quantity"].values
forecast = tfm.forecast([history], freq=[1])[0]
print(f"Next 7 days: {forecast[:7]}")
# Next 7 days: [182, 175, 190, 168, 195, 201, 178]
```

**Example 2: Server metrics anomaly detection**

Input: 720 hours (30 days) of CPU utilization.
Output: Forecast next 24 hours. Flag if actual exceeds forecast by 2x standard deviation.

```python
cpu_history = get_metrics("cpu_percent", days=30)
forecast = tfm.forecast([cpu_history], freq=[0])[0]
threshold = forecast.mean() + 2 * forecast.std()
```

## Guidelines

- Provide at least 3x the forecast horizon as history (forecasting 30 days? give 90+ days history)
- TimesFM works best on data with clear patterns (seasonality, trends)
- For noisy data, smooth with rolling average before feeding to the model
- Compare against a naive baseline (last period's values) to validate improvement
- The model runs on CPU; GPU speeds up batch processing of many series
