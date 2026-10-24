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

Amara runs operations at a 35-person B2B analytics company. Every month, the team manually creates around 200 client reports in Google Docs — copying data from dashboards, formatting tables, adding charts, and exporting to PDF. Each report takes about 45 minutes, which is roughly 150 hours a month of manual work. Reports are inconsistent: different team members use different fonts, chart colors, and layouts. Clients notice. An automated PDF generator would pull data from the database, apply consistent branding, and produce print-ready reports without anyone copying numbers by hand.

## Step 1: Set Up the Project and Schema

Use Node.js 20 or newer:

```bash
npm install @react-pdf/renderer react hono zod pg @fontsource/inter
npm install -D typescript @types/react @types/pg @types/node
```

The generator reads three tables (`clients`; `client_metrics` with `client_id`, `metric_name`, `metric_value` and a `YYYY-MM` `period`; and `channel_analytics` with `channel`, `sessions`, `conversions`, `revenue` and `period`) and logs each run. Set `DATABASE_URL`, and `REPORTS_API_TOKEN` for the API in Step 3:

```sql
CREATE TABLE report_log (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  period text NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  size_bytes integer NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

`src/db.ts` exports a shared `pg.Pool` built from `DATABASE_URL` (`export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })`).

## Step 2: Build the Report Template Engine

The template is a React-PDF document built with `React.createElement`, so it works in a plain `.ts` file. `renderToBuffer` needs a `<Document>` element, which is why the builder is called as a function rather than used as a component. Put your logo at `assets/logo.png`. Fonts come from `@fontsource/inter` (the latin subset; React-PDF reads `.woff` and `.ttf`, not `.woff2`). Table rows are marked `wrap: false` so a row is never split across pages:

```typescript
// src/templates/report-engine.ts -- template-driven PDF with @react-pdf/renderer
import React from "react";
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { pool } from "../db.js";

// Brand font from the @fontsource/inter package (npm i @fontsource/inter).
// react-pdf reads .ttf/.woff, not .woff2.
const inter = (w: number) => `./node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff`;
Font.register({
  family: "Inter",
  fonts: [400, 500, 600, 700].map((w) => ({ src: inter(w), fontWeight: w })),
});

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: "Inter", fontSize: 10, color: "#1f2937" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30, borderBottom: "2px solid #3b82f6", paddingBottom: 15 },
  logo: { width: 120, height: 40, objectFit: "contain" },
  headerText: { textAlign: "right" },
  title: { fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 },
  subtitle: { fontSize: 12, color: "#6b7280" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#1e40af", marginBottom: 10, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: "1px solid #d1d5db", padding: 8 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", padding: 8 },
  tableRowAlt: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", padding: 8, backgroundColor: "#f9fafb" },
  tableCell: { flex: 1, fontSize: 9 },
  tableCellBold: { flex: 1, fontSize: 9, fontWeight: 600 },
  metric: { flexDirection: "row", justifyContent: "space-between", padding: 12, backgroundColor: "#eff6ff", borderRadius: 6, width: "48%" },
  metricLabel: { fontSize: 10, color: "#6b7280" },
  metricValue: { fontSize: 18, fontWeight: 700, color: "#1e40af" },
  footer: { position: "absolute", bottom: 25, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#9ca3af" },
});

export interface ReportData {
  clientName: string;
  reportPeriod: string;
  generatedAt: string;
  metrics: Array<{ label: string; value: string; change: number }>;
  tableColumns: Array<{ key: string; label: string }>;
  tableData: Array<Record<string, string | number | null>>;
  chartImageBase64?: string; // PNG rendered elsewhere, e.g. a chart service
  recommendations: string[];
}

const h = React.createElement;

