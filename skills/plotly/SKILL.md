---
name: plotly
description: >-
  Plotly is an open-source charting library that draws interactive charts (hover, zoom, pan, export) from Python with plotly.py and Plotly Express, or in the browser with plotly.js. Use when a user asks to plot data with Plotly, make a scatter plot, line chart, bar chart, heatmap, choropleth map, 3D chart or subplot grid, export a chart to HTML or PNG, build a Dash dashboard, add a chart to a React app with react-plotly.js, or fix a chart that broke after upgrading to plotly.py 6/7 or plotly.js 3/4.
license: Apache-2.0
compatibility: "Python 3.8+ for plotly.py (Dash needs 3.9+). Static image export needs Chrome or Chromium. plotly.js runs in any modern browser."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/plotly/plotly.py
  tags: ["charts", "interactive", "python", "javascript", "dashboard"]
---
# Plotly — Interactive Scientific Visualization

## Overview

Plotly is an interactive charting library for Python and JavaScript. plotly.py builds a figure (a JSON description of traces and layout) and plotly.js renders it in the browser with hover tooltips, zoom and export; Plotly Express is the one-call API on top, Dash turns figures into web dashboards, and react-plotly.js wraps plotly.js for React. This skill follows plotly.py 7.1 (which bundles plotly.js 4.1), Dash 4.4 and react-plotly.js 4.1.

## Instructions

### Python (Plotly Express)

```python
import plotly.express as px

# Scatter plot with color and size encoding
gap = px.data.gapminder().query("year == 2007")
fig = px.scatter(
    gap, x="gdpPercap", y="lifeExp",
    size="pop", color="continent",
    hover_name="country",
    log_x=True,
    size_max=60,
    title="GDP vs Life Expectancy (2007)"
)
fig.show()

# Time series with multiple lines
stocks = px.data.stocks()
fig = px.line(stocks, x="date", y=["GOOG", "AAPL", "AMZN", "FB", "MSFT"],
              title="Stock Prices Over Time")
fig.update_layout(yaxis_title="Price ($)", legend_title="Company")

# Heatmap of a correlation matrix
corr = px.data.iris().drop(columns=["species", "species_id"]).corr()
fig = px.imshow(corr, text_auto=".2f", color_continuous_scale="RdBu_r",
                title="Feature Correlation Matrix")

# Bar chart of totals per category: px.histogram sums the rows (px.bar draws one bar per row, so aggregate first)
tips = px.data.tips()
fig = px.histogram(tips, x="day", y="total_bill", histfunc="sum", color="sex", barmode="group",
                   category_orders={"day": ["Thur", "Fri", "Sat", "Sun"]})

# Geographic choropleth
fig = px.choropleth(
    gap, locations="iso_alpha", color="gdpPercap",
    hover_name="country",
    color_continuous_scale="Viridis",
    title="GDP Per Capita by Country"
)
```

Plotly Express accepts pandas, Polars and PyArrow data frames directly (since 6.0, through Narwhals), as well as dicts and lists.

Tile maps use `px.scatter_map`, `px.line_map`, `px.density_map` and `px.choropleth_map` (MapLibre, no access token). The `*_mapbox` functions and `go.Scattermapbox` were removed in 7.0.

### Subplots and graph objects

Non-cartesian traces (indicator, pie, 3D, maps) need a matching entry in `specs`; without it `add_trace` raises `ValueError: Trace type 'indicator' is not compatible with subplot type 'xy'`.

```python
from plotly.subplots import make_subplots
import plotly.graph_objects as go

months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]
revenue = [41200, 43850, 47310, 45120, 52480, 58930]
users = [1830, 1912, 2054, 2101, 2260, 2415]
churn = [2.9, 2.7, 2.8, 2.4, 2.2, 2.1]

fig = make_subplots(
    rows=2, cols=2,
    specs=[[{"type": "xy"}, {"type": "xy"}], [{"type": "xy"}, {"type": "indicator"}]],
    subplot_titles=("Revenue", "Users", "Churn %", ""),
)
fig.add_trace(go.Scatter(x=months, y=revenue, mode="lines+markers"), row=1, col=1)
fig.add_trace(go.Scatter(x=months, y=users, mode="lines"), row=1, col=2)
fig.add_trace(go.Scatter(x=months, y=churn, fill="tozeroy"), row=2, col=1)
fig.add_trace(go.Indicator(mode="gauge+number", value=72, title={"text": "NPS"},
                           gauge={"axis": {"range": [0, 100]}}), row=2, col=2)
fig.update_layout(height=600, showlegend=False)
```

### Export

