---
name: echarts
description: >-
  Creates interactive data visualizations with Apache ECharts, the open-source JavaScript charting library. Use when a user asks to build charts, dashboards, or data-driven graphics using ECharts in React, Vue, or vanilla JavaScript applications, render a chart to SVG on the server, or upgrade from ECharts 5 to 6.
license: Apache-2.0
compatibility: "ECharts 6.x (checked against 6.1.0) in modern browsers, or Node.js for server-side SVG. React: echarts-for-react 3.0.6. Vue: vue-echarts 8 (Vue 3.3+, ECharts 6 only)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["charts", "interactive", "canvas", "dashboard", "analytics"]
  repository: https://github.com/apache/echarts
---
# ECharts — Enterprise Data Visualization

## Overview

Apache ECharts is an open-source (Apache-2.0) JavaScript charting library. A chart is one plain `option` object passed to `chart.setOption()`: line, bar, pie, scatter, heatmap, tree, sankey, geographic and custom series, with tooltips, zooming, animation and themes built in. It draws on Canvas (the default) or SVG, and in Node.js it can produce an SVG string without a browser. ECharts 6 changed the default theme and added runtime theme switching plus chord, beeswarm, broken-axis and matrix-layout charts.

## Instructions

### Installation

```bash
npm install echarts                       # Vanilla JS
npm install echarts echarts-for-react     # React
npm install echarts vue-echarts           # Vue 3
```

### Vanilla JavaScript

```javascript
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { DatasetComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// Tree-shakeable imports: register what the chart uses. A renderer is always required.
echarts.use([BarChart, LineChart, DatasetComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const el = document.getElementById("revenue-chart");   // the element needs a CSS width and height
const chart = echarts.init(el);
chart.setOption({
  tooltip: { trigger: "axis" },
  legend: {},
  dataset: {
    source: [
      ["month", "Revenue", "Costs"],
      ["Jan", 42000, 31000],
      ["Feb", 46500, 32500],
      ["Mar", 51200, 34100],
    ],
  },
  xAxis: { type: "category" },
  yAxis: {},
  series: [{ type: "bar" }, { type: "line" }],        // each series takes the next dataset column
});

// The chart does not follow its container: call resize() yourself
const observer = new ResizeObserver(() => chart.resize());
observer.observe(el);
// On teardown: observer.disconnect(); chart.dispose();
```

`import * as echarts from "echarts"` registers everything and needs no `use()` call: simpler, but a much larger bundle.

### React Integration

```tsx
// Using echarts-for-react wrapper
import { useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";

function SalesChart({ data }) {
  const option = {
    title: { text: "Monthly Sales", left: "center" },
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        return params.map(p => `${p.seriesName}: $${p.value.toLocaleString()}`).join("<br/>");
      },
    },
    legend: { bottom: 0, data: ["Revenue", "Costs", "Profit"] },
    xAxis: { type: "category", data: data.map(d => d.month) },
    yAxis: { type: "value", axisLabel: { formatter: "${value}" } },
    series: [
      { name: "Revenue", type: "bar", data: data.map(d => d.revenue), color: "#4f46e5" },
      { name: "Costs", type: "bar", data: data.map(d => d.costs), color: "#ef4444" },
      { name: "Profit", type: "line", data: data.map(d => d.profit), color: "#22c55e",
        smooth: true, areaStyle: { opacity: 0.1 } },
    ],
    toolbox: {
      feature: {
        saveAsImage: {},                  // Download as PNG
        dataZoom: {},                     // Zoom into data
        restore: {},                      // Reset view
      },
    },
    dataZoom: [{ type: "slider", start: 0, end: 100, bottom: 30 }],  // Range slider above the legend
    grid: { bottom: 90 },
  };

  return <ReactECharts option={option} style={{ height: 500 }} />;
}

// Donut chart; onEvents receives ECharts events such as a click on a slice
function CategoryBreakdown({ data, onSelect }) {
  const option = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],             // Donut chart
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { show: true, formatter: "{b}\n{d}%" },
      emphasis: { label: { fontSize: 16, fontWeight: "bold" } },
      data: data.map(d => ({ value: d.count, name: d.category })),
    }],
  };
  return <ReactECharts option={option} style={{ height: 400 }}
    onEvents={{ click: (e) => onSelect(e.name) }} />;
}

// Real-time streaming chart: update the instance directly instead of re-rendering React
function LiveMetrics({ readLatency }) {
  const chartRef = useRef(null);
  const points = useRef([]);
  const baseOption = {
    animation: false,
    xAxis: { type: "time" },
    yAxis: { type: "value", name: "ms" },
    series: [{ type: "line", showSymbol: false, data: [] }],
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const chart = chartRef.current?.getEchartsInstance();
      if (!chart) return;
      // Append new data point, keep the last 60
      points.current = [...points.current, [Date.now(), readLatency()]].slice(-60);
      chart.setOption({ series: [{ data: points.current }] });
    }, 1000);
    return () => clearInterval(interval);
  }, [readLatency]);

  return <ReactECharts ref={chartRef} option={baseOption} style={{ height: 300 }} />;
}
```

### Vue Integration

```vue
<template>
  <VChart :option="option" autoresize style="height: 400px" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { use } from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const option = ref({
  tooltip: {},
  xAxis: { type: "category", data: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  yAxis: {},
  series: [{ type: "bar", data: [412, 388, 455, 501, 476] }],
});
</script>
```

