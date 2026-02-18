---
title: "Build a Job Queue and Background Worker System"
slug: build-job-queue-worker-system
description: "Set up a production-grade background job processing system with priorities, retries, scheduled tasks, and progress tracking to handle async workloads at scale."
skills: [job-queue, docker-helper, batch-processor]
category: development
tags: [job-queue, background-workers, async, redis, backend, bullmq, scaling]
---

# Build a Job Queue and Background Worker System

## The Problem

David's team at a 35-person document management SaaS is drowning in synchronous processing. When customers upload a 500-page PDF for OCR processing, the HTTP request hangs for 4.2 minutes while the server extracts text. A bulk email to 5,000 users takes 12 minutes and ties up a web worker the entire time. CSV exports with 50K rows cause 67-second response times. When traffic spikes during business hours, these long-running operations exhaust all 8 available connections, causing the entire application to become unresponsive.

The breaking point: last Tuesday's product launch email crashed the server. Marketing queued a blast to 12,000 users at 9 AM. The server started processing emails synchronously in the request handler, consuming all worker threads. New user signups failed, existing users couldn't log in, and the email job itself crashed halfway through when the server ran out of memory. 6,400 emails went undelivered, customer support received 47 tickets about login failures, and the CEO got pinged by frustrated enterprise customers who couldn't access their documents.

The team's solution so far: throw hardware at it. They upgraded from 2 CPU cores ($89/month) to 8 cores ($340/month), but long-running processes still block short ones. PDF processing can take up to 8 minutes for complex documents, during which other users see loading spinners. The application feels sluggish, customer satisfaction is dropping, and the server costs have grown 4x while handling the same number of users.

## The Solution

Use **job-queue** to build a BullMQ-based background processing system with typed jobs, priority handling, and retry logic. Use **docker-helper** to set up Redis infrastructure and **batch-processor** for high-volume operations. The pattern: web requests enqueue work immediately and return job IDs, dedicated workers process jobs asynchronously with progress tracking, and failed jobs retry automatically without impacting user experience.

## Step-by-Step Walkthrough

### 1. Set up queue infrastructure with Redis and job types

```text
Create a BullMQ job queue system for my Node.js Express API. I need to handle 4 types of background jobs: PDF OCR processing (CPU-intensive, can take 5-8 minutes), bulk email sending (I/O bound, rate-limited to 100/minute by our provider), CSV data export (memory-intensive, up to 100K rows), and document thumbnail generation (CPU-bound, batched). Set up Redis with Docker and create typed job definitions.
```

```text
🚀 CREATING JOB QUEUE INFRASTRUCTURE...

Created docker-compose.yml:
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]
    command: redis-server --appendonly yes --maxmemory 512mb

  redis-commander:
    image: rediscommander/redis-commander:latest
    ports: ["8081:8081"]  # Queue monitoring UI

Generated job type definitions:
src/jobs/types.ts
├── PDFOCRJob: { fileId: string, pages: number, priority: 'high'|'normal' }
├── EmailBatchJob: { userIds: string[], templateId: string, scheduleAt?: Date }
├── CSVExportJob: { queryParams: object, format: 'csv'|'xlsx', userId: string }
└── ThumbnailJob: { documentIds: string[], sizes: [150, 300, 600] }

Created 4 optimized queues:
- 'pdf-processing': retry 2×, timeout 600s, concurrency 2
- 'email-sender': retry 3×, rate limit 100/min, concurrency 5  
- 'csv-export': retry 1×, timeout 300s, concurrency 1 (memory protection)
- 'thumbnails': retry 2×, timeout 60s, concurrency 4

✅ Redis cluster ready, job types defined, queues configured
```

### 2. Implement workers with proper concurrency and error handling

```text
Create background workers for each queue type. PDF worker should process 2 jobs simultaneously (CPU-bound), email worker should respect our provider's 100/minute rate limit, CSV worker should run 1 at a time to avoid memory spikes, thumbnail worker can handle 4 concurrent jobs. All workers need graceful shutdown, progress tracking, and detailed error logging.
```

```text
📋 IMPLEMENTING BACKGROUND WORKERS...

Created src/workers/pdf-worker.ts:
- Concurrency: 2 jobs (CPU cores available)  
- Progress tracking: file upload (10%), OCR processing (20-90%), text extraction (95%), completion (100%)
- Error handling: Retry failed pages individually, skip corrupted pages with warnings
- Memory management: Process pages in batches of 10 to avoid OOM

Created src/workers/email-worker.ts:  
- Rate limiting: 100 emails/minute (provider SLA)
- Concurrency: 5 parallel connections to SMTP
- Batch processing: Groups of 50 users per job
- Error handling: Individual email failures don't fail entire batch
- Progress: emails sent / total emails with success/bounce tracking

Created src/workers/csv-export-worker.ts:
- Concurrency: 1 (prevents memory competition)  
- Streaming: Processes records in 1000-row chunks
- Progress: rows processed / total estimated rows
- Memory limit: 256MB max per export job
- Formats: CSV, Excel (.xlsx) with formula support

Created src/workers/thumbnail-worker.ts:
- Concurrency: 4 (I/O bound, can parallelize)
- Batch optimization: Processes multiple sizes per document in single job
- Caching: Checks if thumbnails exist before regenerating
- Progress: documents processed × sizes generated

Worker management (src/workers/index.ts):
✅ Graceful shutdown handler (SIGTERM/SIGINT)
✅ Health check endpoint (/workers/health)
✅ Worker metrics collection (processed, failed, active jobs)
✅ Automatic restart on Redis connection loss
```

