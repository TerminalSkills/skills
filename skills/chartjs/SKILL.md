---
name: chartjs
description: >-
  Chart.js draws bar, line, pie, doughnut, radar, scatter and bubble charts on an HTML canvas from a plain JavaScript config object. Use when a user asks to "add a chart to the page", "plot this data with Chart.js", "update a chart live", "make the chart responsive", "register Chart.js components for a smaller bundle", or "use Chart.js in React". Covers v4 ESM registration, config shape, updating data, plugins, responsive sizing, time scales and export to PNG.
license: Apache-2.0
compatibility: "A browser with canvas support at runtime; Chart.js 4.x"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "chartjs, charts, canvas, data-visualization, javascript"
  repository: https://github.com/chartjs/Chart.js
---

# Chart.js — canvas charts from a config object

## Overview

Chart.js renders charts into a `<canvas>`. Every chart is described by one object, `{ type, data, options, plugins }`, and updated by changing that object and calling `chart.update()`. Version 4 is ESM and tree-shakeable: with a bundler you register only the controllers, elements, scales and plugins you use, or import `chart.js/auto` to get everything.

Choose it for a handful of standard charts with small code and a small bundle. Choose the neighbouring skills instead when:

- `recharts` — you want charts as React components built from SVG elements.
- `echarts` — you need very large datasets, maps, heatmaps, or many exotic series types.

Because Chart.js draws pixels on a canvas, there is no DOM per bar: tooltips and hit-testing are handled by the library, and charts cannot be rendered where no canvas exists (plain Node, server components); in Next.js or Nuxt create them in a client-only component after mount.

## Instructions

### Installation

```bash
npm install chart.js
```

For a time axis you also need a date library plus an adapter (the time scale does not work without one):

```bash
npm install chartjs-adapter-date-fns date-fns
```

For React there is a separate community wrapper that depends on `chart.js` 4 as a peer:

```bash
npm install react-chartjs-2
```

### Registering components (tree-shaking)

Quickest start, everything included:

```typescript
import Chart from 'chart.js/auto';
```

For a smaller bundle, register exactly what the chart type needs. A bar chart needs `BarController`, `BarElement`, `CategoryScale` and `LinearScale`; a line chart needs `LineController`, `LineElement`, `PointElement` and the same two scales; a doughnut or pie chart needs its controller plus `ArcElement` and no scales. Tooltip, Legend, Title and Filler are plugins and are only active when registered.

```typescript
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);
```

Register once, at app start. A missing registration shows up at runtime as `"bar" is not a registered controller` or `"category" is not a registered scale`; the fix is to register the named piece.

### Creating a chart

The canvas needs its own relatively positioned container. Chart.js resizes the canvas from its parent, so put the size on the parent, never on the canvas.

```html
<div style="position: relative; height: 320px; width: 100%">
  <canvas id="orders"></canvas>
</div>
```

```typescript
import { Chart, type ChartConfiguration } from 'chart.js';

const config: ChartConfiguration<'bar', number[], string> = {
  type: 'bar',
  data: {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{ label: 'Orders', data: [120, 98, 143], backgroundColor: '#2563eb', borderRadius: 4 }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, title: { display: true, text: 'Orders' } } },
    plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Orders per month' } },
  },
};

const canvas = document.getElementById('orders') as HTMLCanvasElement;
const chart = new Chart(canvas, config);
```

With `maintainAspectRatio: false` the chart fills the container height. With the default `true` the container height follows the width through `aspectRatio`.

### Updating data and options

Mutate `chart.data` or `chart.options` in place, then call `update()`. Pass `'none'` to skip the animation, which is the right choice for high-frequency live data.

```typescript
chart.data.labels!.push('Apr');
chart.data.datasets[0].data.push(150);
chart.update();

chart.options.plugins!.title!.text = 'Orders, Jan to Apr';
chart.update('none');
```

Assigning a brand new `chart.options` object discards options Chart.js computed earlier, so prefer in-place mutation. To remove the chart, call `chart.destroy()`; creating a second chart on a canvas that still has one throws `Canvas is already in use`.

### Time axes

Install the adapter, import it once for its side effect, and set the scale type to `time`:

```typescript
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale);

const latency = new Chart(canvas, {
  type: 'line',
  data: { datasets: [{ label: 'p95 latency (ms)', data: [{ x: '2026-10-29T09:00:00Z', y: 212 }, { x: '2026-10-29T09:05:00Z', y: 187 }] }] },
  options: { scales: { x: { type: 'time', time: { unit: 'minute' } } } },
});
```

### Plugins

A plugin is an object with an `id` and hooks such as `beforeDraw`, `afterDatasetsDraw` or `afterUpdate`. Pass it per chart in the top-level `plugins` array, or register it globally with `Chart.register(plugin)`. Options for a plugin live under `options.plugins.<id>`.

