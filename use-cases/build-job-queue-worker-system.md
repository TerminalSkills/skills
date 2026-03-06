---
title: "Build a Job Queue and Background Worker System"
slug: build-job-queue-worker-system
description: "Set up a production-grade background job processing system with priorities, retries, scheduled tasks, and progress tracking to handle async workloads at scale."
skills: [job-queue, docker-helper, batch-processor]
category: development
tags: [job-queue, background-workers, async, redis, backend, job-queue, scaling]
---

# Build a Job Queue and Background Worker System

## The Problem

David's team at a 35-person document management SaaS is drowning in synchronous processing. When a customer uploads a 500-page PDF for OCR, the HTTP request hangs for 4.2 minutes while the server extracts text. Bulk emails to 5,000 users tie up a web worker for 12 minutes. CSV exports with 50K rows cause 67-second response times. During business hours, these long-running operations exhaust all 8 available connections and the entire application becomes unresponsive.

The breaking point came on a Tuesday. Marketing queued a blast to 12,000 users at 9 AM. The server started processing emails synchronously in the request handler, consuming all worker threads. New user signups failed. Existing users could not log in. The email job itself crashed halfway through when the server ran out of memory. 6,400 emails went undelivered, support received 47 tickets about login failures, and the CEO got pinged by frustrated enterprise customers who could not access their documents.

The team's response so far: throw hardware at it. They upgraded from 2 CPU cores ($89/month) to 8 cores ($340/month), but long-running processes still block short ones. The application feels sluggish, customer satisfaction is dropping, and server costs have grown 4x while handling the same number of users.

## The Solution

Using the **job-queue**, **docker-helper**, and **batch-processor** skills, the agent builds a BullMQ-based background processing system where web requests enqueue work and return immediately with a job ID, dedicated workers process jobs asynchronously with progress tracking, and failed jobs retry automatically without impacting user experience. The architecture separates "accepting work" from "doing work" so that a 500-page PDF never blocks a login request again.

## Step-by-Step Walkthrough

### Step 1: Set Up Queue Infrastructure

```text
Create a BullMQ job queue system for my Node.js Express API. I need to handle 4 types of background jobs: PDF OCR processing (CPU-intensive, can take 5-8 minutes), bulk email sending (I/O bound, rate-limited to 100/minute by our provider), CSV data export (memory-intensive, up to 100K rows), and document thumbnail generation (CPU-bound, batched). Set up Redis with Docker and create typed job definitions.
```

The infrastructure starts with Redis for job persistence and four typed queues, each configured for its workload:

```yaml
# docker-helper.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]
    command: redis-server --appendonly yes --maxmemory 512mb

  redis-commander:
    image: rediscommander/redis-commander:latest
    ports: ["8081:8081"]  # Queue monitoring UI
```

Job type definitions in `src/jobs/types.ts`:

```typescript
interface PDFOCRJob {
  fileId: string;
  pages: number;
  priority: "high" | "normal";
}

interface EmailBatchJob {
  userIds: string[];
  templateId: string;
  scheduleAt?: Date;
}

interface CSVExportJob {
  queryParams: object;
  format: "csv" | "xlsx";
  userId: string;
}

interface ThumbnailJob {
  documentIds: string[];
  sizes: [150, 300, 600];
}
```

Each queue gets tuned for its workload characteristics:

| Queue | Retries | Timeout | Concurrency | Constraint |
|-------|---------|---------|-------------|------------|
| `pdf-processing` | 2 | 600s | 2 | CPU-bound |
| `email-sender` | 3 | -- | 5 | Rate limited: 100/min |
| `csv-export` | 1 | 300s | 1 | Memory protection |
| `thumbnails` | 2 | 60s | 4 | I/O-bound, parallelizable |

### Step 2: Implement Workers with Concurrency Controls

```text
Create background workers for each queue type. PDF worker should process 2 jobs simultaneously (CPU-bound), email worker should respect our provider's 100/minute rate limit, CSV worker should run 1 at a time to avoid memory spikes, thumbnail worker can handle 4 concurrent jobs. All workers need graceful shutdown, progress tracking, and detailed error logging.
```

Each worker is built for its specific constraints:

**PDF Worker** (`src/workers/pdf-worker.ts`) -- processes pages in batches of 10 to avoid OOM. Progress tracks through stages: file upload (10%), OCR processing (20-90%), text extraction (95%), completion (100%). Failed pages retry individually so one corrupted page does not kill the whole document.

**Email Worker** (`src/workers/email-worker.ts`) -- respects the provider's 100/minute rate limit with 5 parallel SMTP connections. Processes users in groups of 50 per job. Individual email failures (bad address, bounce) do not fail the entire batch -- they get logged with success/bounce tracking.

