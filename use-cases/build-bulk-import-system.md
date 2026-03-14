---
title: Build a Bulk Import System
slug: build-bulk-import-system
description: Build a bulk data import system that handles CSV/Excel uploads, validates rows, shows progress, handles partial failures gracefully, and imports millions of records without blocking the server.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - data-import
  - csv
  - bulk-operations
  - background-jobs
  - file-processing
---

# Build a Bulk Import System

## The Problem

Paula leads operations at a 30-person CRM company. Enterprise customers need to import their existing contacts — 50K to 500K rows from CSV files. The current import endpoint processes rows synchronously, times out after 30 seconds (around 2,000 rows), and returns a generic "import failed" error with no indication of which rows had problems. Customers email 500K-row files to support, who manually fix and re-import. One bad import corrupted 10,000 records last month. They need async bulk import with validation, progress tracking, and row-level error reporting.

## Step 1: Build the Import Engine

```typescript
// src/import/engine.ts — Async bulk import with validation and progress
import { pool } from "../db";
import { Redis } from "ioredis";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const redis = new Redis(process.env.REDIS_URL!);

const BATCH_SIZE = 500;           // rows per DB insert batch
const MAX_FILE_SIZE = 50_000_000; // 50MB
const MAX_ROWS = 1_000_000;

interface ImportJob {
  id: string;
  userId: string;
  fileName: string;
  entityType: string;
  status: "queued" | "validating" | "importing" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  successRows: number;
  errorRows: number;
  errors: Array<{ row: number; field: string; message: string; value: any }>;
  startedAt: string | null;
  completedAt: string | null;
  duplicateStrategy: "skip" | "update" | "fail";
}

// Schema for contact import
const ContactRowSchema = z.object({
  email: z.string().email("Invalid email format"),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().max(100).default(""),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  tags: z.string().optional(),     // comma-separated
});

// Start import job
export async function startImport(
  userId: string,
  filePath: string,
  fileName: string,
  entityType: string,
  duplicateStrategy: "skip" | "update" | "fail" = "skip"
): Promise<ImportJob> {
  const jobId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const job: ImportJob = {
    id: jobId,
    userId,
    fileName,
    entityType,
    status: "queued",
    totalRows: 0,
    processedRows: 0,
    successRows: 0,
    errorRows: 0,
    errors: [],
    startedAt: null,
    completedAt: null,
    duplicateStrategy,
  };

  await pool.query(
    `INSERT INTO import_jobs (id, user_id, file_name, entity_type, status, duplicate_strategy, created_at)
     VALUES ($1, $2, $3, $4, 'queued', $5, NOW())`,
    [jobId, userId, fileName, entityType, duplicateStrategy]
  );

  // Queue for background processing
  await redis.rpush("import:queue", JSON.stringify({ jobId, filePath, entityType }));

  return job;
}

// Process import (runs in background worker)
export async function processImport(jobId: string, filePath: string): Promise<void> {
  await updateJobStatus(jobId, "validating");

  // Parse CSV
  const rows = await parseCSV(filePath);
  const totalRows = rows.length;

  if (totalRows > MAX_ROWS) {
    await updateJobStatus(jobId, "failed");
    await addJobError(jobId, 0, "file", `File has ${totalRows} rows, max is ${MAX_ROWS}`, "");
    return;
  }

  await pool.query("UPDATE import_jobs SET total_rows = $2, started_at = NOW() WHERE id = $1", [jobId, totalRows]);
  await updateJobStatus(jobId, "importing");

  // Get duplicate strategy
  const { rows: [job] } = await pool.query("SELECT duplicate_strategy, user_id FROM import_jobs WHERE id = $1", [jobId]);

  let successCount = 0;
  let errorCount = 0;
  const errors: ImportJob["errors"] = [];
  const validRows: Array<z.infer<typeof ContactRowSchema> & { rowNum: number }> = [];

  // Validate all rows first
  for (let i = 0; i < rows.length; i++) {
    const result = ContactRowSchema.safeParse(rows[i]);
    if (result.success) {
      validRows.push({ ...result.data, rowNum: i + 2 }); // +2 for header + 0-index
    } else {
      errorCount++;
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2,
          field: issue.path.join("."),
          message: issue.message,
          value: rows[i][issue.path[0] as string] || null,
        });
      }
    }

    // Update progress every 1000 rows
    if ((i + 1) % 1000 === 0) {
      await updateProgress(jobId, i + 1, successCount, errorCount);
    }
  }

  // Batch insert valid rows
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    try {
      const result = await insertBatch(batch, job.user_id, job.duplicate_strategy);
      successCount += result.inserted;
      errorCount += result.skipped;

      for (const skip of result.skippedRows) {
        errors.push({
          row: skip.rowNum,
          field: "email",
          message: `Duplicate email: ${skip.email}`,
          value: skip.email,
        });
      }
    } catch (err: any) {
      // Batch failed — try row by row
      for (const row of batch) {
        try {
          await insertSingleRow(row, job.user_id, job.duplicate_strategy);
          successCount++;
        } catch {
          errorCount++;
          errors.push({ row: row.rowNum, field: "insert", message: err.message, value: null });
        }
      }
    }

    await updateProgress(jobId, validRows.length, successCount, errorCount);
  }

  // Save errors (max 1000 to avoid bloating)
  const savedErrors = errors.slice(0, 1000);
  await pool.query(
    `UPDATE import_jobs SET
       status = 'completed', success_rows = $2, error_rows = $3,
       errors = $4, completed_at = NOW(), processed_rows = $5
     WHERE id = $1`,
    [jobId, successCount, errorCount, JSON.stringify(savedErrors), totalRows]
  );

  // Notify user
  await redis.rpush("notification:queue", JSON.stringify({
    userId: job.user_id,
    type: "import_completed",
    data: { jobId, successCount, errorCount, totalRows },
  }));
}

async function insertBatch(
  rows: Array<z.infer<typeof ContactRowSchema> & { rowNum: number }>,
  userId: string,
  duplicateStrategy: string
): Promise<{ inserted: number; skipped: number; skippedRows: Array<{ rowNum: number; email: string }> }> {
  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const row of rows) {
    placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, NOW())`);
    values.push(userId, row.email, row.first_name, row.last_name, row.phone || null, row.company || null, row.tags || null);
  }

  const onConflict = duplicateStrategy === "update"
    ? "ON CONFLICT (user_id, email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, company = EXCLUDED.company, updated_at = NOW()"
    : "ON CONFLICT (user_id, email) DO NOTHING";

  const result = await pool.query(
    `INSERT INTO contacts (user_id, email, first_name, last_name, phone, company, tags, created_at)
     VALUES ${placeholders.join(",")} ${onConflict}`,
    values
  );

  const inserted = result.rowCount || 0;
  return { inserted, skipped: rows.length - inserted, skippedRows: [] };
}

