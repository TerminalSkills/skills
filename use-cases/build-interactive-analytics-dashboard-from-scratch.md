---
title: Build a React Dashboard with Recharts, Plotly, and Mermaid Diagrams
slug: build-interactive-analytics-dashboard-from-scratch
description: >-
  Create a fintech analytics dashboard using Recharts for live metrics, Plotly for deep-dive charts, and Mermaid for architecture documentation.
skills: [recharts, plotly, mermaid]
category: data-ai
tags: [dashboard, analytics, charts, data-visualization, react]
---

# Build a React Dashboard with Recharts, Plotly, and Mermaid Diagrams

Priya is an engineering lead at a 50-person fintech startup processing 2 million transactions per day. The operations team relies on a manually-updated Google Sheets dashboard that is always 12 hours stale. When a payment processor goes down, nobody knows until customers complain.

## The Problem

The CEO keeps asking, "Why can't I see what's happening right now?" Leadership makes decisions on day-old data. Outages go undetected for hours because there is no real-time visibility into transaction volumes, error rates, or revenue metrics. The ops team needs live dashboards, engineering needs documented architecture, and nobody has time to build it from scratch.

## The Solution

Priya's team builds a real-time analytics dashboard using Recharts for interactive visualizations, Plotly for deep-dive heatmaps, Mermaid for architecture diagrams, and MkDocs Material for publishing internal documentation. The dashboard updates every 30 seconds via WebSocket.

## Step-by-Step Walkthrough

### 1. Build the Dashboard Layout with Recharts

The dashboard has three sections: KPI cards at the top, time-series charts in the middle, and breakdown tables at the bottom. The main revenue chart uses a WebSocket hook for live updates:

```tsx
// src/components/dashboard/revenue-chart.tsx
"use client";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Brush,
} from "recharts";
import { useRealtimeMetrics } from "@/hooks/use-realtime-metrics";

export function RevenueChart() {
  const { data, isLive } = useRealtimeMetrics("revenue", {
    windowHours: 24,
    intervalSeconds: 30,
  });
  const dailyAverage = useDailyAverage(data);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data}>
        <XAxis dataKey="timestamp"
          tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit",
          })} />
        <YAxis tickFormatter={(v) =>
          `${(v / 100).toLocaleString("en-US", {
            style: "currency", currency: "USD", notation: "compact",
          })}`} />
        <Tooltip content={<RevenueTooltip />} />
        <ReferenceLine y={dailyAverage} stroke="#f59e0b"
          strokeDasharray="5 5" label="7-day avg" />
        <Area type="monotone" dataKey="revenue"
          stroke="#4f46e5" fill="url(#revenueGradient)" />
        <Brush dataKey="timestamp" height={30} stroke="#4f46e5" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### 2. Add an Error Rate Heatmap with Plotly

For deeper analysis, a Plotly heatmap shows error rates by hour and day of week. This reveals patterns like recurring spikes during batch jobs:

```python
# analytics-api/heatmap.py
import plotly.graph_objects as go
import pandas as pd

def generate_error_heatmap(transactions_df: pd.DataFrame) -> dict:
    df = transactions_df.copy()
    df["hour"] = df["timestamp"].dt.hour
    df["day"] = df["timestamp"].dt.day_name()

    pivot = df.pivot_table(
        values="status", index="hour", columns="day",
        aggfunc=lambda x: (x == "failed").sum() / len(x) * 100,
    )
    day_order = ["Monday","Tuesday","Wednesday","Thursday",
                 "Friday","Saturday","Sunday"]
    pivot = pivot.reindex(columns=day_order)

    fig = go.Figure(data=go.Heatmap(
        z=pivot.values, x=pivot.columns,
        y=[f"{h:02d}:00" for h in pivot.index],
        colorscale="RdYlGn_r",
        texttemplate="%{text:.1f}%",
    ))
    return fig.to_json()
```

### 3. Document Architecture and Publish with MkDocs

The data pipeline (payment processors, Kafka, ClickHouse, WebSocket API) is documented with Mermaid diagrams that render automatically in MkDocs Material. The docs site includes architecture overviews, runbooks for common incidents, and API references — all versioned in Git alongside the code.

## Real-World Example

Priya, engineering lead at FinFlow (a payment processing startup), ships the dashboard after a 3-week sprint:

1. She scaffolds the Recharts dashboard with KPI cards for revenue, transaction count, error rate, and P99 latency
2. The team adds the Plotly error heatmap and discovers that errors spike every Tuesday at 2 AM during a batch reconciliation job that locks the payments table
3. Architecture docs go live on MkDocs Material at `docs.internal.finflow.com/analytics`
4. The operations team detects a payment processor outage within 30 seconds instead of 2 hours
5. Engineering fixes the Tuesday batch job — error rates drop from 0.8% to 0.1%
6. The CEO opens the live dashboard on his phone during board meetings

## Related Skills

No matching skills are currently available in the marketplace for this use case.
