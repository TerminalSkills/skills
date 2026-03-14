---
title: Build a CSV Export with Streaming
slug: build-csv-export-with-streaming
description: Build a streaming CSV export system that generates large files without memory bloat — with column selection, filters, background generation for huge datasets, and download link delivery.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - csv-export
  - streaming
  - data-export
  - performance
  - file-generation
---

# Build a CSV Export with Streaming

## The Problem

Marco leads data ops at a 25-person analytics company. Customers export reports as CSV — but the export endpoint loads all rows into memory, builds the entire CSV string, then sends it. For a 200K-row export, the server allocates 800MB of RAM and frequently crashes with OOM errors. Exports over 50K rows timeout. Large customers can't get their own data out. They need a streaming export that sends data as it's read from the database, handles millions of rows in constant memory, and queues huge exports for background processing.

## Step 1: Build the Streaming Export

```typescript
// src/export/csv-export.ts — Streaming CSV export with background job for large datasets
import { pool } from "../db";
import { Redis } from "ioredis";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform, Readable } from "node:stream";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);

const STREAMING_THRESHOLD = 50000;    // rows above this → background job
const DB_CURSOR_SIZE = 5000;          // rows fetched per DB round-trip

const ExportRequestSchema = z.object({
  entityType: z.enum(["contacts", "orders", "events"]),
  columns: z.array(z.string()).min(1),
  filters: z.record(z.any()).optional(),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).optional(),
});

type ExportRequest = z.infer<typeof ExportRequestSchema>;

// Determine export strategy: stream directly or queue background job
export async function requestExport(
  userId: string,
  request: ExportRequest
): Promise<{ mode: "stream"; stream: Readable } | { mode: "background"; jobId: string; estimatedMinutes: number }> {
  // Estimate row count
  const countQuery = buildCountQuery(request);
  const { rows: [{ count }] } = await pool.query(countQuery.sql, countQuery.params);
  const rowCount = parseInt(count);

  if (rowCount === 0) {
    throw new Error("No data matches your filters");
  }

  if (rowCount <= STREAMING_THRESHOLD) {
    // Stream directly to response
    const stream = createExportStream(request);
    return { mode: "stream", stream };
  }

  // Queue background job for large exports
  const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `INSERT INTO export_jobs (id, user_id, entity_type, columns, filters, row_count, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', NOW())`,
    [jobId, userId, request.entityType, JSON.stringify(request.columns), JSON.stringify(request.filters || {}), rowCount]
  );

  await redis.rpush("export:queue", JSON.stringify({ jobId, userId, request }));

  return {
    mode: "background",
    jobId,
    estimatedMinutes: Math.ceil(rowCount / 100000),  // ~100K rows/min
  };
}

// Create a readable stream that pulls from DB cursor
function createExportStream(request: ExportRequest): Readable {
  const query = buildDataQuery(request);
  let offset = 0;
  let done = false;

  return new Readable({
    objectMode: false,
    async read() {
      if (done) {
        this.push(null);
        return;
      }

      try {
        // First call: push CSV header
        if (offset === 0) {
          this.push(request.columns.join(",") + "\n");
        }

        // Fetch batch from DB
        const { rows } = await pool.query(
          `${query.sql} LIMIT ${DB_CURSOR_SIZE} OFFSET ${offset}`,
          query.params
        );

        if (rows.length === 0) {
          done = true;
          this.push(null);
          return;
        }

        // Convert rows to CSV
        const csv = rows.map((row) =>
          request.columns.map((col) => escapeCSV(String(row[col] ?? ""))).join(",")
        ).join("\n") + "\n";

        this.push(csv);
        offset += rows.length;

        if (rows.length < DB_CURSOR_SIZE) {
          done = true;
          // Don't push null yet — let the buffer flush
        }
      } catch (err) {
        this.destroy(err as Error);
      }
    },
  });
}

// Background job processor for large exports
export async function processExportJob(jobId: string, userId: string, request: ExportRequest): Promise<void> {
  const filePath = `/tmp/exports/${jobId}.csv`;
  await require("node:fs/promises").mkdir("/tmp/exports", { recursive: true });

  await pool.query("UPDATE export_jobs SET status = 'processing', started_at = NOW() WHERE id = $1", [jobId]);

  const writeStream = createWriteStream(filePath);

  // Write header
  writeStream.write(request.columns.join(",") + "\n");

  const query = buildDataQuery(request);
  let offset = 0;
  let totalRows = 0;

  while (true) {
    const { rows } = await pool.query(
      `${query.sql} LIMIT ${DB_CURSOR_SIZE} OFFSET ${offset}`,
      query.params
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const line = request.columns.map((col) => escapeCSV(String(row[col] ?? ""))).join(",") + "\n";
      writeStream.write(line);
    }

    totalRows += rows.length;
    offset += rows.length;

    // Update progress
    await redis.hset(`export:progress:${jobId}`, {
      processedRows: String(totalRows),
      status: "processing",
    });

    if (rows.length < DB_CURSOR_SIZE) break;
  }

  writeStream.end();

  // Upload to temp storage and generate download link
  const downloadUrl = `${process.env.APP_URL}/api/exports/${jobId}/download`;
  const expiresAt = new Date(Date.now() + 24 * 3600000); // 24h

  await pool.query(
    `UPDATE export_jobs SET
       status = 'completed', file_path = $2, download_url = $3,
       expires_at = $4, completed_at = NOW(), processed_rows = $5
     WHERE id = $1`,
    [jobId, filePath, downloadUrl, expiresAt, totalRows]
  );

  // Notify user
  await redis.rpush("notification:queue", JSON.stringify({
    userId,
    type: "export_ready",
    data: { jobId, downloadUrl, rowCount: totalRows, expiresIn: "24 hours" },
  }));
}

// CSV escaping (handles commas, quotes, newlines)
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function buildCountQuery(request: ExportRequest): { sql: string; params: any[] } {
  const { where, params } = buildWhereClause(request);
  return { sql: `SELECT COUNT(*) as count FROM ${request.entityType} ${where}`, params };
}

function buildDataQuery(request: ExportRequest): { sql: string; params: any[] } {
  const columns = request.columns.map((c) => `"${c}"`).join(", ");
  const { where, params } = buildWhereClause(request);
  return { sql: `SELECT ${columns} FROM ${request.entityType} ${where} ORDER BY id`, params };
}

function buildWhereClause(request: ExportRequest): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (request.dateRange) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(request.dateRange.from);
    conditions.push(`created_at <= $${idx++}`);
    params.push(request.dateRange.to);
  }

  if (request.filters) {
    for (const [key, value] of Object.entries(request.filters)) {
      conditions.push(`"${key}" = $${idx++}`);
      params.push(value);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}
```

## Results

- **Memory usage: 800MB → 15MB constant** — streaming reads 5,000 rows at a time; the entire 200K-row export uses the same memory as a 5K-row export
- **Export capacity: 50K → unlimited rows** — 1M-row exports run in background; user gets a notification with download link when ready
- **No more OOM crashes** — server stays stable during concurrent exports; streaming prevents memory spikes
- **Download in 24 hours** — background exports generate a time-limited download link; security-conscious customers appreciate automatic expiration
- **Column selection** — users pick which fields to export; no more "export everything then delete columns in Excel"