function buildReport(data: ReportData) {
  return h(Document, { title: `Monthly report - ${data.clientName}` },
    h(Page, { size: "A4", style: styles.page },
      h(View, { style: styles.header },
        h(Image, { src: "./assets/logo.png", style: styles.logo }),
        h(View, { style: styles.headerText },
          h(Text, { style: styles.subtitle }, `Report for ${data.clientName}`),
          h(Text, { style: { fontSize: 9, color: "#9ca3af" } }, data.reportPeriod),
        ),
      ),
      h(Text, { style: styles.title }, "Monthly Analytics Report"),

      h(View, { style: styles.section },
        h(Text, { style: styles.sectionTitle }, "Key Metrics"),
        h(View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 8 } },
          ...data.metrics.map((m, i) =>
            h(View, { key: i, style: styles.metric, wrap: false },
              h(View, {},
                h(Text, { style: styles.metricLabel }, m.label),
                h(Text, { style: styles.metricValue }, m.value),
              ),
              h(Text, { style: { fontSize: 9, color: m.change >= 0 ? "#16a34a" : "#dc2626" } },
                `${m.change >= 0 ? "+" : "-"}${Math.abs(m.change)}% vs last month`),
            )),
        ),
      ),

      h(View, { style: styles.section },
        h(Text, { style: styles.sectionTitle }, "Detailed Breakdown"),
        h(View, { style: styles.tableHeader, fixed: true },
          ...data.tableColumns.map((c) => h(Text, { key: c.key, style: styles.tableCellBold }, c.label))),
        ...data.tableData.map((row, i) =>
          h(View, { key: i, wrap: false, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
            ...data.tableColumns.map((c) => h(Text, { key: c.key, style: styles.tableCell }, String(row[c.key] ?? ""))))),
      ),

      data.chartImageBase64
        ? h(View, { style: styles.section, wrap: false },
            h(Text, { style: styles.sectionTitle }, "Trend Analysis"),
            h(Image, { src: `data:image/png;base64,${data.chartImageBase64}`, style: { width: "100%", height: 200 } }))
        : null,

      h(View, { style: styles.section },
        h(Text, { style: styles.sectionTitle }, "Recommendations"),
        ...data.recommendations.map((r, i) => h(Text, { key: i, style: { marginBottom: 4, paddingLeft: 12 } }, `${i + 1}. ${r}`)),
      ),

      h(View, { style: styles.footer, fixed: true },
        h(Text, {}, `Generated: ${data.generatedAt}`),
        h(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` }),
      ),
    ));
}

export async function renderReport(data: ReportData): Promise<Buffer> {
  // renderToBuffer wants a <Document> element, so call the builder directly, not as a component
  return renderToBuffer(buildReport(data));
}

export async function generateReport(clientId: string, period: string): Promise<Buffer> {
  const data = await fetchReportData(clientId, period);
  const pdf = await renderReport(data);
  await pool.query(
    "INSERT INTO report_log (client_id, period, size_bytes, generated_at) VALUES ($1, $2, $3, NOW())",
    [clientId, period, pdf.length],
  );
  return pdf;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

async function fetchReportData(clientId: string, period: string): Promise<ReportData> {
  // period is "YYYY-MM"; compute the previous month without string maths (January -> December)
  const [year, month] = period.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);

  const { rows: [client] } = await pool.query("SELECT name FROM clients WHERE id = $1", [clientId]);
  if (!client) throw new Error(`Unknown client ${clientId}`);

  // One row per metric with this month and last month side by side (pg returns numeric as string)
  const { rows: metrics } = await pool.query(
    `SELECT cur.metric_name, cur.metric_value::float8 AS value, old.metric_value::float8 AS prev_value
       FROM client_metrics cur
       JOIN client_metrics old ON old.client_id = cur.client_id
        AND old.metric_name = cur.metric_name AND old.period = $3
      WHERE cur.client_id = $1 AND cur.period = $2
      ORDER BY cur.metric_name`,
    [clientId, period, prev],
  );

  const { rows: breakdown } = await pool.query(
    `SELECT channel, sessions, conversions, revenue,
            ROUND(conversions::numeric / NULLIF(sessions, 0) * 100, 2) AS conv_rate
       FROM channel_analytics
      WHERE client_id = $1 AND period = $2
      ORDER BY revenue DESC`,
    [clientId, period],
  );

  return {
    clientName: client.name,
    reportPeriod: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    generatedAt: new Date().toISOString().slice(0, 10),
    metrics: metrics.filter((m) => m.prev_value).map((m) => ({
      label: m.metric_name,
      value: (m.metric_name.includes("revenue") ? "$" : "") + fmt(m.value),
      change: Math.round(((m.value - m.prev_value) / m.prev_value) * 100),
    })),
    tableColumns: [
      { key: "channel", label: "Channel" },
      { key: "sessions", label: "Sessions" },
      { key: "conversions", label: "Conversions" },
      { key: "conv_rate", label: "Conv Rate %" },
      { key: "revenue", label: "Revenue" },
    ],
    tableData: breakdown,
    recommendations: ["Increase budget allocation to top-performing channels"],
  };
}
```

## Step 3: Build the Report API

Parameters are validated with Zod, the routes sit behind a bearer token because the reports hold client data, and the monthly batch renders four reports at a time into a directory instead of needing a queue service:

```typescript
// src/routes/reports.ts -- report API
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { generateReport } from "../templates/report-engine.js";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/); // "2026-09"
const clientId = z.string().uuid();
const bulkBody = z.object({ clientIds: z.array(clientId).min(1).max(500), period });

const app = new Hono();
app.use("*", bearerAuth({ token: process.env.REPORTS_API_TOKEN! })); // reports hold client data

// One report on demand
app.get("/reports/:clientId/:period", async (c) => {
  const parsed = z.object({ clientId, period }).safeParse(c.req.param());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const pdf = await generateReport(parsed.data.clientId, parsed.data.period);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${parsed.data.clientId}-${parsed.data.period}.pdf"`,
    },
  });
});

// Monthly batch: render in the background, 4 at a time, into REPORTS_DIR
app.post("/reports/bulk", async (c) => {
  const parsed = bulkBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { clientIds, period } = parsed.data;

  const dir = process.env.REPORTS_DIR ?? "./reports-out";
  void (async () => {
    await mkdir(dir, { recursive: true });
    const queue = [...clientIds];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          await writeFile(`${dir}/${id}-${period}.pdf`, await generateReport(id, period));
        } catch (err) {
          console.error(`report ${id} ${period} failed`, err);
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  })();

  return c.json({ queued: clientIds.length }, 202);
});

export default app;
```

Serve it with `@hono/node-server` bound to `127.0.0.1` behind your reverse proxy; for batches bigger than one machine handles, use a job queue.

## Results

For the example team (their own figures, not benchmarks of the libraries):

- **Report generation went from 45 minutes of manual work to seconds of rendering**, since data pulling, formatting and PDF output are automated
- **The monthly batch of about 200 reports** runs as one background job instead of 150 hours of copy-paste
- **Brand consistency** comes from one template: the same fonts, colors, layout and logo on every report
- **On-demand reports** let the sales team generate a fresh one before a client call

## Related Skills

- [typescript](../skills/typescript/SKILL.md) -- strict typing for the template and queries
- [hono](../skills/hono/SKILL.md) -- the report API
- [postgresql](../skills/postgresql/SKILL.md) -- the data queries and report log
- [zod](../skills/zod/SKILL.md) -- request validation
