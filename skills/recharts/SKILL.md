---
name: recharts
description: >-
  Recharts is a composable charting library for React that renders responsive SVG charts. Use when a user asks to create line charts, bar charts, area charts, pie charts, or composed dashboard visualizations using the Recharts component library.
license: Apache-2.0
compatibility: "Recharts 3.x. React 16.8 or newer (react, react-dom and react-is are peer dependencies); TypeScript 5+ for the bundled types."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["charts", "react", "data-visualization", "svg", "dashboard"]
  repository: https://github.com/recharts/recharts
---
# Recharts — React Charting Library

## Overview

Recharts is a composable charting library for React that renders SVG and uses D3 for scales and shapes. A chart is a tree of components — a chart container such as `LineChart`, plus axes, grid, tooltip, legend and one component per data series — so line, bar, area, pie, scatter and mixed charts are all built the same way.

This skill targets Recharts 3 (3.10 at the time of writing). Version 3 rewrote the internal state and changed a few public APIs: custom tooltips are typed with `TooltipContentProps`, `Cell` is deprecated in favour of the `shape` prop or a `fill` field in the data, `activeIndex` is gone, keyboard accessibility is on by default, and since 3.3 a chart can size itself with the `responsive` prop instead of a `ResponsiveContainer` wrapper.

## Instructions

### Installation

```bash
npm install recharts react-is
```

`react-is` must be the same version as the installed `react`.

### Common Chart Types

```tsx
// Line chart with multiple series
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type Row = Record<string, string | number>;
const data: Row[] = [
  { month: "Jan", revenue: 4000, costs: 2400, profit: 1600 },
  { month: "Feb", revenue: 3000, costs: 1398, profit: 1602 },
  { month: "Mar", revenue: 5000, costs: 3200, profit: 1800 },
  { month: "Apr", revenue: 4780, costs: 2908, profit: 1872 },
  { month: "May", revenue: 5890, costs: 3800, profit: 2090 },
  { month: "Jun", revenue: 6390, costs: 3900, profit: 2490 },
];

// `responsive` (3.3+) makes the chart follow its container; size it with ordinary CSS
function RevenueChart() {
  return (
    <LineChart responsive data={data} style={{ width: "100%", height: 400 }}
               margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis dataKey="month" />
      <YAxis tickFormatter={(v) => `$${v / 1000}k`} />
      <Tooltip
        formatter={(value) => `$${Number(value).toLocaleString()}`}
        contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0" }}
      />
      <Legend />
      <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} />
      <Line type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
      <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" />
    </LineChart>
  );
}

// Bar chart — ResponsiveContainer still works and is the only option before 3.3;
// with a percentage height its parent element must have a height, or the chart renders with no size
import { BarChart, Bar } from "recharts";

function MRRChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="newMRR" stackId="a" fill="#4f46e5" name="New MRR" />
        <Bar dataKey="expansionMRR" stackId="a" fill="#22c55e" name="Expansion" />
        <Bar dataKey="churnMRR" stackId="a" fill="#ef4444" name="Churn" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Area chart
import { AreaChart, Area } from "recharts";

function TrafficChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Area type="monotone" dataKey="visits" stroke="#4f46e5" fill="url(#colorVisits)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Pie / Donut chart — give each row a `fill`; sectors, legend and tooltip all pick it up
import { PieChart, Pie } from "recharts";

const plans = [
  { plan: "Free", value: 620, fill: "#4f46e5" },
  { plan: "Starter", value: 240, fill: "#22c55e" },
  { plan: "Growth", value: 105, fill: "#f59e0b" },
  { plan: "Pro", value: 35, fill: "#ef4444" },
];

function PlanDistribution() {
  return (
    <PieChart responsive style={{ width: "100%", maxWidth: 360, aspectRatio: 1 }}>
      <Pie data={plans} dataKey="value" nameKey="plan" cx="50%" cy="50%"
           innerRadius={60} outerRadius={100} paddingAngle={2} />
      <Tooltip />
      <Legend />
    </PieChart>
  );
}
```

### Custom Tooltips and Labels

```tsx
// Custom tooltip component — in v3 the props type is TooltipContentProps, not TooltipProps
import { Tooltip, type TooltipContentProps } from "recharts";

const CustomTooltip = ({ active, payload, label }: TooltipContentProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", padding: 12, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <p style={{ fontWeight: 600 }}>{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} style={{ color: entry.color }}>
          {entry.name}: ${Number(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

// Usage: <Tooltip content={CustomTooltip} />
```

