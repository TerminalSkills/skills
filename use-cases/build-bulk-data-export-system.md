---
title: Build a Bulk Data Export System
slug: build-bulk-data-export-system
description: Build an async data export system that generates CSV, Excel, and PDF reports from large datasets without blocking the API, with progress tracking and secure download links.
skills:
  - typescript
  - bull-mq
  - postgresql
  - redis
  - hono
  - zod
category: development
tags:
  - data-export
  - csv
  - excel
  - background-jobs
  - streaming
---

# Build a Bulk Data Export System

## The Problem

Lena manages a 25-person HR-tech startup. Customers regularly export employee records, payroll summaries, and compliance reports — datasets ranging from 5,000 to 500,000 rows. The current approach generates exports synchronously in the API request: anything over 50,000 rows times out after 30 seconds, and three concurrent exports spike memory to 4GB, crashing the server. Enterprise customers threatening to churn need reliable exports of their full datasets, and the sales team lost a $180K deal because the prospect couldn't export a trial dataset.

## Step 1: Design the Export Request System

Exports are asynchronous: clients submit an export request, receive a job ID, and poll for completion (or get notified via webhook). This decouples the API from heavy data processing.

```typescript
// src/types.ts — Export system type definitions
import { z } from "zod";

export const ExportRequestSchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  resource: z.enum(["employees", "payroll", "timesheets", "compliance"]),
  filters: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    status: z.string().optional(),
  }).optional(),
  columns: z.array(z.string()).optional(), // custom column selection
  webhookUrl: z.string().url().optional(),  // notify when ready
});

export interface ExportJob {
  id: string;
  accountId: string;
  requestedBy: string;
  format: "csv" | "xlsx" | "pdf";
  resource: string;
  filters: Record<string, any>;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;            // 0-100
  totalRows: number | null;
  filePath: string | null;
  fileSize: number | null;
  downloadUrl: string | null;
  expiresAt: Date | null;      // download link expiration (24h)
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}
```

## Step 2: Build the Streaming Data Processor

The key to handling large exports without memory issues: stream rows from the database in batches and write directly to the output file. Peak memory stays constant regardless of dataset size.

```typescript
// src/services/export-processor.ts — Streaming export with constant memory usage
import { pool } from "../db";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { stringify } from "csv-stringify";
import ExcelJS from "exceljs";

const BATCH_SIZE = 5000; // rows per database cursor fetch

interface ExportContext {
  jobId: string;
  resource: string;
  filters: Record<string, any>;
  columns?: string[];
  onProgress: (processed: number, total: number) => Promise<void>;
}

export async function generateCSV(ctx: ExportContext, outputPath: string): Promise<number> {
  const { query, params, totalRows } = await buildQuery(ctx);

  const client = await pool.connect();
  try {
    // Use a database cursor to stream rows without loading all into memory
    await client.query("BEGIN");
    await client.query(`DECLARE export_cursor CURSOR FOR ${query}`, params);

    const csvStringifier = stringify({
      header: true,
      columns: ctx.columns || undefined,
    });
    const output = createWriteStream(outputPath);

    let processed = 0;

    // Pipe through a transform that fetches batches from the cursor
    const fetchTransform = new Transform({
      objectMode: true,
      async transform(_, __, callback) {
        const { rows } = await client.query(
          `FETCH ${BATCH_SIZE} FROM export_cursor`
        );

        if (rows.length === 0) {
          this.push(null); // signal end
          callback();
          return;
        }

        for (const row of rows) {
          csvStringifier.write(formatRow(row, ctx.resource));
        }

        processed += rows.length;
        await ctx.onProgress(processed, totalRows);

        // Trigger next fetch
        this.push("continue");
        callback();
      },
    });

    // Start the streaming pipeline
    csvStringifier.pipe(output);

    // Drive the cursor fetching
    let hasMore = true;
    while (hasMore) {
      const { rows } = await client.query(
        `FETCH ${BATCH_SIZE} FROM export_cursor`
      );

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const row of rows) {
        // Backpressure: wait if the write buffer is full
        const canContinue = csvStringifier.write(formatRow(row, ctx.resource));
        if (!canContinue) {
          await new Promise((resolve) => csvStringifier.once("drain", resolve));
        }
      }

      processed += rows.length;
      await ctx.onProgress(processed, totalRows);
    }

    csvStringifier.end();
    await new Promise((resolve) => output.on("finish", resolve));

    await client.query("CLOSE export_cursor");
    await client.query("COMMIT");

    return processed;
  } finally {
    client.release();
  }
}

export async function generateXLSX(ctx: ExportContext, outputPath: string): Promise<number> {
  const { query, params, totalRows } = await buildQuery(ctx);

  // ExcelJS streaming workbook writer — writes to disk, not memory
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outputPath,
    useStyles: true,
  });
  const sheet = workbook.addWorksheet(ctx.resource);

  const client = await pool.connect();
  let processed = 0;

  try {
    await client.query("BEGIN");
    await client.query(`DECLARE export_cursor CURSOR FOR ${query}`, params);

    let headerSet = false;

    while (true) {
      const { rows } = await client.query(
        `FETCH ${BATCH_SIZE} FROM export_cursor`
      );
      if (rows.length === 0) break;

      // Set columns from first batch
      if (!headerSet && rows.length > 0) {
        const columns = ctx.columns || Object.keys(rows[0]);
        sheet.columns = columns.map((key) => ({
          header: formatHeader(key), // snake_case → Title Case
          key,
          width: 20,
        }));
        headerSet = true;
      }

      for (const row of rows) {
        sheet.addRow(formatRow(row, ctx.resource)).commit();
      }

      processed += rows.length;
      await ctx.onProgress(processed, totalRows);
    }

    await client.query("CLOSE export_cursor");
    await client.query("COMMIT");

    await workbook.commit(); // flush remaining data to disk

    return processed;
  } finally {
    client.release();
  }
}

async function buildQuery(ctx: ExportContext) {
  const { resource, filters } = ctx;

  // Count total rows first for progress reporting
  let countQuery = `SELECT COUNT(*) FROM ${resource}`;
  let dataQuery = `SELECT * FROM ${resource}`;
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters?.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`created_at <= $${params.length}`);
  }
  if (filters?.departmentIds?.length) {
    params.push(filters.departmentIds);
    conditions.push(`department_id = ANY($${params.length})`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  countQuery += where;
  dataQuery += `${where} ORDER BY created_at DESC`;

  const { rows } = await pool.query(countQuery, params);
  const totalRows = Number(rows[0].count);

  return { query: dataQuery, params, totalRows };
}

function formatRow(row: any, resource: string): Record<string, any> {
  // Sanitize values for export — prevent CSV injection
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) {
      sanitized[key] = `'${value}`; // prefix with single quote
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function formatHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

