---
title: Build a Dynamic PDF Report Generator
slug: build-dynamic-pdf-report-generator
description: Build a template-driven PDF report generator that creates professional documents with charts, tables, headers, and dynamic data — replacing manual report creation with automated, branded PDFs.
skills:
  - typescript
  - hono
  - postgresql
  - zod
category: development
tags:
  - pdf
  - reports
  - templates
  - automation
  - documents
---

# Build a Dynamic PDF Report Generator

## The Problem

Amara runs operations at a 35-person B2B analytics company. Every month, the team manually creates 200+ client reports in Google Docs — copying data from dashboards, formatting tables, adding charts, and exporting to PDF. Each report takes 45 minutes. That's 150 hours/month of manual work. Reports are inconsistent: different team members use different fonts, chart colors, and layouts. Clients notice. An automated PDF generator would pull data from the database, apply consistent branding, and produce print-ready reports in seconds.

## Step 1: Build the Report Template Engine

```typescript
// src/templates/report-engine.ts — Template-driven report generation with React-PDF
import React from "react";
import { renderToStream, Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { pool } from "../db";
import { z } from "zod";

// Register custom fonts for brand consistency
Font.register({
  family: "Inter",
  fonts: [
    { src: "./fonts/Inter-Regular.ttf", fontWeight: 400 },
    { src: "./fonts/Inter-Medium.ttf", fontWeight: 500 },
    { src: "./fonts/Inter-SemiBold.ttf", fontWeight: 600 },
    { src: "./fonts/Inter-Bold.ttf", fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Inter", fontSize: 10, color: "#1f2937" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30, borderBottom: "2px solid #3b82f6", paddingBottom: 15 },
  logo: { width: 120, height: 40 },
  headerText: { textAlign: "right" },
  title: { fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 },
  subtitle: { fontSize: 12, color: "#6b7280" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 10, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 },
  table: { width: "100%" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: "1px solid #d1d5db", padding: 8 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", padding: 8 },
  tableRowAlt: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", padding: 8, backgroundColor: "#f9fafb" },
  tableCell: { flex: 1, fontSize: 9 },
  tableCellBold: { flex: 1, fontSize: 9, fontWeight: 600 },
  metric: { flexDirection: "row", justifyContent: "space-between", padding: 12, marginBottom: 8, backgroundColor: "#eff6ff", borderRadius: 6 },
  metricLabel: { fontSize: 10, color: "#6b7280" },
  metricValue: { fontSize: 18, fontWeight: 700, color: "#1e40af" },
  metricChange: { fontSize: 9 },
  footer: { position: "absolute", bottom: 25, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#9ca3af" },
  pageNumber: { fontSize: 8, color: "#9ca3af" },
});

interface ReportData {
  clientName: string;
  reportPeriod: string;
  generatedAt: string;
  metrics: Array<{ label: string; value: string; change: number; unit: string }>;
  tableData: Array<Record<string, string | number>>;
  tableColumns: Array<{ key: string; label: string }>;
  chartImageBase64?: string;
  summary: string;
  recommendations: string[];
}

// React-PDF document component
function AnalyticsReport({ data }: { data: ReportData }) {
  return React.createElement(Document, {},
    React.createElement(Page, { size: "A4", style: styles.page },
      // Header
      React.createElement(View, { style: styles.header },
        React.createElement(Image, { src: "./assets/logo.png", style: styles.logo }),
        React.createElement(View, { style: styles.headerText },
          React.createElement(Text, { style: styles.subtitle }, `Report for ${data.clientName}`),
          React.createElement(Text, { style: { fontSize: 9, color: "#9ca3af" } }, data.reportPeriod),
        ),
      ),

      // Title
      React.createElement(Text, { style: styles.title }, "Monthly Analytics Report"),

      // Key Metrics
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Key Metrics"),
        React.createElement(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 8 } },
          ...data.metrics.map((m, i) =>
            React.createElement(View, { key: i, style: { ...styles.metric, width: "48%" } },
              React.createElement(View, {},
                React.createElement(Text, { style: styles.metricLabel }, m.label),
                React.createElement(Text, { style: styles.metricValue }, `${m.value}${m.unit}`),
              ),
              React.createElement(Text, {
                style: { ...styles.metricChange, color: m.change >= 0 ? "#16a34a" : "#dc2626" }
              }, `${m.change >= 0 ? "↑" : "↓"} ${Math.abs(m.change)}% vs last month`),
            )
          ),
        ),
      ),

      // Data Table
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Detailed Breakdown"),
        React.createElement(View, { style: styles.table },
          React.createElement(View, { style: styles.tableHeader },
            ...data.tableColumns.map((col, i) =>
              React.createElement(Text, { key: i, style: styles.tableCellBold }, col.label)
            ),
          ),
          ...data.tableData.map((row, i) =>
            React.createElement(View, { key: i, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
              ...data.tableColumns.map((col, j) =>
                React.createElement(Text, { key: j, style: styles.tableCell }, String(row[col.key] || ""))
              ),
            )
          ),
        ),
      ),

      // Chart
      data.chartImageBase64 ? React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Trend Analysis"),
        React.createElement(Image, { src: `data:image/png;base64,${data.chartImageBase64}`, style: { width: "100%", height: 200 } }),
      ) : null,

      // Recommendations
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Recommendations"),
        ...data.recommendations.map((rec, i) =>
          React.createElement(Text, { key: i, style: { marginBottom: 4, paddingLeft: 12 } }, `${i + 1}. ${rec}`)
        ),
      ),

      // Footer
      React.createElement(View, { style: styles.footer, fixed: true },
        React.createElement(Text, {}, `Generated: ${data.generatedAt}`),
        React.createElement(Text, { render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}` }),
      ),
    ),
  );
}