### 3. Add job scheduling and progress tracking APIs

```text
Add recurring job scheduling for maintenance tasks: daily email digest at 8 AM UTC, weekly analytics report generation every Monday at 6 AM, monthly data cleanup at midnight on the 1st. Also create REST endpoints so the frontend can poll job status and show progress bars to users.
```

```text
⏰ SCHEDULING & PROGRESS TRACKING SETUP...

Added recurring jobs to src/jobs/scheduled.ts:
- Daily digest: cron('0 8 * * *') → EmailBatchJob for active users
- Weekly analytics: cron('0 6 * * 1') → CSVExportJob for dashboard metrics  
- Monthly cleanup: cron('0 0 1 * *') → batch delete expired temp files
- Thumbnail maintenance: cron('0 2 * * *') → regenerate missing thumbnails

Created REST API endpoints (src/routes/jobs.ts):
GET /api/jobs/:jobId/status
{
  "id": "pdf-ocr-abc123",
  "status": "active",
  "progress": 67,
  "data": { "pages_processed": 134, "total_pages": 200 },
  "created_at": "2024-02-17T10:30:00Z",
  "started_at": "2024-02-17T10:30:15Z",
  "estimated_completion": "2024-02-17T10:35:30Z"
}

POST /api/jobs/pdf-ocr
Body: { "file_id": "doc123", "priority": "high" }
Response: { "job_id": "pdf-ocr-abc123", "estimated_duration": "4-6 minutes" }

Frontend integration examples:
- PDF upload: Shows progress bar "Processing page 67 of 200 (33%)"
- Email campaign: "Sending... 1,247 of 5,000 emails sent (25%)"  
- CSV export: "Generating report... 23,456 of 94,332 records (25%)"

✅ Real-time progress updates via WebSocket (optional)
✅ Job history and logs accessible via admin panel
✅ Automatic job cleanup after 7 days (configurable)
```

### 4. Add monitoring dashboard and failure alerting

```text
Set up Bull Board dashboard for queue monitoring and create automated alerting. I want to know when queues back up beyond normal levels, when workers are failing repeatedly, or when job processing times exceed expected thresholds.
```

```text
📊 MONITORING & ALERTING DASHBOARD...

Installed Bull Board at /admin/queues (basic auth protected):
- Real-time queue status: active, waiting, completed, failed jobs
- Worker performance: throughput, avg processing time, error rates
- Queue health: memory usage, Redis connection status, worker uptime
- Job browser: search, retry, delete individual jobs
- Performance graphs: jobs/hour, success rates, processing time trends

Created intelligent alerting (src/monitoring/alerts.ts):

🚨 QUEUE HEALTH ALERTS:
- Queue backlog >100 jobs for >10 minutes → Slack #engineering
- Any queue with >5% failure rate over 1 hour → Urgent alert
- Worker offline for >5 minutes → Page on-call engineer
- Redis memory >80% → Scale Redis or clear completed jobs

🚨 PERFORMANCE ALERTS:  
- PDF OCR jobs taking >10 minutes (normally 4-6min) → Investigate server load
- Email sending <80 emails/minute → Check SMTP provider status
- CSV export jobs timing out → Memory pressure or database slow query
- Thumbnail generation >2 minutes per document → Image processing issue

📈 WEEKLY REPORTS (automated Slack post):
Queue Performance Summary - Week ending Feb 17, 2024
├── PDF Processing: 1,247 jobs, 99.2% success, avg 4.1min
├── Email Campaigns: 8 campaigns, 94,332 emails, 97.8% delivery  
├── CSV Exports: 134 reports, 100% success, avg 1.3min
├── Thumbnails: 5,623 images, 99.9% success, avg 12sec
└── Cost savings: $280/mo (avoid scaling web servers for background work)

ANOMALY DETECTION:
✅ Automatic detection of unusual job patterns
✅ Alert fatigue prevention (similar alerts grouped)
✅ Integration with existing monitoring (Datadog, New Relic, etc.)
```

## Real-World Example

A document management startup was losing customers due to poor user experience. Their main workflow — uploading PDFs for OCR processing — would freeze the browser for 3-8 minutes while the server processed documents synchronously. During peak hours (9-11 AM), when multiple customers uploaded large files, the entire application would become unresponsive.

The CEO received an escalation email from their largest customer: "Your platform crashed during our board meeting when we tried to upload quarterly reports. We're evaluating alternatives." That same day, 3 customers churned, citing "unreliable service" in their exit interviews.

The CTO used the job-queue skill to redesign their architecture. Within a week, they had:

1. **Immediate response times**: PDF uploads now return instantly with a job ID
2. **Progress tracking**: Users see real-time progress: "Processing page 47 of 156 (30%)"
3. **Background processing**: OCR happens asynchronously without blocking other users
4. **Failure recovery**: If a job fails, it retries automatically without user intervention
5. **Better resource utilization**: 2 background workers handle OCR while web servers stay responsive

Results after 30 days:
- Customer complaints about slow uploads: 23/week → 0/week  
- Average page load time: 4.2s → 0.6s (background jobs don't block requests)
- Server utilization: 87% peak → 34% peak (async processing smooths load)
- Customer satisfaction: 6.2/10 → 8.7/10 (measured monthly)
- Infrastructure costs: $340/month → $180/month (scaled back web servers, added background workers)

The largest customer renewed their annual contract and upgraded to the enterprise tier. Two churned customers returned after hearing about the improved experience from mutual connections.