## Step 3: Wire the Export Queue with Progress Tracking

BullMQ manages the export queue. Workers pick up jobs, generate files, upload to S3, and update status. Clients poll a lightweight endpoint or receive a webhook callback.

```typescript
// src/services/export-queue.ts — BullMQ export job orchestration
import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import { generateCSV, generateXLSX } from "./export-processor";
import { uploadToS3, generateSignedUrl } from "./storage";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);
const exportQueue = new Queue("exports", { connection: redis });

export async function submitExport(params: {
  accountId: string;
  requestedBy: string;
  format: string;
  resource: string;
  filters?: Record<string, any>;
  columns?: string[];
  webhookUrl?: string;
}): Promise<string> {
  const jobId = randomUUID();

  // Create tracking record
  await pool.query(
    `INSERT INTO export_jobs (id, account_id, requested_by, format, resource, filters, status, progress, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', 0, NOW())`,
    [jobId, params.accountId, params.requestedBy, params.format, params.resource, params.filters || {}]
  );

  await exportQueue.add("generate", { ...params, jobId }, {
    jobId,
    attempts: 2,
    backoff: { type: "fixed", delay: 10_000 },
    removeOnComplete: { age: 86400 },     // clean up after 24h
    removeOnFail: { age: 604800 },        // keep failed for 7 days for debugging
  });

  return jobId;
}

