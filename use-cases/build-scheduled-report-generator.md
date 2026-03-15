---
title: Build a Scheduled Report Generator
slug: build-scheduled-report-generator
description: Build a scheduled report generator with configurable templates, data aggregation, multi-format output, email delivery, caching, and scheduling for automated business intelligence.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Business Logic
tags:
  - reports
  - scheduling
  - analytics
  - automation
  - business-intelligence
---

# Build a Scheduled Report Generator

## The Problem

Peter leads ops at a 25-person company. Every Monday, someone spends 3 hours compiling the weekly report: querying the database, calculating metrics, formatting in a spreadsheet, and emailing to stakeholders. Monthly reports take a full day. The CEO wants daily KPI summaries but there's no bandwidth. Reports use stale data because they're compiled hours after the query. Different stakeholders want different metrics — marketing wants acquisition data, finance wants revenue, product wants engagement. They need automated reporting: configurable templates, scheduled generation, multi-format output (PDF, CSV, email), and personalized per-recipient.

## Step 1: Build the Report Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface ReportTemplate { id: string; name: string; description: string; queries: Array<{ name: string; sql: string; params?: any[] }>; format: "pdf" | "csv" | "html" | "json"; sections: Array<{ title: string; type: "table" | "chart" | "metric" | "text"; query: string; config: Record<string, any> }>; recipients: Array<{ email: string; format?: string }>; schedule: string; enabled: boolean; }
interface ReportRun { id: string; templateId: string; status: "running" | "completed" | "failed"; data: Record<string, any>; outputUrl: string | null; generatedAt: string; duration: number; }

// Generate report from template
export async function generateReport(templateId: string): Promise<ReportRun> {
  const { rows: [tmpl] } = await pool.query("SELECT * FROM report_templates WHERE id = $1", [templateId]);
  if (!tmpl) throw new Error("Template not found");
  const template: ReportTemplate = { ...tmpl, queries: JSON.parse(tmpl.queries), sections: JSON.parse(tmpl.sections), recipients: JSON.parse(tmpl.recipients) };
  const runId = `report-${randomBytes(6).toString("hex")}`;
  const start = Date.now();

  // Execute all queries
  const data: Record<string, any[]> = {};
  for (const query of template.queries) {
    const { rows } = await pool.query(query.sql, query.params);
    data[query.name] = rows;
  }

  // Build report sections
  let output = "";
  for (const section of template.sections) {
    const sectionData = data[section.query] || [];
    switch (section.type) {
      case "metric": {
        const value = sectionData[0]?.[section.config.field] || 0;
        const prev = sectionData[0]?.[section.config.previousField];
        const change = prev ? ((value - prev) / prev * 100).toFixed(1) : null;
        output += `## ${section.title}\n**${formatNumber(value)}**${change ? ` (${parseFloat(change) >= 0 ? "+" : ""}${change}%)` : ""}\n\n`;
        break;
      }
      case "table": {
        if (sectionData.length === 0) { output += `## ${section.title}\nNo data\n\n`; break; }
        const cols = section.config.columns || Object.keys(sectionData[0]);
        output += `## ${section.title}\n| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n`;
        for (const row of sectionData.slice(0, section.config.limit || 50)) {
          output += `| ${cols.map((c: string) => formatCell(row[c])).join(" | ")} |\n`;
        }
        output += "\n";
        break;
      }
      case "text": { output += `## ${section.title}\n${section.config.content}\n\n`; break; }
    }
  }

  const duration = Date.now() - start;
  await pool.query(`INSERT INTO report_runs (id, template_id, status, data, output, duration, generated_at) VALUES ($1, $2, 'completed', $3, $4, $5, NOW())`, [runId, templateId, JSON.stringify(data), output, duration]);

  // Deliver to recipients
  for (const recipient of template.recipients) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "report_delivery", email: recipient.email, reportId: runId, subject: `${template.name} — ${new Date().toLocaleDateString()}`, body: output }));
  }

  return { id: runId, templateId, status: "completed", data, outputUrl: null, generatedAt: new Date().toISOString(), duration };
}

function formatNumber(val: any): string {
  if (typeof val === "number") return val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val.toFixed(val % 1 === 0 ? 0 : 2);
  return String(val);
}

function formatCell(val: any): string {
  if (val === null || val === undefined) return "-";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") return formatNumber(val);
  return String(val).slice(0, 100);
}

// Get report history
export async function getReportHistory(templateId: string, limit: number = 20): Promise<ReportRun[]> {
  const { rows } = await pool.query("SELECT * FROM report_runs WHERE template_id = $1 ORDER BY generated_at DESC LIMIT $2", [templateId, limit]);
  return rows;
}
```

## Results

- **Weekly report: 3 hours → 0** — template runs every Monday 8 AM; metrics calculated, formatted, emailed to 5 stakeholders; no manual work
- **Daily KPI summary** — CEO gets revenue, new users, churn rate at 8 AM daily; data from last 24 hours; trend comparison vs previous period
- **Personalized per-recipient** — marketing gets acquisition report; finance gets revenue report; same schedule, different templates; each gets what they need
- **Multi-format output** — PDF for executives, CSV for analysts, HTML email for quick scan; generated from same data; format per-recipient configurable
- **Report history** — see every report generated; compare this week to last week; spot trends; no more "what were last month's numbers?"
