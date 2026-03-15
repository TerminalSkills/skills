---
title: Build an Infrastructure Cost Allocation System
slug: build-infrastructure-cost-allocation-system
description: Build a system that attributes cloud infrastructure costs to teams, services, and customers — enabling accurate unit economics, chargeback, and cost optimization decisions.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: devops
tags:
  - cost-allocation
  - finops
  - cloud-costs
  - unit-economics
  - infrastructure
---

# Build an Infrastructure Cost Allocation System

## The Problem

Marco leads platform engineering at a 60-person SaaS company spending $120K/month on AWS. The CFO asks "what does it cost to serve customer X?" and nobody can answer. Costs are allocated by team ("engineering gets 70%") but this hides massive inefficiency. One team's staging environment costs more than another team's production. A single customer's data processing job costs $8K/month but they pay $2K. Without per-service and per-customer cost attribution, the company can't price accurately, can't identify waste, and can't make informed build-vs-buy decisions.

## Step 1: Ingest and Normalize Cloud Cost Data

The system pulls cost data from AWS Cost Explorer, normalizes it, and tags each cost with service, team, and customer metadata.

```typescript
// src/ingestion/aws-costs.ts — Pull and normalize AWS cost data
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { pool } from "../db";

const costExplorer = new CostExplorerClient({ region: "us-east-1" });

interface NormalizedCost {
  date: string;
  service: string;          // AWS service: EC2, RDS, S3, etc.
  accountId: string;
  resourceId: string;
  teamTag: string;           // from AWS resource tags
  serviceTag: string;        // our internal service name
  customerTag: string | null; // if resource is customer-specific
  environment: string;       // production, staging, development
  costUsd: number;
  usageQuantity: number;
  usageUnit: string;
}

export async function ingestDailyCosts(date: string): Promise<number> {
  const nextDay = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10);

  const command = new GetCostAndUsageCommand({
    TimePeriod: { Start: date, End: nextDay },
    Granularity: "DAILY",
    Metrics: ["UnblendedCost", "UsageQuantity"],
    GroupBy: [
      { Type: "DIMENSION", Key: "SERVICE" },
      { Type: "TAG", Key: "team" },
      { Type: "TAG", Key: "service" },
    ],
    Filter: {
      Not: {
        Dimensions: { Key: "RECORD_TYPE", Values: ["Credit", "Refund"] },
      },
    },
  });

  const response = await costExplorer.send(command);
  let ingested = 0;

  for (const result of response.ResultsByTime || []) {
    for (const group of result.Groups || []) {
      const awsService = group.Keys?.[0] || "Unknown";
      const teamTag = group.Keys?.[1]?.replace("team$", "") || "untagged";
      const serviceTag = group.Keys?.[2]?.replace("service$", "") || "untagged";
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");
      const usage = parseFloat(group.Metrics?.UsageQuantity?.Amount || "0");

      if (cost === 0) continue;

      await pool.query(
        `INSERT INTO daily_costs (date, aws_service, team_tag, service_tag, cost_usd, usage_quantity, usage_unit, ingested_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (date, aws_service, team_tag, service_tag) DO UPDATE SET
           cost_usd = $5, usage_quantity = $6, ingested_at = NOW()`,
        [date, awsService, teamTag, serviceTag, cost, usage,
         group.Metrics?.UsageQuantity?.Unit || ""]
      );

      ingested++;
    }
  }

  return ingested;
}

// Enrich costs with customer attribution from usage metrics
export async function attributeCustomerCosts(date: string): Promise<void> {
  // For shared resources (databases, caches), allocate based on usage proportion
  const { rows: sharedResources } = await pool.query(
    `SELECT service_tag, cost_usd FROM daily_costs 
     WHERE date = $1 AND service_tag IN ('shared-db', 'shared-cache', 'cdn')`,
    [date]
  );

  for (const resource of sharedResources) {
    // Get usage breakdown by customer from our metrics
    const { rows: usage } = await pool.query(
      `SELECT customer_id, SUM(request_count) as requests
       FROM service_metrics 
       WHERE service = $1 AND date = $2
       GROUP BY customer_id`,
      [resource.service_tag, date]
    );

    const totalRequests = usage.reduce((s, u) => s + parseInt(u.requests), 0);
    if (totalRequests === 0) continue;

    for (const u of usage) {
      const proportion = parseInt(u.requests) / totalRequests;
      const allocatedCost = resource.cost_usd * proportion;

      await pool.query(
        `INSERT INTO customer_cost_allocation (date, customer_id, service_tag, allocated_cost, allocation_method, proportion)
         VALUES ($1, $2, $3, $4, 'usage_proportional', $5)
         ON CONFLICT (date, customer_id, service_tag) DO UPDATE SET
           allocated_cost = $4, proportion = $5`,
        [date, u.customer_id, resource.service_tag, allocatedCost, proportion]
      );
    }
  }

  // For dedicated resources (tagged with customer), direct attribution
  await pool.query(
    `INSERT INTO customer_cost_allocation (date, customer_id, service_tag, allocated_cost, allocation_method, proportion)
     SELECT date, customer_tag, service_tag, cost_usd, 'direct', 1.0
     FROM daily_costs
     WHERE date = $1 AND customer_tag IS NOT NULL
     ON CONFLICT (date, customer_id, service_tag) DO UPDATE SET
       allocated_cost = EXCLUDED.allocated_cost`,
    [date]
  );
}
```

## Step 2: Build the Cost Analytics Engine

The analytics engine computes unit economics, identifies cost anomalies, and generates per-team and per-customer cost reports.

```typescript
// src/analytics/cost-analytics.ts — Cost analysis and unit economics
import { pool } from "../db";

interface ServiceCostReport {
  service: string;
  team: string;
  last30DaysCost: number;
  dailyAverage: number;
  trend: number;               // percentage change vs previous 30 days
  topCostDrivers: Array<{ awsService: string; cost: number }>;
  costPerRequest: number | null;
  costPerCustomer: number | null;
}

interface CustomerUnitEconomics {
  customerId: string;
  customerName: string;
  mrr: number;                 // monthly recurring revenue
  monthlyInfraCost: number;
  grossMargin: number;         // (mrr - cost) / mrr
  costBreakdown: Array<{ service: string; cost: number }>;
  costTrend: number;
}

export async function getServiceCostReport(serviceName: string): Promise<ServiceCostReport> {
  const { rows: [current] } = await pool.query(`
    SELECT 
      SUM(cost_usd) as total_cost,
      AVG(cost_usd) as daily_avg,
      COUNT(DISTINCT date) as days
    FROM daily_costs
    WHERE service_tag = $1 AND date >= CURRENT_DATE - 30
  `, [serviceName]);

  const { rows: [previous] } = await pool.query(`
    SELECT SUM(cost_usd) as total_cost
    FROM daily_costs
    WHERE service_tag = $1 AND date >= CURRENT_DATE - 60 AND date < CURRENT_DATE - 30
  `, [serviceName]);

  const trend = previous?.total_cost > 0
    ? ((current.total_cost - previous.total_cost) / previous.total_cost) * 100
    : 0;

  const { rows: drivers } = await pool.query(`
    SELECT aws_service, SUM(cost_usd) as cost
    FROM daily_costs
    WHERE service_tag = $1 AND date >= CURRENT_DATE - 30
    GROUP BY aws_service ORDER BY cost DESC LIMIT 5
  `, [serviceName]);

  // Cost per request from our metrics
  const { rows: [metrics] } = await pool.query(`
    SELECT SUM(request_count) as total_requests
    FROM service_metrics
    WHERE service = $1 AND date >= CURRENT_DATE - 30
  `, [serviceName]);

  return {
    service: serviceName,
    team: "", // filled by caller
    last30DaysCost: parseFloat(current.total_cost || 0),
    dailyAverage: parseFloat(current.daily_avg || 0),
    trend: Math.round(trend * 10) / 10,
    topCostDrivers: drivers.map((d) => ({ awsService: d.aws_service, cost: parseFloat(d.cost) })),
    costPerRequest: metrics?.total_requests > 0
      ? parseFloat(current.total_cost) / parseInt(metrics.total_requests)
      : null,
    costPerCustomer: null,
  };
}

export async function getCustomerUnitEconomics(customerId: string): Promise<CustomerUnitEconomics> {
  // Get customer revenue
  const { rows: [revenue] } = await pool.query(
    "SELECT name, mrr FROM customers WHERE id = $1",
    [customerId]
  );

  // Get allocated infrastructure costs
  const { rows: costs } = await pool.query(`
    SELECT service_tag, SUM(allocated_cost) as cost
    FROM customer_cost_allocation
    WHERE customer_id = $1 AND date >= CURRENT_DATE - 30
    GROUP BY service_tag ORDER BY cost DESC
  `, [customerId]);

  const totalCost = costs.reduce((s, c) => s + parseFloat(c.cost), 0);
  const mrr = parseFloat(revenue?.mrr || 0);

  // Cost trend
  const { rows: [prevCost] } = await pool.query(`
    SELECT SUM(allocated_cost) as cost
    FROM customer_cost_allocation
    WHERE customer_id = $1 AND date >= CURRENT_DATE - 60 AND date < CURRENT_DATE - 30
  `, [customerId]);

  const costTrend = prevCost?.cost > 0
    ? ((totalCost - parseFloat(prevCost.cost)) / parseFloat(prevCost.cost)) * 100
    : 0;

  return {
    customerId,
    customerName: revenue?.name || "Unknown",
    mrr,
    monthlyInfraCost: Math.round(totalCost * 100) / 100,
    grossMargin: mrr > 0 ? Math.round(((mrr - totalCost) / mrr) * 10000) / 100 : 0,
    costBreakdown: costs.map((c) => ({ service: c.service_tag, cost: parseFloat(c.cost) })),
    costTrend: Math.round(costTrend * 10) / 10,
  };
}

// Find cost anomalies — services spending significantly more than usual
export async function detectCostAnomalies(): Promise<Array<{
  service: string;
  currentDaily: number;
  expectedDaily: number;
  deviation: number;
  severity: string;
}>> {
  const { rows } = await pool.query(`
    WITH daily_avg AS (
      SELECT service_tag,
             AVG(cost_usd) as avg_daily,
             STDDEV(cost_usd) as stddev_daily
      FROM daily_costs
      WHERE date >= CURRENT_DATE - 30 AND date < CURRENT_DATE - 1
      GROUP BY service_tag
    ),
    today AS (
      SELECT service_tag, SUM(cost_usd) as today_cost
      FROM daily_costs
      WHERE date = CURRENT_DATE - 1
      GROUP BY service_tag
    )
    SELECT t.service_tag, t.today_cost, d.avg_daily, d.stddev_daily,
           (t.today_cost - d.avg_daily) / NULLIF(d.stddev_daily, 0) as z_score
    FROM today t
    JOIN daily_avg d ON t.service_tag = d.service_tag
    WHERE d.stddev_daily > 0
    ORDER BY z_score DESC
  `);

  return rows
    .filter((r) => parseFloat(r.z_score) > 2)  // > 2 standard deviations
    .map((r) => ({
      service: r.service_tag,
      currentDaily: parseFloat(r.today_cost),
      expectedDaily: parseFloat(r.avg_daily),
      deviation: Math.round(parseFloat(r.z_score) * 10) / 10,
      severity: parseFloat(r.z_score) > 3 ? "critical" : "warning",
    }));
}
```

## Step 3: Build the Cost Dashboard API

```typescript
// src/routes/costs.ts — Cost allocation API endpoints
import { Hono } from "hono";
import { getServiceCostReport, getCustomerUnitEconomics, detectCostAnomalies } from "../analytics/cost-analytics";
import { pool } from "../db";

const app = new Hono();

// Team cost summary
app.get("/costs/teams", async (c) => {
  const { rows } = await pool.query(`
    SELECT team_tag, SUM(cost_usd) as total_cost,
           COUNT(DISTINCT service_tag) as service_count
    FROM daily_costs WHERE date >= CURRENT_DATE - 30
    GROUP BY team_tag ORDER BY total_cost DESC
  `);
  return c.json({ teams: rows });
});

// Service-level cost report
app.get("/costs/services/:name", async (c) => {
  const report = await getServiceCostReport(c.req.param("name"));
  return c.json(report);
});

// Customer unit economics
app.get("/costs/customers/:id", async (c) => {
  const economics = await getCustomerUnitEconomics(c.req.param("id"));
  return c.json(economics);
});

// All customers sorted by margin (find unprofitable ones)
app.get("/costs/customers", async (c) => {
  const { rows: customers } = await pool.query("SELECT id FROM customers WHERE status = 'active'");
  const economics = await Promise.all(customers.map((c) => getCustomerUnitEconomics(c.id)));
  economics.sort((a, b) => a.grossMargin - b.grossMargin);
  return c.json({ customers: economics });
});

// Cost anomalies
app.get("/costs/anomalies", async (c) => {
  const anomalies = await detectCostAnomalies();
  return c.json({ anomalies });
});

// Daily cost trend (for charts)
app.get("/costs/trend", async (c) => {
  const days = Number(c.req.query("days") || 30);
  const { rows } = await pool.query(`
    SELECT date, SUM(cost_usd) as total, 
           jsonb_object_agg(team_tag, team_cost) as by_team
    FROM (
      SELECT date, team_tag, SUM(cost_usd) as team_cost
      FROM daily_costs WHERE date >= CURRENT_DATE - $1
      GROUP BY date, team_tag
    ) sub
    GROUP BY date ORDER BY date
  `, [days]);
  return c.json({ trend: rows });
});

export default app;
```

## Results

After deploying the cost allocation system:

- **"What does customer X cost?" answered in 2 seconds** — the CFO's unanswerable question now has a real-time answer; unit economics dashboard shows per-customer gross margin
- **Found 3 customers with negative margins** — one customer's $8K/month infra cost on $2K MRR was identified immediately; pricing adjusted or usage limits applied
- **Staging environment waste cut by 60%** — the system revealed $18K/month spent on staging resources during nights/weekends; automated scheduling saved $11K/month
- **Anomaly detection caught a $4K/day cost spike** — a misconfigured Lambda function was detected within 24 hours instead of the previous discovery time of "next month's bill"
- **Total cost reduction: $23K/month (19%)** — combination of right-sizing, waste elimination, and repricing unprofitable customers based on actual cost data