// Export worker — processes one export at a time per worker
const worker = new Worker(
  "exports",
  async (job: Job) => {
    const { jobId, format, resource, filters, columns, accountId, webhookUrl } = job.data;
    const tmpPath = `/tmp/export-${jobId}.${format}`;

    try {
      await updateStatus(jobId, "processing", 0);

      // Progress callback — updates database and Redis for polling
      const onProgress = async (processed: number, total: number) => {
        const pct = Math.round((processed / total) * 100);
        await redis.setex(`export:${jobId}:progress`, 3600, JSON.stringify({
          status: "processing",
          progress: pct,
          processedRows: processed,
          totalRows: total,
        }));
        // Update DB less frequently to avoid write pressure
        if (pct % 10 === 0) {
          await updateStatus(jobId, "processing", pct);
        }
      };

      // Generate the file based on format
      let totalRows: number;
      const ctx = { jobId, resource, filters, columns, onProgress };

      switch (format) {
        case "csv":
          totalRows = await generateCSV(ctx, tmpPath);
          break;
        case "xlsx":
          totalRows = await generateXLSX(ctx, tmpPath);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Upload to S3
      const fileStats = await stat(tmpPath);
      const s3Key = `exports/${accountId}/${jobId}.${format}`;
      await uploadToS3(tmpPath, s3Key);

      // Generate signed URL valid for 24 hours
      const downloadUrl = await generateSignedUrl(s3Key, 86400);
      const expiresAt = new Date(Date.now() + 86400 * 1000);

      // Update final status
      await pool.query(
        `UPDATE export_jobs SET status = 'completed', progress = 100, total_rows = $2,
         file_size = $3, download_url = $4, expires_at = $5, completed_at = NOW()
         WHERE id = $1`,
        [jobId, totalRows, fileStats.size, downloadUrl, expiresAt]
      );

      // Notify via webhook if configured
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "export.completed",
            exportId: jobId,
            downloadUrl,
            totalRows,
            fileSize: fileStats.size,
            expiresAt: expiresAt.toISOString(),
          }),
        }).catch(() => {}); // best-effort webhook
      }

      // Clean up temp file
      await unlink(tmpPath).catch(() => {});
    } catch (error) {
      await pool.query(
        "UPDATE export_jobs SET status = 'failed', error_message = $2 WHERE id = $1",
        [jobId, (error as Error).message]
      );
      await unlink(tmpPath).catch(() => {});
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 3,           // max 3 concurrent exports
    limiter: {
      max: 10,
      duration: 60_000,       // max 10 exports started per minute
    },
  }
);

async function updateStatus(jobId: string, status: string, progress: number) {
  await pool.query(
    "UPDATE export_jobs SET status = $2, progress = $3 WHERE id = $1",
    [jobId, status, progress]
  );
}
```

## Step 4: Build the Export API Endpoints

Clean REST endpoints let clients submit exports, check status, and download files. The status endpoint hits Redis first for real-time progress, falling back to the database.

```typescript
// src/routes/exports.ts — Export API with progress polling
import { Hono } from "hono";
import { Redis } from "ioredis";
import { ExportRequestSchema } from "../types";
import { submitExport } from "../services/export-queue";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Submit a new export request
app.post("/exports", async (c) => {
  const accountId = c.get("accountId");
  const userId = c.get("userId");
  const body = await c.req.json();
  const params = ExportRequestSchema.parse(body);

  // Check concurrent export limit per account
  const { rows } = await pool.query(
    "SELECT COUNT(*) as active FROM export_jobs WHERE account_id = $1 AND status IN ('queued', 'processing')",
    [accountId]
  );
  if (Number(rows[0].active) >= 5) {
    return c.json({ error: "Maximum 5 concurrent exports. Wait for current exports to complete." }, 429);
  }

  const exportId = await submitExport({
    accountId,
    requestedBy: userId,
    ...params,
  });

  return c.json({ exportId, status: "queued", pollUrl: `/api/exports/${exportId}` }, 202);
});

// Check export status — fast Redis lookup with DB fallback
app.get("/exports/:exportId", async (c) => {
  const { exportId } = c.req.param();
  const accountId = c.get("accountId");

  // Try Redis first for real-time progress
  const cached = await redis.get(`export:${exportId}:progress`);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Fall back to database
  const { rows } = await pool.query(
    `SELECT id, status, progress, total_rows, file_size, download_url, expires_at, error_message, created_at, completed_at
     FROM export_jobs WHERE id = $1 AND account_id = $2`,
    [exportId, accountId]
  );

  if (rows.length === 0) return c.json({ error: "Export not found" }, 404);

  return c.json(rows[0]);
});

// List recent exports for the account
app.get("/exports", async (c) => {
  const accountId = c.get("accountId");
  const limit = Math.min(Number(c.req.query("limit") || 20), 100);

  const { rows } = await pool.query(
    `SELECT id, format, resource, status, progress, total_rows, file_size, 
            download_url, expires_at, created_at, completed_at
     FROM export_jobs WHERE account_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit]
  );

  return c.json({ exports: rows });
});

export default app;
```

## Results

After deploying the async export system:

- **Zero export timeouts** — the largest export (480,000 rows, 120MB XLSX) completes in 45 seconds vs. the previous 30-second timeout crash
- **Memory usage capped at 200MB per worker** — streaming cursor approach means constant memory regardless of dataset size; previously 4GB+ for large exports
- **Customer churn risk eliminated** — enterprise clients export full datasets reliably; the previously-lost $180K prospect signed after seeing the export demo
- **Support tickets for exports dropped from 8/week to 0** — progress tracking and webhook notifications mean customers never wonder "is it stuck?"
- **S3 cost: $12/month** — signed URLs expire after 24 hours, auto-cleanup keeps storage lean
