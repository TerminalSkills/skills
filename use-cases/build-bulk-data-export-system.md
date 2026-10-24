---
title: Build a Bulk Data Export System
slug: build-bulk-data-export-system
description: Build an async data export system that generates CSV and Excel files from large datasets without blocking the API, with progress tracking and short-lived signed download links.
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

Lena manages a 25-person HR-tech startup. Customers regularly export employee records, payroll summaries, and timesheets, with datasets from 5,000 to 500,000 rows. The current approach builds the file inside the API request: anything over 50,000 rows times out after 30 seconds, and three concurrent exports push the server to 4GB of memory and crash it. Enterprise customers need reliable exports of their full datasets, and the sales team lost a deal because a prospect could not export a trial dataset.

## The Solution

Exports become background jobs. The API validates the request, writes a row to an `export_jobs` table and puts a job on a [BullMQ](https://docs.bullmq.io) queue backed by Redis, then answers `202` with a job ID. A worker streams rows out of PostgreSQL through a server-side cursor straight into a CSV or XLSX file, uploads it to S3, and the client polls for progress and gets a short-lived signed link. Only one batch of rows is ever in memory.

Three rules: every query is scoped to the caller's `account_id`, table and column names come from an allow-list, and the signed link is created only after an authorised status request.

Install (BullMQ 6, ioredis 6, Zod 4, Hono 4):

```bash
npm i bullmq ioredis pg pg-cursor exceljs csv-stringify zod hono @hono/node-server \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i -D typescript tsx @types/node @types/pg @types/pg-cursor
```

## Step-by-Step Walkthrough

### Step 1: Create the job table and validate requests

The table holds job state that must outlive Redis; live progress stays in BullMQ. In Zod 4, `z.iso.datetime()` and `z.uuid()` replace the older `z.string().datetime()` and `z.string().uuid()`.

```sql
CREATE TABLE export_jobs (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, requested_by uuid NOT NULL,
  format text NOT NULL, resource text NOT NULL, status text NOT NULL,
  total_rows bigint, file_size bigint, s3_key text, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX ON export_jobs (account_id, created_at DESC);
```

```typescript
import { z } from "zod";
export const ExportRequest = z.object({
  format: z.enum(["csv", "xlsx"]),
  resource: z.enum(["employees", "payroll", "timesheets"]),
  filters: z
    .object({
      dateFrom: z.iso.datetime().optional(),
      dateTo: z.iso.datetime().optional(),
      departmentIds: z.array(z.uuid()).optional(),
      status: z.string().max(40).optional(),
    })
    .default({}),
  columns: z.array(z.string()).optional(), // checked against the allow-list below
});
export type ExportRequest = z.infer<typeof ExportRequest>;
```

### Step 2: Stream rows into a file

`pg-cursor` reads a batch at a time from a server-side cursor, so memory does not grow with the row count. `Readable.from` turns the generator into a stream and `pipeline` handles backpressure and cleanup. Two details that bite in practice: `csv-stringify` writes `Date` values as epoch milliseconds unless you cast them, and a text cell that starts with `=`, `+`, `-` or `@` runs as a formula in Excel, so such cells get a leading quote. An Excel sheet holds at most 1,048,576 rows, so larger XLSX requests fail fast and point to CSV.

```typescript
import pg from "pg";
import Cursor from "pg-cursor";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ExportRequest } from "./types";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const BATCH = 5000;
const XLSX_MAX_ROWS = 1_048_575; // one sheet holds 1,048,576 rows including the header
export const RESOURCES = {
  employees: ["id", "full_name", "email", "department_id", "status", "created_at"],
  payroll: ["id", "employee_id", "department_id", "gross", "net", "status", "created_at"],
  timesheets: ["id", "employee_id", "department_id", "hours", "status", "created_at"],
} as const;
function buildQuery(accountId: string, req: ExportRequest) {
  const all: readonly string[] = RESOURCES[req.resource];
  const columns = req.columns?.length ? req.columns : [...all];
  const bad = columns.filter((c) => !all.includes(c));
  if (bad.length) throw new Error(`Unknown columns: ${bad.join(", ")}`);
  const params: unknown[] = [accountId]; // every export is scoped to one tenant
  const where = ["account_id = $1"];
  const { dateFrom, dateTo, departmentIds, status } = req.filters;
  if (dateFrom) where.push(`created_at >= $${params.push(dateFrom)}`);
  if (dateTo) where.push(`created_at <= $${params.push(dateTo)}`);
  if (departmentIds?.length) where.push(`department_id = ANY($${params.push(departmentIds)})`);
  if (status) where.push(`status = $${params.push(status)}`);
  const from = `FROM ${req.resource} WHERE ${where.join(" AND ")}`;
  return {
    columns,
    params,
    count: `SELECT count(*) ${from}`,
    data: `SELECT ${columns.join(", ")} ${from} ORDER BY created_at DESC, id`,
  };
}
// Formula injection: Excel runs cells starting with = + - @ tab or CR. pg returns numeric
// columns as strings, so plain numbers such as "-20.25" are left alone
const NUMBER = /^-?\d+(\.\d+)?$/;
const safe = (v: unknown) =>
  typeof v === "string" && /^[=+\-@\t\r]/.test(v) && !NUMBER.test(v) ? `'${v}` : v;
const sanitize = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safe(v)]));
async function* rows(sql: string, params: unknown[], onBatch: (n: number) => Promise<void>) {
  const client = await pool.connect();
  const cursor = client.query(new Cursor(sql, params)); // server-side cursor, no BEGIN needed
  let done = 0;
  try {
    for (let batch = await cursor.read(BATCH); batch.length; batch = await cursor.read(BATCH)) {
      for (const row of batch) yield sanitize(row);
      done += batch.length;
      await onBatch(done);
    }
  } finally {
    await cursor.close();
    client.release();
  }
}
export async function generate(
  accountId: string, req: ExportRequest, path: string,
  onProgress: (done: number, total: number) => Promise<void>,
) {
  const q = buildQuery(accountId, req);
  const total = Number((await pool.query(q.count, q.params)).rows[0].count);
  if (req.format === "xlsx" && total > XLSX_MAX_ROWS) {
    throw new Error(`Too many rows for one Excel sheet (${total}); export CSV instead`);
  }
  const source = rows(q.data, q.params, (n) => onProgress(n, total));
  if (req.format === "csv") {
    await pipeline(
      Readable.from(source),
      // csv-stringify turns Date into epoch milliseconds by default
      stringify({ header: true, columns: q.columns, cast: { date: (d) => d.toISOString() } }),
      createWriteStream(path),
    );
  } else {
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path });
    const sheet = wb.addWorksheet(req.resource);
    sheet.columns = q.columns.map((key) => ({ header: key.replace(/_/g, " "), key, width: 20 }));
    for await (const row of source) sheet.addRow(row).commit();
    await sheet.commit();
    await wb.commit();
  }
  return total;
}
```

### Step 3: Queue the work and track progress

BullMQ workers use blocking Redis commands, so the ioredis connection needs `maxRetriesPerRequest: null`. Progress goes through `job.updateProgress()`, which BullMQ stores in Redis, and the database row is only written at state changes. The row is marked `failed` only after the last retry attempt, so a transient error does not show a failure to the client.

```typescript
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { generate, pool } from "./processor";
import { upload } from "./storage";
import type { ExportRequest } from "./types";
// BullMQ workers use blocking commands: maxRetriesPerRequest must be null
const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});
export const exportQueue = new Queue("exports", { connection });
type JobData = { jobId: string; accountId: string; request: ExportRequest };
export async function submitExport(accountId: string, userId: string, request: ExportRequest) {
  const jobId = randomUUID();
  await pool.query(
    "INSERT INTO export_jobs (id, account_id, requested_by, format, resource, status) VALUES ($1,$2,$3,$4,$5,'queued')",
    [jobId, accountId, userId, request.format, request.resource]);
  await exportQueue.add("generate", { jobId, accountId, request } satisfies JobData, {
    jobId, attempts: 2, backoff: { type: "fixed", delay: 10_000 },
    removeOnComplete: { age: 86_400 }, removeOnFail: { age: 604_800 } });
  return jobId;
}
export const worker = new Worker<JobData>(
  "exports",
  async (job) => {
    const { jobId, accountId, request } = job.data;
    const path = join(tmpdir(), `export-${jobId}.${request.format}`);
    try {
      await pool.query("UPDATE export_jobs SET status = 'processing' WHERE id = $1", [jobId]);
      const total = await generate(accountId, request, path, (done, total) =>
        job.updateProgress(Math.floor((done / Math.max(total, 1)) * 100))); // stored in Redis
      const key = `exports/${accountId}/${jobId}.${request.format}`;
      const size = await upload(path, key);
      await pool.query(
        `UPDATE export_jobs SET status = 'completed', total_rows = $2, file_size = $3,
           s3_key = $4, completed_at = now() WHERE id = $1`,
        [jobId, total, size, key],
      );
    } finally {
      await unlink(path).catch(() => {});
    }
  },
  { connection, concurrency: 3, limiter: { max: 10, duration: 60_000 } },
);
// Mark the row failed only when the last attempt has failed
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await pool.query("UPDATE export_jobs SET status = 'failed', error_message = $2 WHERE id = $1",
      [job.data.jobId, err.message.slice(0, 500)]);
  }
});
```

### Step 4: Upload and sign

The link is signed on each status request and expires in 15 minutes, so a revoked user cannot reuse an old URL. Set `S3_ENDPOINT` for MinIO, R2 or another S3-compatible store.

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, forcePathStyle: !!process.env.S3_ENDPOINT });
const Bucket = process.env.S3_BUCKET!;
export async function upload(path: string, Key: string) {
  const { size } = await stat(path);
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: createReadStream(path), ContentLength: size }));
  return size;
}
// Signed on every request, so the link only exists after an authorised GET
export const signedUrl = (Key: string, seconds = 900) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: seconds });
```

