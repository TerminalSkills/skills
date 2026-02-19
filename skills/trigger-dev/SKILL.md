---
name: trigger-dev
description: >-
  Build reliable background jobs with Trigger.dev. Use when a user asks to run
  long-running tasks in the background, process webhooks reliably, build async
  job queues for serverless, schedule recurring tasks, run AI/LLM pipelines in
  the background, process file uploads asynchronously, or replace BullMQ or
  Celery with a serverless-native solution. Covers task definition, triggers,
  scheduling, retries, concurrency control, and integration with Next.js,
  Remix, and Express.
license: Apache-2.0
compatibility: 'Node.js 18+ (any deployment platform)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - trigger-dev
    - background-jobs
    - tasks
    - queues
    - serverless
    - async
---

# Trigger.dev

## Overview

Trigger.dev v3 is a platform for running long-running background tasks from serverless environments. Traditional serverless has timeout limits (Vercel: 60s, Lambda: 15min), but many tasks — AI inference, video processing, large data imports — take longer. Trigger.dev runs your tasks on managed infrastructure with no timeout limits, built-in retries, and full observability. Define tasks in your codebase, trigger them from API routes, and they run reliably in the background.

## Instructions

### Step 1: Setup

```bash
# Initialize in existing project
npx trigger.dev@latest init

# Install SDK
npm install @trigger.dev/sdk

# Login
npx trigger.dev@latest login

# Dev mode (watches for changes, connects to Trigger.dev)
npx trigger.dev@latest dev
```

### Step 2: Define Tasks

```typescript
// trigger/tasks/process-upload.ts — Background task for file processing
import { task } from '@trigger.dev/sdk/v3'
import sharp from 'sharp'

export const processUpload = task({
  id: 'process-upload',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000 },
  run: async (payload: { fileUrl: string; userId: string }) => {
    /**
     * Process an uploaded image: generate thumbnails, optimize, update database.
     * Runs in the background with no timeout — safe for large files.
     *
     * Args (via payload):
     *   fileUrl: URL of the uploaded file in S3/MinIO
     *   userId: ID of the user who uploaded the file
     */
    // Download original
    const response = await fetch(payload.fileUrl)
    const buffer = Buffer.from(await response.arrayBuffer())

    // Generate variants
    const thumbnail = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp().toBuffer()
    const medium = await sharp(buffer).resize(800).webp({ quality: 80 }).toBuffer()
    const large = await sharp(buffer).resize(1920).webp({ quality: 85 }).toBuffer()

    // Upload variants to storage
    await Promise.all([
      uploadToS3(`thumbs/${payload.userId}/thumb.webp`, thumbnail),
      uploadToS3(`images/${payload.userId}/medium.webp`, medium),
      uploadToS3(`images/${payload.userId}/large.webp`, large),
    ])

    // Update database
    await db.update('uploads', {
      userId: payload.userId,
      status: 'processed',
      variants: { thumbnail: 'thumb.webp', medium: 'medium.webp', large: 'large.webp' },
    })

    return { processed: true, variants: 3 }
  },
})
```

### Step 3: Trigger Tasks

```typescript
// app/api/upload/route.ts — Trigger background processing from an API route
import { processUpload } from '@/trigger/tasks/process-upload'

export async function POST(req: Request) {
  const { fileUrl, userId } = await req.json()

  // Trigger returns immediately — task runs in the background
  const handle = await processUpload.trigger({ fileUrl, userId })

  return Response.json({
    message: 'Upload received, processing in background',
    taskId: handle.id,    // use this to check status later
  })
}

// Check task status
import { runs } from '@trigger.dev/sdk/v3'

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get('id')
  const run = await runs.retrieve(taskId!)

  return Response.json({
    status: run.status,        // QUEUED, EXECUTING, COMPLETED, FAILED
    output: run.output,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  })
}
```

### Step 4: Scheduled Tasks