export async function generateReport(clientId: string, period: string): Promise<Buffer> {
  const data = await fetchReportData(clientId, period);
  const stream = await renderToStream(React.createElement(AnalyticsReport, { data }));

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  // Log generation
  await pool.query(
    `INSERT INTO report_log (client_id, period, size_bytes, generated_at)
     VALUES ($1, $2, $3, NOW())`,
    [clientId, period, Buffer.concat(chunks).length]
  );

  return Buffer.concat(chunks);
}

async function fetchReportData(clientId: string, period: string): Promise<ReportData> {
  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const { rows: [client] } = await pool.query("SELECT name FROM clients WHERE id = $1", [clientId]);

  const { rows: metrics } = await pool.query(`
    SELECT metric_name, metric_value, 
           LAG(metric_value) OVER (PARTITION BY metric_name ORDER BY period) as prev_value
    FROM client_metrics 
    WHERE client_id = $1 AND period IN ($2, $3)
    ORDER BY metric_name
  `, [clientId, period, `${year}-${String(month - 1).padStart(2, "0")}`]);

  const { rows: breakdown } = await pool.query(`
    SELECT channel, sessions, conversions, revenue,
           ROUND(conversions::numeric / NULLIF(sessions, 0) * 100, 2) as conv_rate
    FROM channel_analytics 
    WHERE client_id = $1 AND period = $2
    ORDER BY revenue DESC
  `, [clientId, period]);

  return {
    clientName: client.name,
    reportPeriod: `${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    generatedAt: new Date().toISOString().slice(0, 10),
    metrics: metrics.filter((m) => m.prev_value).map((m) => ({
      label: m.metric_name,
      value: formatNumber(m.metric_value),
      change: Math.round(((m.metric_value - m.prev_value) / m.prev_value) * 100),
      unit: m.metric_name.includes("revenue") ? "$" : "",
    })),
    tableData: breakdown,
    tableColumns: [
      { key: "channel", label: "Channel" },
      { key: "sessions", label: "Sessions" },
      { key: "conversions", label: "Conversions" },
      { key: "conv_rate", label: "Conv Rate %" },
      { key: "revenue", label: "Revenue" },
    ],
    summary: "",
    recommendations: [
      "Increase budget allocation to top-performing channels",
      "A/B test landing pages for underperforming segments",
      "Implement retargeting campaigns for cart abandoners",
    ],
  };
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
```

## Step 2: Build the Report API

```typescript
// src/routes/reports.ts — Report generation API with async processing
import { Hono } from "hono";
import { generateReport } from "../templates/report-engine";
import { enqueue } from "../queue/task-queue";

const app = new Hono();

// Generate report synchronously (small reports)
app.get("/reports/:clientId/:period", async (c) => {
  const { clientId, period } = c.req.param();
  const pdf = await generateReport(clientId, period);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${clientId}-${period}.pdf"`,
    },
  });
});

// Bulk generate reports (async via task queue)
app.post("/reports/bulk", async (c) => {
  const { clientIds, period } = await c.req.json();
  const taskIds = [];

  for (const clientId of clientIds) {
    const id = await enqueue({
      type: "report.generate",
      payload: { clientId, period },
      priority: "normal",
      maxRetries: 3,
      timeoutMs: 60000,
    });
    taskIds.push(id);
  }

  return c.json({ queued: taskIds.length, taskIds });
});

export default app;
```

## Results

- **Report generation dropped from 45 minutes to 8 seconds** — automated data pulling, formatting, and PDF rendering replaced manual copy-paste-format cycles
- **150 hours/month of manual work eliminated** — 200 client reports now generate in a single batch job taking 25 minutes total
- **100% brand consistency** — every report uses the same fonts, colors, layouts, and logo placement; client-facing documents look professional
- **On-demand reports available** — sales team generates fresh reports before client calls instead of waiting for the monthly batch
