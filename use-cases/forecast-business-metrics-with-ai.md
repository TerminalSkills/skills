---
title: Forecast Business Metrics with AI
description: >-
  An e-commerce operations manager uses Google TimesFM to forecast product
  demand, revenue, and inventory needs across 500+ SKUs — zero-shot,
  no ML expertise required.
skills: [timesfm]
category: business
tags: [forecasting, e-commerce, demand-planning, inventory, time-series, ai]
---

# Forecast Business Metrics with AI

## The Scenario

You're the operations manager at a mid-size e-commerce company selling 500+ products. Every month you face:

- **Overstocking** slow-moving items → cash tied up in inventory
- **Stockouts** on popular products → lost revenue and frustrated customers
- **Manual forecasting** in spreadsheets → takes 2 days, still inaccurate
- **Seasonal spikes** → hard to capture with simple moving averages

You need 30-day demand forecasts for all products. You don't have a data science team. You need something that works out of the box.

## Why TimesFM

Google's TimesFM is a foundation model for time series — like GPT-4 but for numbers:

- **Zero-shot** — No training, no model tuning, no ML expertise required
- **Batch processing** — Forecast all 500 products in a single call
- **Accurate** — Outperforms ARIMA and basic Prophet on diverse datasets
- **Fast** — Minutes on GPU vs. hours of per-product model training

## Step 1: Prepare Your Data

Export daily sales from your platform (Shopify, WooCommerce, custom DB):

```python
import pandas as pd

# Expected columns: date, product_id, units_sold
df = pd.read_csv("daily_sales.csv", parse_dates=["date"])
df = df.sort_values(["product_id", "date"])

print(f"Products: {df['product_id'].nunique()}")
print(f"Date range: {df['date'].min()} to {df['date'].max()}")
# Products: 523
# Date range: 2024-01-01 to 2026-03-31
```

### Fill Missing Days

```python
# Products with zero sales on a day may be missing rows
all_dates = pd.date_range(df["date"].min(), df["date"].max(), freq="D")

filled = []
for pid in df["product_id"].unique():
    prod = df[df["product_id"] == pid].set_index("date")
    prod = prod.reindex(all_dates, fill_value=0)
    prod["product_id"] = pid
    filled.append(prod)

df_clean = pd.concat(filled).reset_index().rename(columns={"index": "date"})
```

## Step 2: Install and Initialize TimesFM

```bash
pip install timesfm pandas matplotlib
```

```python
import timesfm

tfm = timesfm.TimesFm(
    hparams=timesfm.TimesFmHparams(
        backend="gpu",          # "cpu" if no GPU
        per_core_batch_size=64, # reduce if OOM
        horizon_len=30,         # 30-day forecast
    ),
    checkpoint=timesfm.TimesFmCheckpoint(
        huggingface_repo_id="google/timesfm-1.0-200m-pytorch"
    ),
)
# Model downloads ~1.5GB on first run
```

## Step 3: Batch Forecast All Products

```python
import numpy as np

product_ids = df_clean["product_id"].unique()
series_list = []
freq_list = []

for pid in product_ids:
    sales = df_clean[df_clean["product_id"] == pid]["units_sold"].values
    series_list.append(sales.astype(np.float32))
    freq_list.append(1)  # 1 = daily

print(f"Forecasting {len(series_list)} products...")
point_forecasts, quantile_forecasts = tfm.forecast(series_list, freq=freq_list)
print(f"Done. Shape: {point_forecasts.shape}")
# Done. Shape: (523, 30)
```

## Step 4: Build Forecast DataFrame

```python
forecast_rows = []
last_date = df_clean["date"].max()
future_dates = pd.date_range(last_date + pd.Timedelta(days=1), periods=30, freq="D")

for i, pid in enumerate(product_ids):
    for j, date in enumerate(future_dates):
        forecast_rows.append({
            "date": date,
            "product_id": pid,
            "predicted_units": max(0, round(float(point_forecasts[i, j]))),
        })

forecast_df = pd.DataFrame(forecast_rows)

# Summarize: total demand per product over 30 days
demand_30d = (
    forecast_df.groupby("product_id")["predicted_units"]
    .sum()
    .sort_values(ascending=False)
    .reset_index()
    .rename(columns={"predicted_units": "forecast_demand_30d"})
)
print(demand_30d.head(10))
```

