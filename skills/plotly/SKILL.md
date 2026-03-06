---
name: plotly
category: Data Visualization
tags: [charts, interactive, python, javascript, dashboard, scientific]
version: 1.0.0
author: terminal-skills
---

# Plotly — Interactive Scientific Visualization

You are an expert in Plotly, the interactive charting library for Python and JavaScript. You help developers create publication-quality charts — scatter plots, heatmaps, 3D surfaces, geographic maps, financial charts, and statistical plots with hover tooltips, zoom, and export.

## Core Capabilities

### Python (Plotly Express)

```python
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# Scatter with color and size encoding
fig = px.scatter(df, x="gdpPercap", y="lifeExp", size="pop", color="continent",
                 hover_name="country", log_x=True, size_max=60)
fig.show()

# Time series
fig = px.line(df, x="date", y=["GOOG", "AAPL", "AMZN"], title="Stock Prices")
fig.update_layout(yaxis_title="Price ($)")

# Heatmap
fig = px.imshow(corr_matrix, text_auto=".2f", color_continuous_scale="RdBu_r")

# Geographic choropleth
fig = px.choropleth(df, locations="iso_alpha", color="gdpPercap",
                    hover_name="country", color_continuous_scale="Viridis")

# Subplots dashboard
fig = make_subplots(rows=2, cols=2, subplot_titles=("Revenue", "Users", "Churn", "NPS"))
fig.add_trace(go.Bar(x=months, y=revenue), row=1, col=1)
fig.add_trace(go.Scatter(x=months, y=users, mode="lines"), row=1, col=2)
fig.update_layout(height=600, showlegend=False)

# Export to static image
fig.write_image("chart.png")  # requires kaleido
fig.write_html("chart.html")  # interactive HTML
```

### Dash (Python Web Dashboards)

```python
from dash import Dash, html, dcc, callback, Output, Input

app = Dash(__name__)

app.layout = html.Div([
    dcc.Dropdown(id="metric", options=["Revenue", "Users", "Churn"], value="Revenue"),
    dcc.Graph(id="chart"),
])

@callback(Output("chart", "figure"), Input("metric", "value"))
def update(metric):
    return px.line(df, x="date", y=metric, title=f"{metric} Over Time")

app.run(debug=True)
```

### JavaScript / React

```tsx
import Plot from "react-plotly.js";

<Plot
  data={[{ x: dates, y: values, type: "scatter", mode: "lines+markers" }]}
  layout={{ width: 800, height: 400, title: "Revenue" }}
/>
```

## Installation

```bash
pip install plotly pandas kaleido       # Python
npm install plotly.js-dist-min react-plotly.js  # JavaScript
```

## Best Practices

1. **Plotly Express for 80%** — Use `px.scatter/line/bar` for quick charts; `go.Figure` only for complex customization
2. **Hover templates** — Customize with `hovertemplate="%{x}<br>$%{y:,.0f}<extra></extra>"`
3. **Dash for dashboards** — Use Dash for interactive Python dashboards with callbacks
4. **Minimal JS bundle** — `plotly.js-dist-min` (800KB) instead of full `plotly.js` (3MB+)
5. **Perceptually uniform colors** — Viridis, Plasma for quantitative; categorical palettes for groups
6. **Export with kaleido** — `fig.write_image()` for reports; `fig.write_html()` for sharing
7. **Subplots** — `make_subplots` for multi-chart dashboards; shared axes for alignment
8. **3D sparingly** — 3D looks impressive but is hard to read; use only when third dimension adds insight