```typescript
import type { Plugin } from 'chart.js';

const whiteBackground: Plugin<'bar'> = {
  id: 'whiteBackground',
  beforeDraw(chart, _args, opts: { color?: string }) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.fillStyle = opts.color ?? '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

new Chart(canvas, { ...config, plugins: [whiteBackground] });
```

### Interaction and export

```typescript
canvas.onclick = (event) => {
  const hits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
  if (hits.length) console.log(chart.data.labels![hits[0].index]);
};

const png = chart.toBase64Image('image/png', 1);
```

### React

`react-chartjs-2` provides one component per chart type (`Bar`, `Line`, `Doughnut`, ...). You still register the Chart.js pieces yourself, once, with `ChartJS.register(...)`. Give the component a relatively positioned parent with a height.

```tsx
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function Orders({ values }: { values: number[] }) {
  return (
    <div style={{ position: 'relative', height: 320 }}>
      <Bar
        data={{ labels: ['Jan', 'Feb', 'Mar'], datasets: [{ label: 'Orders', data: values }] }}
        options={{ responsive: true, maintainAspectRatio: false }}
      />
    </div>
  );
}
```

In Next.js, put the chart in a file with `'use client'` at the top.

## Examples

### 1. Monthly revenue bar chart with a small bundle

User request: "Add a bar chart of monthly revenue to our admin page and keep the bundle small."

```bash
npm install chart.js
```

```typescript
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const revenue = [18400, 21950, 20310, 24780];
new Chart(document.getElementById('revenue') as HTMLCanvasElement, {
  type: 'bar',
  data: { labels: ['Jul', 'Aug', 'Sep', 'Oct'], datasets: [{ label: 'Revenue (USD)', data: revenue, backgroundColor: '#16a34a' }] },
  options: {
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v) / 1000}k` } } },
    plugins: { tooltip: { callbacks: { label: (ctx) => `$${(ctx.parsed.y ?? 0).toLocaleString('en-US')}` } } },
  },
});
```

The page shows four green bars labelled Jul to Oct, a y-axis in `$18k` style ticks, and a tooltip such as `$24,780` on hover. The legend is absent because the Legend plugin was not registered, which is intended here.

### 2. Live latency line chart that keeps the last 60 points

User request: "Show request latency from our metrics endpoint and update every 5 seconds."

```typescript
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const chart = new Chart(document.getElementById('latency') as HTMLCanvasElement, {
  type: 'line',
  data: { labels: [] as string[], datasets: [{ label: 'p95 (ms)', data: [] as number[], borderColor: '#dc2626', pointRadius: 0, tension: 0.25 }] },
  options: { maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true } } },
});

setInterval(async () => {
  const res = await fetch('/api/metrics/latency');
  const { p95 } = (await res.json()) as { p95: number };
  chart.data.labels!.push(new Date().toLocaleTimeString('en-GB'));
  chart.data.datasets[0].data.push(p95);
  if (chart.data.labels!.length > 60) {
    chart.data.labels!.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}, 5000);
```

A red line scrolls left as new samples arrive; there are never more than 60 points, and no animation is replayed on each tick.

### 3. Doughnut of traffic sources exported as a PNG

User request: "Make a doughnut of signups by channel and let me download it."

```typescript
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const chart = new Chart(document.getElementById('channels') as HTMLCanvasElement, {
  type: 'doughnut',
  data: { labels: ['Organic', 'Referral', 'Paid'], datasets: [{ data: [540, 210, 130], backgroundColor: ['#2563eb', '#f59e0b', '#9333ea'] }] },
  options: { cutout: '60%', plugins: { legend: { position: 'right' } } },
});

document.getElementById('download')!.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = chart.toBase64Image('image/png', 1);
  link.download = 'signups-by-channel.png';
  link.click();
});
```

The chart is a ring with a legend on the right; clicking the button saves `signups-by-channel.png`.

## Guidelines

- The canvas needs a dedicated parent with `position: relative` and an explicit size. Never size the canvas with CSS `vh` or `vw` itself, and never share one container between canvases.
- Import a date adapter once for time scales; without it Chart.js throws that no complete date adapter is provided.
- Call `chart.destroy()` when a chart's canvas is removed (React effects, route changes), or the next chart on that canvas throws `Canvas is already in use`.
- For live data use `chart.update('none')` and cap the number of points; thousands of points per second is a job for `echarts` or a downsampling step.
- Use colour plus a second cue (label, pattern, tooltip) so charts remain readable for colour-blind users; canvas content is invisible to screen readers, so also provide a data table or `aria-label` on the canvas.
- Do not use Chart.js when you need axis-linked brushing across many panels, maps, or custom SVG styling; use `echarts` or `recharts`.
