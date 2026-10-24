---
name: timesfm
description: >-
  Forecasts time series with Google's pretrained TimesFM foundation model, zero-shot
  and with no training step. Use when the user asks to forecast sales or demand,
  predict server metrics, get prediction intervals, add covariates, or flag
  anomalies against a forecast without building a custom model.
license: Apache-2.0
compatibility: "Python 3.10+, PyTorch 2.x (or Apple silicon with MLX); first run downloads weights from Hugging Face"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/google-research/timesfm"
  category: data-ai
  tags: ["forecasting", "time-series", "google-research"]
---

# TimesFM

## Overview

TimesFM is a pretrained decoder-only time-series foundation model from Google Research. You pass raw history, it returns a point forecast and quantiles with no fitting. The open-source package `timesfm` (latest on PyPI: 3.0.2, September 2026) ships two generations of weights, and they have different licenses:

| Model | Python API | Weights license |
|---|---|---|
| TimesFM 2.5 (200M parameters, context up to 16k, quantile head up to 1k horizon, no `freq` argument) | `timesfm.TimesFM_2p5_200M_torch` | Apache-2.0 |
| TimesFM 3.0 (multivariate series, past-only and past-and-future covariates) | `timesfm3.TimesFM3Forecaster` | non-commercial license: no commercial or production use of downloaded weights (production use goes through BigQuery ML) |

Pick 2.5 unless the user needs 3.0 features and the use is non-commercial. The 1.x/2.0 API (`timesfm.TimesFm`, `TimesFmHparams`, `freq=[...]`) no longer exists in 3.x; it needs `pip install timesfm==1.3.0`.

## Instructions

### Installation

```bash
python -m venv .venv && source .venv/bin/activate
pip install "timesfm[torch]"      # add [mlx] for Apple silicon, [xreg] for covariates on 2.5
```

Weights come from Hugging Face on first use (`google/timesfm-2.5-200m-pytorch`, `google/timesfm-3.0-pytorch`), so the first run needs network access and disk space.

### Forecast with TimesFM 2.5

```python
import numpy as np
import timesfm

model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
model.compile(
    timesfm.ForecastConfig(
        max_context=1024,          # longer inputs are truncated to the latest points
        max_horizon=256,           # must cover the horizon you ask for
        normalize_inputs=True,
        use_continuous_quantile_head=True,
        force_flip_invariance=True,
        infer_is_positive=True,    # keeps non-negative series non-negative
        fix_quantile_crossing=True,
    )
)

point, quantiles = model.forecast(horizon=30, inputs=[daily_units, daily_orders])
# point: (2, 30), the median; quantiles: (2, 30, 10) = mean followed by the 0.1 ... 0.9 quantiles
```

`inputs` is a list of 1-D float arrays; lengths may differ, and leading NaNs are stripped. There is no frequency argument: the model infers seasonality from the values.

### Forecast with TimesFM 3.0 (non-commercial weights)

```python
import numpy as np
from timesfm3 import TimesFM3Forecaster

model = TimesFM3Forecaster.from_pretrained("google/timesfm-3.0-pytorch")  # pass device="cuda" to force a GPU

# One multivariate target: shape (num_variates, context_length)
target = np.stack([price_history, volume_history]).astype(np.float32)
out = model.predict(target, horizon=24, return_quantiles=True)
out.forecast.shape    # (2, 24)
out.quantiles.shape   # (2, 24, 9)
```

Covariates go in `past_only_covariates` (shape `(k, context_length)`) and `past_future_covariates` (shape `(k, context_length + horizon)`, so future values such as promotions or holidays must be known). `predict_batch(contexts=[...], horizon=...)` runs many series and yields one `ForecastOutput` each. On Apple silicon use `from timesfm3.mlx import TimesFM3Forecaster`.

## Examples

**Example 1: "Forecast the next 14 days of daily orders from this CSV"**

```python
import numpy as np
import pandas as pd
import timesfm

orders = pd.read_csv("daily_orders.csv", parse_dates=["date"]).sort_values("date")
history = orders["quantity"].to_numpy(dtype=np.float32)   # 365 daily rows

model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
model.compile(timesfm.ForecastConfig(max_context=512, max_horizon=64, normalize_inputs=True,
                                     use_continuous_quantile_head=True, infer_is_positive=True))
point, quantiles = model.forecast(horizon=14, inputs=[history])
print(np.round(point[0][:7]))      # next 7 days, one value per day
low, high = quantiles[0, :, 1], quantiles[0, :, 9]   # 0.1 and 0.9 quantiles: an 80% band
```

The result keeps the weekly shape of the history. Index 0 of the last axis is the mean, so use 1 to 9 for the quantiles.

**Example 2: "Alert me when CPU is outside the forecast band"**

```python
import numpy as np
import timesfm

# cpu_percent_30d: 720 hourly samples; cpu_percent_next_day: the 24 samples that actually arrived
model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
model.compile(timesfm.ForecastConfig(max_context=720, max_horizon=24, normalize_inputs=True,
                                     use_continuous_quantile_head=True, fix_quantile_crossing=True))
_, q = model.forecast(horizon=24, inputs=[cpu_percent_30d])
low, high = q[0, :, 1], q[0, :, 9]
anomalies = np.where((cpu_percent_next_day < low) | (cpu_percent_next_day > high))[0]
print(f"{len(anomalies)} of 24 hours outside the 80% band: {anomalies.tolist()}")
```

An 80% band leaves about 2 in 10 normal points outside it, so alert on several consecutive misses, not one.

## Guidelines

- Check the license before recommending 3.0: its downloaded weights are for non-commercial, non-production use. For business use, stay on 2.5 (Apache-2.0) or use BigQuery ML.
- `max_horizon` and `max_context` are fixed at `compile()`. Asking `forecast()` for a longer horizon than `max_horizon`, or recompiling per call, is the usual cause of errors and slowness.
- Give clean, evenly spaced values. Interpolate gaps yourself for anything but short runs; do not feed raw timestamps.
- Give enough history to show two or three seasonal cycles; more context helps up to `max_context`.
- Always compare with a naive baseline (last week repeated) on a held-out tail before trusting the forecast.
- The model runs on CPU; a GPU or Apple silicon helps when you forecast many series in one call.
- Not an officially supported Google product in its open-source form.
