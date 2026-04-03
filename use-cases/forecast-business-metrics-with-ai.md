---
title: Forecast Business Metrics with AI
description: >-
  An e-commerce operations manager uses Google TimesFM to forecast product
  demand, revenue, and inventory needs — zero-shot, no ML expertise required.
skills: [timesfm]
category: business
tags: [forecasting, e-commerce, demand-planning, inventory, time-series, ai]
---

# Forecast Business Metrics with AI

## The Scenario

You're the operations manager at a mid-size e-commerce company selling 500+ products. Every month you struggle with:

- **Overstocking** slow-moving items → cash tied up in inventory
- **Stockouts** on popular items → lost revenue and angry customers
- **Manual forecasting** in spreadsheets → takes 2 days, still inaccurate
- **Seasonal patterns** → hard to capture with simple moving averages

You need demand forecasts for the next 30 days across all products. You don't have a data science team. You need something that works out of the box.

## Why TimesFM

Google's TimesFM is a foundation model for time series — like GPT but for numbers:

- **Zero-shot** — No training, no tuning, no ML expertise needed
- **Batch processing** — Forecast 500 products in one call
- **Accurate** — Outperforms ARIMA and basic Prophet on diverse datasets
- **Fast** — Minutes on GPU, not hours of training per product

## Step 1: Prepare Your Data

Export daily sales from your e-commerce platform:

```python
import pandas as pd

# Load sales data (columns: date, product_id, units_sold, revenue)
df = pd.read_csv("daily_sales.csv", parse_dates=["date"])
df = df.sort_values(["product_id", "date"])

print(f"Products: {df['product_id'].nunique()}")
print(f"Date range: {df['date'].min()} to {df['date'].max()}")
print(f"Total rows: {len(df)}")

# Example output:
# Products: 523
# Date range: 2024-01-01 to 2026-03-31
# Total rows: 382,000
```

### Handle Missing Days

```python
# Fill gaps — some products may have zero-sale days missing
all_dates = pd.date_range(df["date"].min(), df["date"].max(), freq="D")

filled_dfs = []
for pid in df["product_id"].unique():
    product_df = df[df["product_id"] == pid].set_index("date")
    product_df = product_df.reindex(all_dates, fill_value=0)
    product_df["product_id"] = pid
    filled_dfs.append(product_df)

df_clean = pd.concat(filled_dfs).reset_index().rename(columns={"index": "date"})
print(f"Clean rows: {len(df_clean)}")
```

## Step 2: Install and Initialize TimesFM

```bash
pip install timesfm pandas matplotlib
```

```python
import timesfm

tfm = timesfm.TimesFm(
    hparams=timesfm.TimesFmHparams(
        backend="gpu",           # Use "cpu" if no GPU
        per_core_batch_size=64,  # Adjust based on GPU memory
        horizon_len=30,          # Forecast 30 days ahead
    ),
    checkpoint=timesfm.TimesFmCheckpoint(
        huggingface_repo_id="google/timesfm-1.0-200m-pytorch"
    ),
)
```

## Step 3: Batch Forecast All Products

```python
import numpy as np

# Prepare input: list of time series arrays
product_ids = df_clean["product_id"].unique()
series_list = []
freq_list = []

for pid in product_ids:
    product_data = df_clean[df_clean["product_id"] == pid]["units_sold"].values
    series_list.append(product_data.astype(np.float32))
    freq_list.append(1)  # 1 = daily frequency

# Forecast all products at once
print(f"Forecasting {len(series_list)} products...")
point_forecasts, quantile_forecasts = tfm.forecast(series_list, freq=freq_list)
print(f"Done! Shape: {point_forecasts.shape}")
# Output: Done! Shape: (523, 30)
```

## Step 4: Analyze Forecasts

```python
# Build forecast DataFrame
forecast_rows = []
last_date = df_clean["date"].max()
future_dates = pd.date_range(last_date + pd.Timedelta(days=1), periods=30, freq="D")

for i, pid in enumerate(product_ids):
    for j, date in enumerate(future_dates):
        forecast_rows.append({
            "date": date,
            "product_id": pid,
            "predicted_units": max(0, round(point_forecasts[i, j])),
        })

forecast_df = pd.DataFrame(forecast_rows)

# Top 10 products by predicted demand
top_demand = (
    forecast_df.groupby("product_id")["predicted_units"]
    .sum()
    .sort_values(ascending=False)
    .head(10)
)
print("Top 10 products by predicted 30-day demand:")
print(top_demand)
```