### Advanced Charts

```typescript
// Sankey diagram (flow visualization) — every name used in links must be listed in data
const sankeyOption = {
  series: [{
    type: "sankey",
    data: [
      { name: "Organic" }, { name: "Paid" }, { name: "Referral" }, { name: "Signup" },
      { name: "Activation" }, { name: "Churned" }, { name: "Paid User" },
    ],
    links: [
      { source: "Organic", target: "Signup", value: 5000 },
      { source: "Paid", target: "Signup", value: 3000 },
      { source: "Referral", target: "Signup", value: 2000 },
      { source: "Signup", target: "Activation", value: 6000 },
      { source: "Signup", target: "Churned", value: 4000 },
      { source: "Activation", target: "Paid User", value: 3500 },
    ],
  }],
};

// Heatmap (calendar-style, like GitHub contributions); dailyData = [{ date: "2026-03-14", commits: 7 }, ...]
const calendarHeatmap = {
  visualMap: { min: 0, max: 100, type: "piecewise", orient: "horizontal", left: "center" },
  calendar: { range: "2026", cellSize: ["auto", 15] },
  series: [{
    type: "heatmap",
    coordinateSystem: "calendar",
    data: dailyData.map(d => [d.date, d.commits]),
  }],
};
```

### Upgrading from ECharts 5 to 6

`npm install echarts@6` needs no code changes in most projects, but charts look different: a new color palette, and the legend now sits at the bottom by default.

```javascript
import * as echarts from "echarts";
import "echarts/theme/v5.js";                      // keep the .js: "echarts/theme/v5" fails to resolve in Node

const chart = echarts.init(el, "v5");             // version 5 colors and component positions
chart.setOption(option);
// New in 6: switch theme on a live chart (it has no effect before the first setOption)
chart.setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "v5");
```

## Examples

### Example 1: Render a chart to SVG on the server

User: "Generate the weekly signups chart as an image for our email report, no browser."

```javascript
// render-signups.mjs — run with: node render-signups.mjs
import { writeFileSync } from "node:fs";
import * as echarts from "echarts";

const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 800, height: 400 });
chart.setOption({
  animation: false,
  title: { text: "Signups, week of 21 September" },
  xAxis: { type: "category", data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: [182, 205, 197, 241, 263, 118, 96], label: { show: true, position: "top" } }],
});
writeFileSync("signups.svg", chart.renderToSVGString());
chart.dispose();
```

Result: `signups.svg`, an 800×400 vector image of about 7 KB, written without a DOM. SSR mode needs `renderer: "svg"`, `ssr: true` and an explicit width and height. For PNG output, pass a `canvas` package (node-canvas) instance to `echarts.init` and call `canvas.toBuffer("image/png")`.

### Example 2: Plot 200,000 sensor readings without freezing the page

User: "Our temperature chart has 200k points and the page locks up when it loads."

```javascript
// readings: [[timestampMs, celsius], ...] with 200,000 rows
chart.setOption({
  animation: false,
  tooltip: { trigger: "axis" },
  xAxis: { type: "time" },
  yAxis: { type: "value", scale: true, name: "°C" },
  dataZoom: [{ type: "inside" }, { type: "slider" }],
  series: [{
    type: "line",
    showSymbol: false,       // no marker per point
    sampling: "lttb",        // downsample to what the pixels can show, keeping peaks
    data: readings,
  }],
});
```

Result: the line keeps its shape while far fewer segments are drawn (rendered to SVG at 1200 px wide, 200,000 points come to about 75 KB with `sampling: "lttb"`; without it the size depends on the data, from about 230 KB for a slow drift to over 2 MB for noisy readings), and zooming with the wheel or slider reveals detail again.

## Guidelines

1. **echarts-for-react for React** — Use the wrapper for lifecycle management; pass `option` as prop, and reach for `getEchartsInstance()` only for high-frequency updates
2. **Canvas for large data** — Canvas is the default renderer and the right one beyond roughly a thousand elements; use `sampling` on lines and `large: true` on bar and scatter series, and the `echarts-gl` extension (WebGL) for millions of points
3. **Toolbox for interaction** — Enable `saveAsImage`, `dataZoom`, `restore` in the toolbox; users expect to zoom and download
4. **Responsive resize** — Plain ECharts needs `chart.resize()` from a `ResizeObserver`; `echarts-for-react` resizes on its own (`autoResize`, on by default) and `vue-echarts` when the `autoresize` prop is set. The container must have a height
5. **Theme system** — Use ECharts themes for consistent styling across charts; create custom themes at https://echarts.apache.org/en/theme-builder.html and load them with `echarts.registerTheme(name, theme)`
6. **Updates in React** — A new `option` object is merged into the chart; set `notMerge={true}` when series are removed, or stale ones stay. `lazyUpdate={true}` postpones the redraw to the next frame
7. **Dataset for shared data** — Use ECharts `dataset` component when multiple series share the same data source
8. **Server-side rendering** — Use the built-in SVG SSR mode shown in Example 1 for reports and emails; `VChart` and `ReactECharts` render only in the browser
9. **Dispose charts** — Call `chart.dispose()` when the element is removed; undisposed instances keep memory and listeners
10. **Untrusted data** — A `tooltip.formatter` function returns raw HTML; escape user-supplied text with `echarts.format.encodeHTML()` before inserting it, or it is an XSS risk
