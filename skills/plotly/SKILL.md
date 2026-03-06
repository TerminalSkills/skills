---
name: plotly
category: Data Visualization
tags: [charts, interactive, python, javascript, dashboard, scientific]
version: 1.0.0
author: terminal-skills
---

# Plotly — Interactive Scientific Visualization

You are an expert in Plotly, the interactive charting library for Python and JavaScript. You help developers create publication-quality interactive charts — scatter plots, heatmaps, 3D surfaces, geographic maps, financial charts, and statistical plots with hover tooltips, zoom, and export capabilities.

## Core Capabilities

### Python (Plotly Express)

```python
# Quick, high-level API for common chart types
import plotly.express as px
import pandas as pd

# Scatter plot with color and size encoding
df = px.data.gapminder().query("year == 2007")
fig = px.scatter(
    df, x="gdpPercap", y="lifeExp",
    size="pop", color="continent",
    hover_name="country",
    log_x=True,
    size_max=60,
    title="GDP vs Life Expectancy (2007)"
)
fig.show()

# Time series with multiple lines
df = px.data.stocks()
fig = px.line(df, x="date", y=["GOOG", "AAPL", "AMZN", "FB", "MSFT"],
              title="Stock Prices Over Time")
fig.update_layout(yaxis_title="Price ($)", legend_title="Company")
fig.show()

# Heatmap
fig = px.imshow(
    correlation_matrix,
    text_auto=".2f",
    color_continuous_scale="RdBu_r",
    title="Feature Correlation Matrix"
)
fig.show()

# Geographic choropleth
fig = px.choropleth(
    df, locations="iso_alpha", color="gdpPercap",
    hover_name="country",
    color_continuous_scale="Viridis",
    title="GDP Per Capita by Country"
)
fig.show()

# Subplots
from plotly.subplots import make_subplots
import plotly.graph_objects as go

fig = make_subplots(rows=2, cols=2,
    subplot_titles=("Revenue", "Users", "Churn", "NPS"))
fig.add_trace(go.Bar(x=months, y=revenue), row=1, col=1)
fig.add_trace(go.Scatter(x=months, y=users, mode="lines"), row=1, col=2)
fig.add_trace(go.Scatter(x=months, y=churn, fill="tozeroy"), row=2, col=1)
fig.add_trace(go.Indicator(mode="gauge+number", value=72, gauge={"axis": {"range": [0, 100]}}), row=2, col=2)
fig.update_layout(height=600, showlegend=False)
fig.show()
```

### JavaScript (Plotly.js)

```typescript
import Plotly from "plotly.js-dist-min";

// Create interactive chart in the browser
Plotly.newPlot("chart", [
  {
    x: dates,
    y: values,
    type: "scatter",
    mode: "lines+markers",
    name: "Revenue",
    line: { color: "#4f46e5", width: 2 },
    hovertemplate: "%{x}<br>$%{y:,.0f}<extra></extra>",
  },
], {
  title: "Monthly Revenue",
  xaxis: { title: "Date" },
  yaxis: { title: "Revenue ($)", tickformat: "$,.0f" },
  hovermode: "x unified",
});

// React wrapper
import Plot from "react-plotly.js";
<Plot
  data={[{ x: [1,2,3], y: [2,6,3], type: "scatter", mode: "lines+markers" }]}
  layout={{ width: 800, height: 400, title: "My Chart" }}
/>
```

### Dash (Python Web Framework)

```python
# Build interactive dashboards with Plotly + Dash
from dash import Dash, html, dcc, callback, Output, Input
import plotly.express as px

app = Dash(__name__)

app.layout = html.Div([
    html.H1("Sales Dashboard"),
    dcc.Dropdown(id="region-filter",
        options=[{"label": r, "value": r} for r in regions],
        value="All", multi=False),
    dcc.Graph(id="revenue-chart"),
    dcc.Graph(id="breakdown-chart"),
])

@callback(
    Output("revenue-chart", "figure"),
    Input("region-filter", "value")
)
def update_chart(region):
    filtered = df if region == "All" else df[df.region == region]
    return px.line(filtered, x="date", y="revenue", title=f"Revenue — {region}")

app.run(debug=True)
```

## Installation

```bash
pip install plotly pandas             # Python
pip install dash                       # Dash framework
npm install plotly.js-dist-min         # JavaScript (minimal bundle)
npm install react-plotly.js            # React wrapper
```

## Best Practices

1. **Plotly Express for 80% of charts** — Use `px.scatter`, `px.line`, `px.bar` for quick charts; drop to `go.Figure` only for complex customization
2. **Hover templates** — Customize hover text with `hovertemplate`; `%{x}`, `%{y}`, `%{text}` are variables
3. **Dash for dashboards** — Use Dash (not Streamlit) when you need Plotly-specific interactivity and callbacks
4. **Export to static** — Use `fig.write_image("chart.png")` for reports; requires `kaleido` package
5. **Subplots for comparison** — Use `make_subplots` for multi-chart dashboards; shared axes for alignment
6. **Minimal JS bundle** — Use `plotly.js-dist-min` (800KB) instead of full `plotly.js` (3MB+) in web apps
7. **Color scales** — Use perceptually uniform scales (Viridis, Plasma) for quantitative data; categorical palettes for groups
8. **3D sparingly** — 3D charts look impressive but are hard to read; use 2D unless the third dimension adds real insight