### Identify Stockout Risks

```python
# Load current inventory
inventory = pd.read_csv("inventory.csv")  # columns: product_id, stock_on_hand

# Compare forecast demand vs. current stock
demand_30d = forecast_df.groupby("product_id")["predicted_units"].sum().reset_index()
demand_30d.columns = ["product_id", "forecast_demand_30d"]

risk = demand_30d.merge(inventory, on="product_id")
risk["days_of_stock"] = risk["stock_on_hand"] / (risk["forecast_demand_30d"] / 30)
risk["stockout_risk"] = risk["days_of_stock"] < 14  # Less than 2 weeks

at_risk = risk[risk["stockout_risk"]].sort_values("days_of_stock")
print(f"\n⚠️ {len(at_risk)} products at stockout risk:")
print(at_risk[["product_id", "stock_on_hand", "forecast_demand_30d", "days_of_stock"]].head(20))
```

## Step 5: Visualize Key Products

```python
import matplotlib.pyplot as plt

def plot_forecast(product_id, history_days=90):
    hist = df_clean[df_clean["product_id"] == product_id]["units_sold"].values[-history_days:]
    idx = list(product_ids).index(product_id)
    pred = point_forecasts[idx, :30]

    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(range(len(hist)), hist, label="Historical", color="steelblue")
    ax.plot(range(len(hist), len(hist) + len(pred)), pred, label="Forecast",
            color="coral", linestyle="--", linewidth=2)
    ax.axvline(x=len(hist), color="gray", linestyle=":", alpha=0.5)
    ax.set_title(f"Product {product_id} — 30-Day Demand Forecast")
    ax.set_xlabel("Days")
    ax.set_ylabel("Units Sold")
    ax.legend()
    plt.tight_layout()
    plt.savefig(f"forecast_{product_id}.png", dpi=150)
    plt.close()

# Plot top 5 at-risk products
for pid in at_risk["product_id"].head(5):
    plot_forecast(pid)
    print(f"Saved forecast_{pid}.png")
```

## Step 6: Generate Reorder Report

```python
# Calculate reorder quantities
risk["reorder_qty"] = (risk["forecast_demand_30d"] * 1.2 - risk["stock_on_hand"]).clip(lower=0).round()

reorder = risk[risk["reorder_qty"] > 0].sort_values("reorder_qty", ascending=False)

# Export to CSV for purchasing team
reorder[["product_id", "stock_on_hand", "forecast_demand_30d", "days_of_stock", "reorder_qty"]].to_csv(
    "reorder_report.csv", index=False
)
print(f"\n📦 Reorder report: {len(reorder)} products need restocking")
print(f"Total units to order: {reorder['reorder_qty'].sum():,.0f}")
```

## Step 7: Automate Weekly Forecasts

```bash
# cron: run every Monday at 6am
0 6 * * 1 cd /opt/forecasting && python forecast_pipeline.py >> /var/log/forecast.log 2>&1
```

```python
# forecast_pipeline.py — full pipeline script
# 1. Pull latest sales data from DB
# 2. Run TimesFM forecast
# 3. Compare with inventory
# 4. Generate reorder report
# 5. Email report to purchasing team
# 6. Push metrics to dashboard
```

## Results

After 3 months of using TimesFM-powered forecasting:

- **Stockouts reduced by 72%** — from 45/month to 12/month
- **Overstock reduced by 35%** — freed up $180K in working capital
- **Forecast accuracy: 89%** (MAPE) — vs. 67% with manual spreadsheets
- **Time saved: 2 days/month** — fully automated, no manual forecasting
- **ROI: 8x** in first quarter — cost of GPU instance vs. inventory savings

## Tips

- **More history = better**: Feed at least 90 days, ideally 1+ year for seasonal products
- **Update weekly**: Re-run forecasts with fresh data for best accuracy
- **Combine with domain knowledge**: TimesFM doesn't know about upcoming promotions — adjust forecasts manually for planned events
- **Monitor accuracy**: Track predicted vs. actual weekly, flag products where model struggles
- **Start simple**: Begin with top 50 products by revenue, expand once validated