## Step 5: Identify Stockout Risks

```python
# Load current inventory levels
inventory = pd.read_csv("inventory.csv")  # columns: product_id, stock_on_hand

risk = demand_30d.merge(inventory, on="product_id")
risk["daily_demand"] = risk["forecast_demand_30d"] / 30
risk["days_of_stock"] = risk["stock_on_hand"] / risk["daily_demand"].replace(0, 0.01)
risk["stockout_risk"] = risk["days_of_stock"] < 14  # < 2 weeks = at risk

at_risk = risk[risk["stockout_risk"]].sort_values("days_of_stock")
print(f"⚠️  {len(at_risk)} products at stockout risk:")
print(at_risk[["product_id", "stock_on_hand", "forecast_demand_30d", "days_of_stock"]].head(20))
```

## Step 6: Generate Reorder Report

```python
# Calculate how much to reorder (1.2x safety factor)
risk["reorder_qty"] = (
    (risk["forecast_demand_30d"] * 1.2) - risk["stock_on_hand"]
).clip(lower=0).round()

reorder = risk[risk["reorder_qty"] > 0].sort_values("reorder_qty", ascending=False)

reorder[[
    "product_id", "stock_on_hand", "forecast_demand_30d",
    "days_of_stock", "reorder_qty"
]].to_csv("reorder_report.csv", index=False)

print(f"📦 {len(reorder)} products need restocking")
print(f"Total units to order: {reorder['reorder_qty'].sum():,.0f}")
```

## Step 7: Visualize Key Products

```python
import matplotlib.pyplot as plt

def plot_product_forecast(product_id, history_days=90):
    hist = df_clean[df_clean["product_id"] == product_id]["units_sold"].values[-history_days:]
    idx = list(product_ids).index(product_id)
    pred = point_forecasts[idx, :30]

    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(range(len(hist)), hist, label="Historical", color="steelblue")
    ax.plot(range(len(hist), len(hist) + len(pred)), pred,
            label="Forecast", color="coral", linestyle="--", linewidth=2)
    ax.axvline(x=len(hist), color="gray", linestyle=":", alpha=0.5)
    ax.set_title(f"Product {product_id} — 30-Day Forecast")
    ax.set_xlabel("Days")
    ax.set_ylabel("Units Sold")
    ax.legend()
    plt.tight_layout()
    plt.savefig(f"forecast_{product_id}.png", dpi=150)
    plt.close()

for pid in at_risk["product_id"].head(5):
    plot_product_forecast(pid)
```

## Step 8: Automate Weekly Runs

```bash
# cron: every Monday 6am
0 6 * * 1 cd /opt/forecasting && python forecast_pipeline.py >> /var/log/forecast.log 2>&1
```

```python
# forecast_pipeline.py — full automation
# 1. Pull fresh sales data from DB or API
# 2. Run TimesFM batch forecast
# 3. Compare with inventory levels
# 4. Generate reorder_report.csv
# 5. Email report to purchasing team
# 6. Push KPIs to dashboard (Grafana, Metabase, etc.)
```

## Results (3 Months Later)

| Metric                    | Before       | After        | Change |
|---------------------------|--------------|--------------|--------|
| Monthly stockouts         | 45 incidents | 12 incidents | −73%   |
| Overstock value           | $520K        | $340K        | −35%   |
| Forecast accuracy (MAPE)  | 33% error    | 11% error    | +67%   |
| Time on forecasting/month | 2 days       | 15 minutes   | −98%   |
| Working capital freed     | —            | $180K        | —      |

## Tips

- **More history = better**: Feed at least 90 days; 1+ year for seasonal products
- **Update weekly**: Re-run forecasts with fresh sales data for best accuracy
- **Adjust for promotions**: TimesFM doesn't know about planned sales events — add a manual multiplier for promo periods
- **Monitor accuracy**: Track predicted vs. actual weekly; flag products where model consistently misses
- **Start with top SKUs**: Begin with top 50 products by revenue, expand once validated
- **Quantile forecasts**: Use `quantile_forecasts` for P10/P90 bounds to set min/max reorder quantities
