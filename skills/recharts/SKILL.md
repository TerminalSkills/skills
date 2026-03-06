---
name: recharts
category: Frontend & UI
tags: [charts, react, data-visualization, svg, dashboard, analytics]
version: 1.0.0
author: terminal-skills
---

# Recharts — React Charting Library

You are an expert in Recharts, the composable React charting library built on D3. You help developers create line charts, bar charts, area charts, pie charts, scatter plots, and custom visualizations using React's declarative component model with responsive containers and smooth animations.

## Core Capabilities

### Common Chart Types

```tsx
// Line chart with multiple series
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jan", revenue: 4000, costs: 2400, profit: 1600 },
  { month: "Feb", revenue: 3000, costs: 1398, profit: 1602 },
  { month: "Mar", revenue: 5000, costs: 3200, profit: 1800 },
  { month: "Apr", revenue: 4780, costs: 2908, profit: 1872 },
  { month: "May", revenue: 5890, costs: 3800, profit: 2090 },
  { month: "Jun", revenue: 6390, costs: 3900, profit: 2490 },
];

function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} />
        <Tooltip
          formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0" }}
        />
        <Legend />
        <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Bar chart
import { BarChart, Bar } from "recharts";

function MRRChart({ data }) {
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

function TrafficChart({ data }) {
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

// Pie / Donut chart
import { PieChart, Pie, Cell } from "recharts";

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

### Custom Tooltips and Labels

```tsx
// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div style={{ background: "white", padding: 12, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <p style={{ fontWeight: 600 }}>{label}</p>
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

1. **ResponsiveContainer always** — Wrap every chart in `<ResponsiveContainer width="100%" height={...}>` for responsive sizing
2. **Composable architecture** — Mix and match components (Line + Bar + Area in one chart); Recharts is fully composable
3. **Custom tooltips** — Replace default tooltips with styled components for polished dashboards
4. **Color consistency** — Define a color palette once and reuse; match your brand colors
5. **Data transformation outside** — Transform data before passing to Recharts; keep chart components focused on rendering
6. **Gradients for area charts** — Use SVG `<linearGradient>` in `<defs>` for polished area fills
7. **Animation control** — Set `isAnimationActive={false}` for real-time data; animations on initial render only for static dashboards
8. **Reference lines** — Use `<ReferenceLine>` for targets, thresholds, and benchmarks overlaid on charts
