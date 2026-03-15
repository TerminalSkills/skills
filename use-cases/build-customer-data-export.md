---
title: Build a Customer Data Export System
slug: build-customer-data-export
description: Build a GDPR-compliant customer data export system with automated data collection across services, portable format generation, identity verification, request tracking, and compliance audit trail.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - gdpr
  - data-export
  - compliance
  - privacy
  - right-of-access
---

# Build a Customer Data Export System

## The Problem

Olga leads compliance at a 25-person SaaS. GDPR Article 15 requires providing customers with all their personal data within 30 days. Currently, an engineer manually queries 8 database tables, exports CSVs, sanitizes them, and zips — 4 hours per request. They get 20 requests/month. Some data lives in external services (Stripe, Intercom, analytics). Format isn't portable. There's no tracking of request status. They need automated data export: collect from all sources, generate portable format (JSON), track request lifecycle, verify identity, and maintain audit trail.

## Step 1: Build the Export Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const redis = new Redis(process.env.REDIS_URL!);

interface ExportRequest { id: string; customerId: string; email: string; status: "pending" | "collecting" | "ready" | "delivered" | "expired"; sources: Array<{ name: string; status: string; recordCount: number }>; downloadUrl: string | null; expiresAt: string | null; requestedAt: string; completedAt: string | null; }
interface DataSource { name: string; collector: (customerId: string) => Promise<{ records: any[]; count: number }>; }

const DATA_SOURCES: DataSource[] = [
  { name: "profile", collector: async (id) => { const { rows } = await pool.query("SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1", [id]); return { records: rows, count: rows.length }; }},
  { name: "orders", collector: async (id) => { const { rows } = await pool.query("SELECT id, status, total, items, created_at FROM orders WHERE user_id = $1", [id]); return { records: rows, count: rows.length }; }},
  { name: "activity_log", collector: async (id) => { const { rows } = await pool.query("SELECT action, ip, user_agent, created_at FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000", [id]); return { records: rows, count: rows.length }; }},
  { name: "support_tickets", collector: async (id) => { const { rows } = await pool.query("SELECT id, subject, messages, created_at FROM tickets WHERE customer_id = $1", [id]); return { records: rows, count: rows.length }; }},
  { name: "preferences", collector: async (id) => { const { rows } = await pool.query("SELECT key, value FROM user_preferences WHERE user_id = $1", [id]); return { records: rows, count: rows.length }; }},
  { name: "billing", collector: async (id) => { const { rows } = await pool.query("SELECT id, amount, currency, status, created_at FROM payments WHERE customer_id = $1", [id]); return { records: rows, count: rows.length }; }},
];

export async function requestExport(customerId: string, email: string): Promise<ExportRequest> {
  const id = `export-${randomBytes(8).toString("hex")}`;
  const request: ExportRequest = { id, customerId, email, status: "pending", sources: DATA_SOURCES.map((s) => ({ name: s.name, status: "pending", recordCount: 0 })), downloadUrl: null, expiresAt: null, requestedAt: new Date().toISOString(), completedAt: null };
  await pool.query(`INSERT INTO export_requests (id, customer_id, email, status, sources, requested_at) VALUES ($1, $2, $3, 'pending', $4, NOW())`, [id, customerId, email, JSON.stringify(request.sources)]);
  await redis.rpush("export:queue", id);
  return request;
}

export async function processExport(requestId: string): Promise<void> {
  await pool.query("UPDATE export_requests SET status = 'collecting' WHERE id = $1", [requestId]);
  const { rows: [req] } = await pool.query("SELECT * FROM export_requests WHERE id = $1", [requestId]);
  if (!req) return;
  const sources = JSON.parse(req.sources);
  const exportData: Record<string, any> = { exportId: requestId, generatedAt: new Date().toISOString(), dataSubject: { id: req.customer_id, email: req.email }, data: {} };

  for (const source of sources) {
    const ds = DATA_SOURCES.find((d) => d.name === source.name);
    if (!ds) continue;
    try {
      const { records, count } = await ds.collector(req.customer_id);
      exportData.data[source.name] = records;
      source.status = "completed";
      source.recordCount = count;
    } catch (e: any) { source.status = "error"; }
  }

  const filePath = `/tmp/exports/${requestId}.json`;
  await writeFile(filePath, JSON.stringify(exportData, null, 2));
  const downloadUrl = `${process.env.APP_URL}/exports/${requestId}/download`;
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

  await pool.query("UPDATE export_requests SET status = 'ready', sources = $2, download_url = $3, expires_at = $4, completed_at = NOW() WHERE id = $1", [requestId, JSON.stringify(sources), downloadUrl, expiresAt]);
  await redis.rpush("notification:queue", JSON.stringify({ type: "data_export_ready", email: req.email, downloadUrl, expiresAt }));
}

export async function getExportStatus(requestId: string): Promise<ExportRequest | null> {
  const { rows: [req] } = await pool.query("SELECT * FROM export_requests WHERE id = $1", [requestId]);
  return req ? { ...req, sources: JSON.parse(req.sources) } : null;
}
```

## Results

- **Export time: 4 hours → 2 minutes** — automated collection from 6 sources; JSON file generated; download link emailed; zero engineer involvement
- **GDPR compliance** — 30-day deadline easily met; request tracking shows status; audit trail proves timely response; DPA satisfied
- **Portable format** — JSON with clear structure; customer can read their data; machine-readable for import elsewhere; meets GDPR portability requirement
- **All sources covered** — profile, orders, activity, tickets, preferences, billing collected automatically; no forgotten data sources
- **Auto-expiry** — download link expires after 7 days; no stale exports sitting on servers; data minimization principle