### Custom Shapes Instead of `Cell`

`Cell` still renders in 3.x but is deprecated and will be removed in 4.0. To style items one by one, pass a component to `shape`:

```tsx
import { Pie, Sector, type PieSectorShapeProps } from "recharts";

const COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444"];
const PlanSector = (props: PieSectorShapeProps) => (
  <Sector {...props} fill={COLORS[props.index % COLORS.length]} />
);

// <Pie data={data} dataKey="value" nameKey="plan" shape={PlanSector} />
```

The bar series accepts `shape` the same way (`BarShapeProps`, rendering a `Rectangle`). A `shape` only changes the drawn element: legend icons do not pick up colours set inside it, so prefer `fill` in the data when the legend should match.

## Examples

### Example 1: Revenue against target with a goal line

**User prompt:** "Show monthly revenue as bars with the target as a line, and mark the $50k quarter goal."

```tsx
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";

const sales = [
  { month: "Jul", revenue: 48200, target: 45000 },
  { month: "Aug", revenue: 51900, target: 47000 },
  { month: "Sep", revenue: 43100, target: 49000 },
];

export function RevenueVsTarget() {
  return (
    <ComposedChart responsive data={sales} style={{ width: "100%", height: 320 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="month" />
      <YAxis tickFormatter={(v) => `$${v / 1000}k`} />
      <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
      <Legend />
      <Bar dataKey="revenue" name="Revenue" fill="#4f46e5" />
      <Line dataKey="target" name="Target" stroke="#f59e0b" strokeWidth={2} />
      <ReferenceLine y={50000} stroke="#ef4444" strokeDasharray="4 4" label="Quarter goal" />
    </ComposedChart>
  );
}
```

The chart draws three bars, one line across them and a dashed horizontal line labelled "Quarter goal". The Y axis picks round ticks on its own — `$0k, $15k, $30k, $45k, $60k` — and the legend lists "Revenue" and "Target".

### Example 2: Fix type errors after upgrading from Recharts 2

**User prompt:** "I upgraded recharts to 3 and TypeScript says `Property 'payload' does not exist on type 'TooltipProps'` and `Property 'activeIndex' does not exist`."

```tsx
// Before (2.x)
const SalesTooltip = ({ active, payload, label }: TooltipProps<number, string>) => { /* ... */ };
<Tooltip content={<SalesTooltip />} />
<Pie data={plans} dataKey="value" activeIndex={0} />

// After (3.x)
const SalesTooltip = ({ active, payload, label }: TooltipContentProps) => { /* ... */ };
<Tooltip content={SalesTooltip} />
<Pie data={plans} dataKey="value" />   {/* drive the highlighted item through Tooltip instead */}
```

`npx tsc --noEmit` passes again. `Cell` children keep compiling but show a deprecation warning in the editor; move their colours into the data or a `shape` component before 4.0.

## Guidelines

1. **Size every chart** — Use `responsive` with a CSS width and height (or `aspectRatio`), or wrap the chart in `<ResponsiveContainer width="100%" height={...}>` inside a parent that has a size; a `ResponsiveContainer` with a percentage height in a parent with no height renders an empty chart
2. **Composable architecture** — Mix and match components (Line + Bar + Area in one `ComposedChart`); in v3 your own components can wrap axes or series and be used as chart children
3. **Custom tooltips** — Replace default tooltips with styled components for polished dashboards
4. **Color consistency** — Define a color palette once and reuse; match your brand colors
5. **Data transformation outside** — Transform data before passing to Recharts; keep chart components focused on rendering
6. **Gradients for area charts** — Use SVG `<linearGradient>` in `<defs>` for polished area fills
7. **Animation control** — Set `isAnimationActive={false}` for real-time data; animations on initial render only for static dashboards
8. **Reference lines** — Use `<ReferenceLine>` for targets, thresholds, and benchmarks overlaid on charts
9. **Layering** — since 3.4 chart elements are drawn in `zIndex` layers with built-in defaults (grid, then areas, bars, lines, axes, dots, labels), so JSX order only decides between elements of the same layer; pass `zIndex` to move one. On 3.0–3.3 render order alone decides: put what must stay on top last
10. **Accessibility** — `accessibilityLayer` is on by default in v3 (keyboard navigation, ARIA attributes); pass `accessibilityLayer={false}` only when it conflicts with your own handling
11. **When not to use** — Every data point becomes SVG nodes in the DOM, so very large series get slow: aggregate or downsample first, or pick a canvas-based library. Recharts only works inside React
