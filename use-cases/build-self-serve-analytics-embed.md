---
title: "Build a Self-Serve Analytics Embed for Your SaaS"
description: "Let customers explore their own data with a no-code query builder, live charts, row-level security, and CSV/PNG export — embeddable as an iframe or React component."
skills: [prisma]
difficulty: intermediate
time_estimate: "10 hours"
tags: [analytics, saas, embed, charts, row-level-security, prisma, react, data-visualization]
---

# Build a Self-Serve Analytics Embed for Your SaaS

Your customers keep asking "can I see my data?" and you keep saying "we're working on it." Stop. Ship an Analytics tab this week — no BI tool subscriptions, no rebuilding from scratch.

## Persona

**David** is CTO of a project management SaaS with 500 business customers. Every enterprise call includes "we need analytics." His team spent 2 sprints on it, then deprioritized. It's time to finish this.

---

## Architecture

```
Customer browser
  ↓ Embed (iframe or <Analytics> React component)
  ↓ Query Builder UI → API request with filters
  ↓ /api/analytics (Next.js route)
  ↓ Prisma + Row-Level Security
  ↓ Chart.js / Recharts (client-side render)
```

---

## Step 1: Data Model with Row-Level Security

```prisma
// schema.prisma
model Organization {
  id        String    @id @default(cuid())
  name      String
  events    Event[]
  apiKeys   ApiKey[]
}

model Event {
  id         String       @id @default(cuid())
  orgId      String
  org        Organization @relation(fields: [orgId], references: [id])
  eventType  String       // "task_created", "user_login", etc.
  userId     String?
  properties Json?
  occurredAt DateTime     @default(now())

  @@index([orgId, occurredAt])
  @@index([orgId, eventType])
}

model ApiKey {
  id        String       @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id])
  keyHash   String       @unique
  label     String
  createdAt DateTime     @default(now())
}
```

The critical pattern: **every query is scoped to `orgId`**. No exceptions.

---

## Step 2: Secure Analytics API

```typescript
// app/api/analytics/route.ts
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function getOrgFromApiKey(apiKey: string): Promise<string | null> {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { orgId: true },
  });
  return record?.orgId ?? null;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = await getOrgFromApiKey(apiKey);
  if (!orgId) return Response.json({ error: 'Invalid API key' }, { status: 403 });

  const body = await req.json();
  const { metric, groupBy, dateFrom, dateTo, filters } = body;

  // Validate inputs — never trust user-provided field names
  const ALLOWED_GROUP_BY = ['eventType', 'userId', 'occurredAt'];
  const ALLOWED_METRICS = ['count', 'unique_users'];

  if (!ALLOWED_METRICS.includes(metric)) {
    return Response.json({ error: 'Invalid metric' }, { status: 400 });
  }

  const safeGroupBy = ALLOWED_GROUP_BY.includes(groupBy) ? groupBy : 'eventType';

  const whereClause: Record<string, unknown> = {
    orgId, // Row-level security: always scope to org
    occurredAt: {
      gte: new Date(dateFrom ?? Date.now() - 30 * 86400_000),
      lte: new Date(dateTo ?? Date.now()),
    },
  };

  // Apply optional filters
  if (filters?.eventType) whereClause.eventType = filters.eventType;

  const data = await prisma.event.groupBy({
    by: [safeGroupBy as 'eventType' | 'userId'],
    where: whereClause,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 100,
  });

  return Response.json({ data });
}
```

---

## Step 3: Query Builder UI Component

```tsx
// components/QueryBuilder.tsx
import { useState } from 'react';

interface QueryConfig {
  metric: 'count' | 'unique_users';
  groupBy: 'eventType' | 'userId' | 'occurredAt';
  dateRange: '7d' | '30d' | '90d' | 'custom';
  filters: Record<string, string>;
}

export function QueryBuilder({
  onQuery,
}: {
  onQuery: (config: QueryConfig) => void;
}) {
  const [config, setConfig] = useState<QueryConfig>({
    metric: 'count',
    groupBy: 'eventType',
    dateRange: '30d',
    filters: {},
  });

  return (
    <div className="query-builder">
      <div className="row">
        <label>Show</label>
        <select
          value={config.metric}
          onChange={e => setConfig(c => ({ ...c, metric: e.target.value as QueryConfig['metric'] }))}
        >
          <option value="count">Event count</option>
          <option value="unique_users">Unique users</option>
        </select>

        <label>grouped by</label>
        <select
          value={config.groupBy}
          onChange={e => setConfig(c => ({ ...c, groupBy: e.target.value as QueryConfig['groupBy'] }))}
        >
          <option value="eventType">Event type</option>
          <option value="userId">User</option>
          <option value="occurredAt">Date</option>
        </select>

        <label>for the last</label>
        <select
          value={config.dateRange}
          onChange={e => setConfig(c => ({ ...c, dateRange: e.target.value as QueryConfig['dateRange'] }))}
        >
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
        </select>
      </div>

      <button onClick={() => onQuery(config)}>Run Query</button>
    </div>
  );
}
```

---

## Step 4: Charts + Export

```tsx
// components/AnalyticsChart.tsx
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { downloadCSV, downloadChartPNG } from '../lib/export';

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

export function AnalyticsChart({
  data,
  chartType = 'bar',
}: {
  data: Array<{ name: string; value: number }>;
  chartType?: 'bar' | 'line' | 'pie';
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div ref={chartRef}>
        {chartType === 'bar' && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {chartType === 'pie' && (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%">
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="export-buttons">
        <button onClick={() => downloadCSV(data, 'analytics-export')}>
          Export CSV
        </button>
        <button onClick={() => downloadChartPNG(chartRef, 'analytics-chart')}>
          Export PNG
        </button>
      </div>
    </div>
  );
}
```

---

## Step 5: Embeddable as iframe or React Component

**Option A — iframe embed (zero-dependency)**

```html
<!-- Customer adds this to their dashboard -->
<iframe
  src="https://yourapp.com/embed/analytics?apiKey=ak_live_xxx"
  width="100%"
  height="600"
  frameborder="0"
/>
```

**Option B — React component (white-label)**

```tsx
// Publish as npm package: @yourapp/analytics-embed
import { AnalyticsDashboard } from '@yourapp/analytics-embed';

<AnalyticsDashboard
  apiKey="ak_live_xxx"
  theme={{ primary: '#6366f1', background: '#ffffff' }}
  defaultDateRange="30d"
/>
```

---

## Security Checklist

- ✅ Every DB query includes `orgId` — customers can't see each other's data
- ✅ API keys are hashed (SHA-256) in database — not stored in plaintext
- ✅ GroupBy/filter fields validated against allowlist — no SQL injection via field names
- ✅ Embed API key is read-only — can't write events via analytics endpoint

---

## Results

David shipped the Analytics tab in one sprint. Enterprise churn dropped. Three customers upgraded to higher plans for "advanced analytics" — which was the same feature with longer date ranges.

> "It took longer to design the UI than to build the backend. Prisma's type-safety meant zero data leaks across tenants." — David