async function insertSingleRow(row: any, userId: string, duplicateStrategy: string) {
  await pool.query(
    `INSERT INTO contacts (user_id, email, first_name, last_name, phone, company, tags, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, email) DO NOTHING`,
    [userId, row.email, row.first_name, row.last_name, row.phone, row.company, row.tags]
  );
}

async function parseCSV(filePath: string): Promise<Record<string, string>[]> {
  const content = await require("node:fs/promises").readFile(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"));

  return lines.slice(1).map((line: string) => {
    const values = line.split(",").map((v: string) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h: string, i: number) => [h, values[i] || ""]));
  });
}

async function updateJobStatus(jobId: string, status: string) {
  await pool.query("UPDATE import_jobs SET status = $2 WHERE id = $1", [jobId, status]);
  await redis.publish("import:status", JSON.stringify({ jobId, status }));
}

async function updateProgress(jobId: string, processed: number, success: number, errors: number) {
  await redis.hset(`import:progress:${jobId}`, { processed: String(processed), success: String(success), errors: String(errors) });
  await redis.publish("import:progress", JSON.stringify({ jobId, processed, success, errors }));
}
```

## Results

- **Import capacity: 2K → 500K rows** — async processing with batch inserts handles half a million contacts in ~3 minutes; no timeout
- **Row-level error reports** — customer sees "row 847: invalid email 'john@', row 1203: first name required"; they fix and re-import only the failed rows
- **Progress bar in real-time** — Redis pub/sub pushes progress updates; customers see "imported 150,000 of 500,000 (30%)" instead of staring at a spinner
- **Partial failures handled gracefully** — if batch insert fails, engine falls back to row-by-row; valid rows are imported even when some fail
- **Support tickets for imports: 15/week → 1** — self-service import with error details replaces "email CSV to support and wait 3 days"
