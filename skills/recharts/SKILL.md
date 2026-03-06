---
name: recharts
category: Data Visualization
tags: [charts, react, data-visualization, svg, dashboard, analytics]
version: 1.0.0
author: terminal-skills
---

# Recharts — React Charting Library

You are an expert in Recharts, the composable React charting library built on D3. You help developers create line charts, bar charts, area charts, pie charts, scatter plots, and custom visualizations using React's declarative component model with responsive containers and smooth animations.

## Core Capabilities

### Common Chart Types

```tsx
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Brush, ComposedChart,
} from "recharts";

// Line chart with multiple series
function RevenueChart({ data }: { data: MonthlyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} />
        <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
        <Legend />
        <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} />
        <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Stacked bar chart
function MRRChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="newMRR" stackId="a" fill="#4f46e5" name="New MRR" />
        <Bar dataKey="expansion" stackId="a" fill="#22c55e" name="Expansion" />
        <Bar dataKey="churn" stackId="a" fill="#ef4444" name="Churn" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Area chart with gradient
function TrafficChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Area type="monotone" dataKey="visits" stroke="#4f46e5" fill="url(#grad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Donut chart
const COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444"];
function PlanDistribution({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="plan" cx="50%" cy="50%"
             innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### Custom Tooltips

```tsx
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg">
      <p className="font-semibold">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: ${entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
};
// Usage: <Tooltip content={<CustomTooltip />} />
```

## Installation

```bash
npm install recharts
```

## Best Practices

1. **ResponsiveContainer always** — Wrap every chart in `<ResponsiveContainer>` for responsive sizing
2. **Composable** — Mix Line + Bar + Area in one chart via `<ComposedChart>`
3. **Custom tooltips** — Replace defaults with styled components for polished dashboards
4. **Gradients for areas** — Use SVG `<linearGradient>` in `<defs>` for polished fills
5. **Animation control** — `isAnimationActive={false}` for real-time data; animations for static dashboards
6. **Reference lines** — Use `<ReferenceLine>` for targets, thresholds, and benchmarks
7. **Brush for zoom** — Add `<Brush>` for time-series zoom; users select a time range
8. **Data outside** — Transform data before passing to Recharts; keep chart components focused on rendering
