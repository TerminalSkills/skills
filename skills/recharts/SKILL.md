---
name: recharts
description: >-
  Build charts and data visualizations with Recharts for React. Use when a user
  asks to add charts to a React app, create line/bar/pie charts, build
  dashboards, visualize time-series data, or add responsive charts.
license: Apache-2.0
compatibility: 'React 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - recharts
    - charts
    - visualization
    - react
    - dashboard
---

# Recharts

## Overview

Recharts is the most popular charting library for React, built on D3. It provides composable chart components: LineChart, BarChart, AreaChart, PieChart, RadarChart, and more. Responsive, customizable, and declarative.

## Instructions

### Step 1: Setup

```bash
npm install recharts
```

### Step 2: Line Chart

```tsx
// components/RevenueChart.tsx — Time-series line chart
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { month: 'Jan', revenue: 4000, users: 2400 },
  { month: 'Feb', revenue: 3000, users: 1398 },
  { month: 'Mar', revenue: 5000, users: 3800 },
  { month: 'Apr', revenue: 4780, users: 3908 },
]

export function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
        <Line type="monotone" dataKey="users" stroke="#82ca9d" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### Step 3: Bar Chart

```tsx
// components/SalesChart.tsx — Bar chart with categories
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function SalesChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="sales" fill="#8884d8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="returns" fill="#ff7c7c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

### Step 4: Pie Chart

```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

export function CategoryPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

## Guidelines

- Always wrap charts in `<ResponsiveContainer>` for responsive sizing.
- Recharts re-renders on data change — memoize data arrays to avoid unnecessary renders.
- For complex custom visualizations beyond standard charts, use D3 directly.
- Recharts supports animations by default — disable with `isAnimationActive={false}` for performance.