```typescript
// trigger/tasks/daily-cleanup.ts — Recurring scheduled tasks
import { schedules } from '@trigger.dev/sdk/v3'

export const dailyCleanup = schedules.task({
  id: 'daily-cleanup',
  cron: '0 3 * * *',    // 3 AM daily
  run: async () => {
    // Delete expired sessions
    const deleted = await db.query('DELETE FROM sessions WHERE expires_at < now()')
    
    // Clean up orphaned uploads (older than 24h, not linked to any record)
    const orphans = await db.query(`
      DELETE FROM uploads
      WHERE created_at < now() - interval '24 hours'
      AND id NOT IN (SELECT upload_id FROM posts WHERE upload_id IS NOT NULL)
    `)

    return { deletedSessions: deleted.rowCount, orphanedFiles: orphans.rowCount }
  },
})
```

### Step 5: Batch Processing and Subtasks

```typescript
// trigger/tasks/import-csv.ts — Process large CSV files with subtasks
import { task } from '@trigger.dev/sdk/v3'
import { parse } from 'csv-parse/sync'

export const importCsv = task({
  id: 'import-csv',
  run: async (payload: { fileUrl: string; batchSize: number }) => {
    const response = await fetch(payload.fileUrl)
    const csvText = await response.text()
    const records = parse(csvText, { columns: true })

    // Process in batches
    const batchSize = payload.batchSize || 100
    let processed = 0

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)

      // Each batch insert is a checkpoint — if we fail here,
      // we know exactly where to resume
      await db.batchInsert('contacts', batch)
      processed += batch.length

      console.log(`Processed ${processed}/${records.length}`)
    }

    return { totalRecords: records.length, processed }
  },
})
```

### Step 6: AI/LLM Pipeline Tasks

```typescript
// trigger/tasks/generate-embeddings.ts — Long-running AI task
import { task } from '@trigger.dev/sdk/v3'

export const generateEmbeddings = task({
  id: 'generate-embeddings',
  retry: { maxAttempts: 2 },
  machine: { preset: 'medium-1x' },    // more CPU/memory for AI workloads
  run: async (payload: { documents: Array<{ id: string; text: string }> }) => {
    const results = []

    for (const doc of payload.documents) {
      // Call embedding API (no timeout concerns — runs as long as needed)
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: doc.text, model: 'text-embedding-3-small' }),
      })

      const { data } = await response.json()
      const embedding = data[0].embedding

      // Store in vector database
      await vectorDb.upsert({ id: doc.id, values: embedding, metadata: { text: doc.text } })
      results.push(doc.id)
    }

    return { embedded: results.length }
  },
})
```

## Examples

### Example 1: Process file uploads in the background
**User prompt:** "Users upload CSV files (up to 100MB) to our Next.js app on Vercel. We need to parse them and import into the database, but Vercel has a 60-second timeout."

The agent will:
1. Accept the upload in the API route, store in S3.
2. Trigger a Trigger.dev task with the file URL.
3. The task downloads, parses, and batch-inserts records with no timeout.
4. Return a task ID to the frontend for polling progress.

### Example 2: Build an AI document processing pipeline
**User prompt:** "When a user uploads a PDF, extract the text, generate embeddings, summarize it, and store everything. This takes 2-3 minutes per document."

The agent will:
1. Create a task that chains: PDF extraction → text chunking → embedding generation → summarization → database storage.
2. Each step logs progress, and the task retries on transient failures.
3. The API route triggers the task and returns immediately.

## Guidelines

- Use Trigger.dev when your tasks exceed serverless timeout limits (Vercel: 60s, Lambda: 15min). For tasks under 10 seconds, inline execution in your API route is simpler.
- Define tasks in a `trigger/` directory and import them where needed. Tasks are regular TypeScript files that run in Trigger.dev's managed environment.
- Use `retry` configuration for tasks that call external APIs — transient failures are common with third-party services.
- Set `concurrency` limits on tasks that hit rate-limited APIs to avoid 429 errors.
- Trigger.dev Cloud runs tasks on managed infrastructure. Self-hosting is available for data sovereignty requirements.
- The `trigger` call returns immediately with a handle — use it to poll status from the frontend if you need progress updates.