```python
config = {"showSendToCloud": False, "displaylogo": False}

fig.show(config=config)                                  # browser or notebook
fig.write_html("report.html", include_plotlyjs="cdn", config=config)   # ~10 KB + CDN script
fig.write_html("offline.html", config=config)            # self-contained, embeds ~4.8 MB of plotly.js
fig.write_image("chart.png", width=1000, height=500, scale=2)          # also .svg, .pdf, .jpeg, .webp
```

`write_image` needs Kaleido 1.x and a Chrome or Chromium install. If none is found, run `plotly_get_chrome` (or `plotly.io.get_chrome()`). The `engine=` argument and Orca support were removed in 7.0. `plotly.io.write_images([...], [...])` exports many figures faster than a loop.

### JavaScript (Plotly.js)

Since plotly.js 3, titles must be objects: `title: "Monthly Revenue"` is ignored without an error.

```typescript
import Plotly from "plotly.js-dist-min";

const months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"];
const revenue = [41200, 43850, 47310, 45120, 52480, 58930];

// Renders into the element with id="revenue-chart"
Plotly.newPlot("revenue-chart", [
  {
    x: months,
    y: revenue,
    type: "scatter",
    mode: "lines+markers",
    name: "Revenue",
    line: { color: "#4f46e5", width: 2 },
    hovertemplate: "%{x|%b %Y}<br>$%{y:,.0f}<extra></extra>",
  },
], {
  title: { text: "Monthly Revenue" },
  xaxis: { title: { text: "Month" } },
  yaxis: { title: { text: "Revenue ($)" }, tickformat: "$,.0f" },
  hovermode: "x unified",
}, { responsive: true, displaylogo: false, showSendToCloud: false });

// Update in place: pass the complete new traces and layout — anything left out (axis titles, colors) reverts to defaults
Plotly.react("revenue-chart", [{ x: months, y: revenue.map((v) => v * 1.1) }], { title: { text: "Forecast" } });
```

### React (react-plotly.js)

The default export needs the full `plotly.js` package as a peer dependency. To use a prebuilt or partial bundle instead, build the component with the factory (`npm install react-plotly.js plotly.js-basic-dist-min`; the partial bundles ship no type declarations, so TypeScript also needs `npm install -D @types/plotly.js-basic-dist-min`):

```tsx
import Plotly from "plotly.js-basic-dist-min";   // partial bundle: scatter, bar and pie only, ~1.2 MB
import createPlotlyComponent from "react-plotly.js/factory";

const Plot = createPlotlyComponent(Plotly);

export function RevenueChart({ months, revenue }: { months: string[]; revenue: number[] }) {
  return (
    <Plot
      data={[{ x: months, y: revenue, type: "scatter", mode: "lines+markers" }]}
      layout={{ autosize: true, title: { text: "Monthly Revenue" } }}
      config={{ displaylogo: false, showSendToCloud: false }}
      style={{ width: "100%", height: "360px" }}
      useResizeHandler
    />
  );
}
```

The plot redraws only when `data`, `layout` or `config` change identity, so create new arrays and objects instead of mutating them. plotly.js needs a browser: importing it during server-side rendering throws `ReferenceError: self is not defined`, so in Next.js load this component with `next/dynamic` and `ssr: false`.

### Dash (Python Web Framework)

```python
# app.py — interactive dashboard with Plotly + Dash
from dash import Dash, html, dcc, callback, Output, Input
import plotly.express as px

df = px.data.gapminder()
continents = sorted(df["continent"].unique())

app = Dash(__name__)

app.layout = html.Div([
    html.H1("Life expectancy by continent"),
    dcc.Dropdown(id="continent", options=continents, value="Europe", clearable=False),
    dcc.Graph(id="life-exp", config={"showSendToCloud": False}),
])

@callback(Output("life-exp", "figure"), Input("continent", "value"))
def update_chart(continent):
    subset = df[df["continent"] == continent]
    return px.line(subset, x="year", y="lifeExp", color="country",
                   title=f"Life expectancy in {continent}")

if __name__ == "__main__":
    app.run(debug=True)   # http://127.0.0.1:8050 — app.run_server() was removed in Dash 3
```

## Installation

```bash
pip install "plotly[express]" pandas      # plotly.py + numpy for Plotly Express
pip install kaleido                        # static image export (needs Chrome: plotly_get_chrome)
pip install dash                           # Dash framework
npm install plotly.js-dist-min             # JavaScript, full minified bundle
npm install react-plotly.js plotly.js      # React wrapper + its peer dependency
```

## Examples

### Example 1: Chart for a report, as HTML and PNG