**CSV Export Worker** (`src/workers/csv-export-worker.ts`) -- runs one job at a time to prevent memory competition. Streams records in 1,000-row chunks with a 256MB ceiling per export. Supports both CSV and Excel formats.

**Thumbnail Worker** (`src/workers/thumbnail-worker.ts`) -- processes 4 documents concurrently since the work is I/O-bound. Generates all size variants for each document in a single job and checks for existing thumbnails before regenerating.

All workers share a common management layer with graceful SIGTERM/SIGINT shutdown, a `/workers/health` endpoint, metrics collection (processed, failed, active counts), and automatic reconnection on Redis connection loss.

### Step 3: Add Scheduling and Progress Tracking

```text
Add recurring job scheduling for maintenance tasks: daily email digest at 8 AM UTC, weekly analytics report generation every Monday at 6 AM, monthly data cleanup at midnight on the 1st. Also create REST endpoints so the frontend can poll job status and show progress bars to users.
```

Recurring jobs in `src/jobs/scheduled.ts`:

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 8 * * *` | Daily digest | Email batch for active users |
| `0 6 * * 1` | Weekly analytics | CSV export of dashboard metrics |
| `0 0 1 * *` | Monthly cleanup | Batch delete expired temp files |
| `0 2 * * *` | Thumbnail maintenance | Regenerate missing thumbnails |

The progress tracking API lets the frontend show real-time status:

```typescript
// POST /api/jobs/pdf-ocr
// Body: { "file_id": "doc123", "priority": "high" }
// Response: { "job_id": "pdf-ocr-abc123", "estimated_duration": "4-6 minutes" }

// GET /api/jobs/:jobId/status
// Response:
{
  "id": "pdf-ocr-abc123",
  "status": "active",
  "progress": 67,
  "data": { "pages_processed": 134, "total_pages": 200 },
  "created_at": "2026-02-17T10:30:00Z",
  "started_at": "2026-02-17T10:30:15Z",
  "estimated_completion": "2026-02-17T10:35:30Z"
}
```

Instead of a frozen browser tab, users see progress bars: "Processing page 134 of 200 (67%)" for PDF uploads, "Sending... 1,247 of 5,000 emails sent" for campaigns, "Generating report... 23,456 of 94,332 records" for exports. Optional WebSocket support provides real-time updates without polling.

### Step 4: Add Monitoring and Failure Alerting

```text
Set up Bull Board dashboard for queue monitoring and create automated alerting. I want to know when queues back up beyond normal levels, when workers are failing repeatedly, or when job processing times exceed expected thresholds.
```

Bull Board mounts at `/admin/queues` (behind basic auth) with real-time queue status, worker throughput, error rates, and a job browser for searching, retrying, or deleting individual jobs.

**Queue health alerts (Slack):**
- Queue backlog exceeds 100 jobs for 10+ minutes
- Any queue with failure rate above 5% over 1 hour
- Worker offline for 5+ minutes -- page on-call engineer
- Redis memory above 80%

**Performance alerts:**
- PDF OCR jobs exceeding 10 minutes (normal: 4-6 min)
- Email sending below 80 emails/minute
- CSV export jobs timing out
- Thumbnail generation exceeding 2 minutes per document

**Weekly automated report to Slack:**

| Queue | Jobs | Success Rate | Avg Duration |
|-------|------|-------------|-------------|
| PDF Processing | 1,247 | 99.2% | 4.1 min |
| Email Campaigns | 94,332 emails | 97.8% delivery | -- |
| CSV Exports | 134 | 100% | 1.3 min |
| Thumbnails | 5,623 | 99.9% | 12 sec |

## Real-World Example

David's document management startup was losing customers. The main workflow -- uploading PDFs for OCR -- froze the browser for 3-8 minutes while the server processed synchronously. During peak hours, when multiple customers uploaded large files, the entire application became unresponsive.

The breaking point: their largest customer sent an escalation during a board meeting when the platform crashed mid-upload. Three customers churned that week citing "unreliable service." The CTO used the job-queue skill to redesign the architecture. Within a week, PDF uploads returned instantly with a job ID. Users saw real-time progress bars instead of frozen browser tabs. Background workers handled OCR without blocking web requests. Failed jobs retried automatically.

Results after 30 days: customer complaints about slow uploads dropped from 23 per week to zero. Average page load time went from 4.2 seconds to 0.6 seconds. Server utilization dropped from 87% peak to 34% peak because async processing smoothed the load. Infrastructure costs actually decreased from $340/month to $180/month -- fewer web servers needed once background workers absorbed the heavy lifting. The largest customer renewed their annual contract and upgraded to the enterprise tier.