### Step 5: Expose the API

Auth middleware (not shown) sets `accountId` and `userId`. Serve with `serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 })` from `@hono/node-server`, behind your reverse proxy.

```typescript
import { Hono } from "hono";
import { ExportRequest } from "./types";
import { exportQueue, submitExport } from "./queue";
import { pool } from "./processor";
import { signedUrl } from "./storage";
type Env = { Variables: { accountId: string; userId: string } };
export const app = new Hono<Env>();
app.post("/exports", async (c) => {
  const parsed = ExportRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
  const accountId = c.get("accountId");
  const { rows } = await pool.query(
    "SELECT count(*)::int AS active FROM export_jobs WHERE account_id = $1 AND status IN ('queued','processing')", [accountId]);
  if (rows[0].active >= 5) return c.json({ error: "Maximum 5 concurrent exports" }, 429);
  const id = await submitExport(accountId, c.get("userId"), parsed.data);
  return c.json({ id, status: "queued", pollUrl: `/exports/${id}` }, 202);
});
app.get("/exports/:id", async (c) => {
  const { rows } = await pool.query(
    `SELECT id, format, resource, status, total_rows, file_size, s3_key, error_message, created_at, completed_at
     FROM export_jobs WHERE id = $1 AND account_id = $2`, // the tenant check applies to every read
    [c.req.param("id"), c.get("accountId")],
  );
  if (!rows.length) return c.json({ error: "Export not found" }, 404);
  const { s3_key, ...job } = rows[0];
  if (job.status === "processing") {
    const live = await exportQueue.getJob(job.id);
    return c.json({ ...job, progress: live?.progress ?? 0 });
  }
  if (job.status === "completed") {
    return c.json({ ...job, progress: 100, downloadUrl: await signedUrl(s3_key) });
  }
  return c.json(job);
});
```

## Real-World Example

Lena's team ships the queue behind the existing API. A support agent exports every employee row for a 300,000-person customer: the request returns in milliseconds with a job ID, the dashboard polls the status endpoint, and when it flips to `completed` the response carries a signed URL. A second customer asking for `GET /exports/<other tenant's id>` gets a `404`.

Measured on a laptop with PostgreSQL 16 and 300,000 seeded rows (three columns, local disk, no S3): the CSV was written in about 1 second and the XLSX in about 1.3 seconds, with peak process memory around 300 to 350MB including the Node runtime and the loaded libraries. A column outside the allow-list is rejected before any query runs, and rows of other accounts never appear. Your times will differ with row width, network and S3 upload speed.

## Related Skills

- [typescript](/skills/typescript), [bull-mq](/skills/bull-mq), [postgresql](/skills/postgresql)
- [redis](/skills/redis), [hono](/skills/hono), [zod](/skills/zod)