**User request:** "Plot monthly revenue from `revenue.csv` and give me an interactive HTML file plus a PNG for the slide deck."

```python
# revenue_chart.py — columns in revenue.csv: month (YYYY-MM-DD), revenue
import pandas as pd
import plotly.express as px

sales = pd.read_csv("revenue.csv", parse_dates=["month"])

fig = px.line(sales, x="month", y="revenue", markers=True, title="Monthly revenue")
fig.update_traces(hovertemplate="%{x|%b %Y}<br>$%{y:,.0f}<extra></extra>")
fig.update_layout(hovermode="x unified", yaxis_tickprefix="$", yaxis_tickformat=",.0f")

fig.write_html("revenue.html", include_plotlyjs="cdn", config={"showSendToCloud": False})
fig.write_image("revenue.png", width=1000, height=500, scale=2)
```

```bash
pip install "plotly[express]" pandas kaleido
python revenue_chart.py
```

Result: `revenue.html` (about 8 KB; it loads plotly.js from `cdn.plot.ly`, so it needs network access when opened) and `revenue.png` at 2000×1000 px. On a machine without Chrome the `write_image` line fails with "Kaleido requires Google Chrome to be installed"; `plotly_get_chrome -y` fixes that.

### Example 2: Upgrade a plotly.js 2 chart that lost its titles

**User request:** "After updating plotly.js our chart has no title or axis labels and there is a new Share button in the toolbar."

```diff
 Plotly.newPlot("signups-chart", traces, {
-  title: "Weekly signups",
-  xaxis: { title: "Week", titlefont: { size: 12 } },
-  yaxis: { title: "Signups" },
-});
+  title: { text: "Weekly signups" },
+  xaxis: { title: { text: "Week", font: { size: 12 } } },
+  yaxis: { title: { text: "Signups" } },
+}, { showSendToCloud: false });
```

Check any figure before shipping with `Plotly.validate`, which lists every key the current version rejects:

```javascript
console.log(Plotly.validate(traces, layout));
// [{ code: "object", msg: "In layout, key title must be linked to an object container", ... }]
```

After the change the title and both axis labels render again and the Share button is gone from the modebar. If the chart used `scattermapbox` traces, rename them to `scattermap` and the `mapbox` layout key to `map` in the same pass.

## Guidelines

1. **Plotly Express first** — `px.scatter`, `px.line`, `px.bar`, `px.histogram` and friends cover most charts; drop to `go.Figure` and `add_trace` for mixed trace types or fine control. Every `px` call returns a normal `go.Figure` you can keep editing with `update_layout` and `update_traces`.
2. **Hover templates** — `%{x}`, `%{y}`, `%{customdata[0]}` with d3 formats (`%{y:,.0f}`, `%{x|%b %Y}`); end with `<extra></extra>` to hide the trace-name box.
3. **The Share button uploads data** — plotly.js 4 shows a "Share chart" modebar button by default that sends the figure to Plotly Cloud after a confirmation. Set `showSendToCloud: False` in `config` for internal or sensitive data; this applies to `fig.show`, `write_html`, `dcc.Graph(config=...)` and `Plotly.newPlot`.
4. **Static export depends on Chrome** — Kaleido 1.x no longer ships a browser. In containers and CI, install Chromium or run `plotly_get_chrome -y` in the image build, not at request time.
5. **Bundle size** — the full `plotly.js-dist-min` is about 4.8 MB minified (1.5 MB gzipped). When you only need a few trace types use a partial bundle: `plotly.js-basic-dist-min` (scatter, bar, pie; ~1.2 MB), `-cartesian-`, `-geo-`, `-gl3d-`, `-finance-` or `-map-`.
6. **Colors in plotly.js 4** — `rgb(0.2, 0.4, 0.6)` is no longer read as fractions of 255 (it now renders almost black) and `hsv()` strings are rejected; use 0–255 values, hex or `hsl()`.
7. **Large data** — SVG rendering slows down past a few thousand points. Plotly Express picks WebGL on its own (`render_mode="auto"`); with graph objects or plotly.js use `go.Scattergl` / `type: "scattergl"`, or aggregate before plotting.
8. **Notebooks** — plotly.py 6+ needs Jupyter Notebook 7+ or JupyterLab; `go.FigureWidget` also needs `pip install anywidget`.
9. **`app.run(debug=True)` is for development** — the Dash debug mode enables a code-reloading dev server; deploy with a WSGI server such as `gunicorn app:server` after exposing `server = app.server`.
10. **3D sparingly** — 3D charts are hard to read; use 2D unless the third dimension adds real insight.
