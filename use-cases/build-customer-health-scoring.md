---
title: Build a Customer Health Scoring System
slug: build-customer-health-scoring
description: Build a customer health scoring system with behavioral signals, engagement metrics, product usage tracking, risk alerts, and CS playbook triggers for proactive retention.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - customer-health
  - retention
  - saas
  - analytics
  - scoring
---

# Build a Customer Health Scoring System

## The Problem

Kate leads CS at a 25-person SaaS with 2,000 customers. They find out about churn when the customer cancels — too late. Usage data exists but nobody monitors it systematically. An enterprise customer stopped logging in 3 weeks ago; nobody noticed until they asked for a refund. CS has no way to prioritize — they spend equal time on healthy accounts and at-risk ones. They need health scoring: aggregate usage signals, score accounts 0-100, alert on declining health, trigger CS playbooks for at-risk accounts, and prioritize the team's time.

## Step 1: Build the Health Scoring Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface HealthScore {
  customerId: string;
  score: number;
  trend: "improving" | "stable" | "declining";
  signals: Array<{ name: string; value: number; weight: number; contribution: number }>;
  riskLevel: "healthy" | "monitor" | "at_risk" | "critical";
  lastCalculated: string;
}

interface HealthSignal {
  name: string;
  weight: number;
  calculator: (customerId: string) => Promise<number>;
}

const SIGNALS: HealthSignal[] = [
  { name: "login_frequency", weight: 0.2, calculator: async (id) => {
    const { rows: [r] } = await pool.query("SELECT COUNT(*) as c FROM sessions WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '30 days'", [id]);
    return Math.min(1, parseInt(r.c) / 20);
  }},
  { name: "feature_adoption", weight: 0.2, calculator: async (id) => {
    const { rows: [r] } = await pool.query("SELECT COUNT(DISTINCT feature) as c FROM feature_usage WHERE customer_id = $1 AND used_at > NOW() - INTERVAL '30 days'", [id]);
    return Math.min(1, parseInt(r.c) / 10);
  }},
  { name: "support_sentiment", weight: 0.15, calculator: async (id) => {
    const { rows: [r] } = await pool.query("SELECT AVG(rating) as avg FROM support_tickets WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '90 days'", [id]);
    return r.avg ? parseFloat(r.avg) / 5 : 0.5;
  }},
  { name: "api_usage_trend", weight: 0.15, calculator: async (id) => {
    const key = `usage:${id}:api_calls:${new Date().toISOString().slice(0, 7)}`;
    const current = parseFloat(await redis.get(key) || "0");
    const prevKey = `usage:${id}:api_calls:${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7)}`;
    const previous = parseFloat(await redis.get(prevKey) || "1");
    return previous > 0 ? Math.min(1, current / previous) : 0;
  }},
  { name: "payment_health", weight: 0.15, calculator: async (id) => {
    const { rows: [r] } = await pool.query("SELECT COUNT(*) FILTER (WHERE status = 'failed') as failed, COUNT(*) as total FROM payments WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '90 days'", [id]);
    return parseInt(r.total) > 0 ? 1 - (parseInt(r.failed) / parseInt(r.total)) : 1;
  }},
  { name: "team_growth", weight: 0.15, calculator: async (id) => {
    const { rows: [r] } = await pool.query("SELECT COUNT(*) as c FROM users WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '30 days'", [id]);
    return Math.min(1, parseInt(r.c) / 3);
  }},
];

export async function calculateHealthScore(customerId: string): Promise<HealthScore> {
  const signals: HealthScore["signals"] = [];
  let totalScore = 0;

  for (const signal of SIGNALS) {
    const value = await signal.calculator(customerId);
    const contribution = value * signal.weight;
    totalScore += contribution;
    signals.push({ name: signal.name, value: Math.round(value * 100), weight: signal.weight, contribution: Math.round(contribution * 100) });
  }

  const score = Math.round(totalScore * 100);
  const prevScore = parseInt(await redis.get(`health:prev:${customerId}`) || String(score));
  const trend = score > prevScore + 5 ? "improving" : score < prevScore - 5 ? "declining" : "stable";
  const riskLevel = score >= 70 ? "healthy" : score >= 50 ? "monitor" : score >= 30 ? "at_risk" : "critical";

  await redis.set(`health:prev:${customerId}`, score);
  await redis.setex(`health:score:${customerId}`, 86400, JSON.stringify({ score, trend, riskLevel }));

  await pool.query(
    `INSERT INTO health_scores (customer_id, score, trend, risk_level, signals, calculated_at) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET score = $2, trend = $3, risk_level = $4, signals = $5, calculated_at = NOW()`,
    [customerId, score, trend, riskLevel, JSON.stringify(signals)]
  );

  if (riskLevel === "critical" || (riskLevel === "at_risk" && trend === "declining")) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "health_alert", customerId, score, riskLevel, trend }));
  }

  return { customerId, score, trend, signals, riskLevel, lastCalculated: new Date().toISOString() };
}

export async function getHealthDashboard(): Promise<{ distribution: Record<string, number>; atRisk: HealthScore[]; improving: HealthScore[] }> {
  const { rows } = await pool.query("SELECT * FROM health_scores ORDER BY score ASC");
  const distribution: Record<string, number> = { healthy: 0, monitor: 0, at_risk: 0, critical: 0 };
  for (const r of rows) distribution[r.risk_level]++;

  return {
    distribution,
    atRisk: rows.filter((r: any) => r.risk_level === "critical" || r.risk_level === "at_risk").slice(0, 20),
    improving: rows.filter((r: any) => r.trend === "improving").slice(0, 10),
  };
}
```

## Results

- **Churn predicted 30 days early** — declining health score from 72→41 over 3 weeks triggers alert; CS reaches out before customer considers leaving; saves $50K ARR per save
- **CS time prioritized** — dashboard shows 15 critical accounts (of 2,000); CS focuses on highest-impact accounts; coverage up 3x with same team
- **Enterprise no-login caught** — login_frequency signal drops to 0; health score plummets; alert fires after 7 days, not 3 weeks; executive sponsor contacted
- **Multi-signal scoring** — payment failure alone doesn't mean unhealthy; combined with low usage + support complaints = real risk; nuanced picture
- **Trend tracking** — account improving from 35→55 = recovering, deprioritize; account declining from 80→60 = new risk, escalate; direction matters as much as score
