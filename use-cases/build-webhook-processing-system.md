---
title: "Build a Webhook Processing System with Error Monitoring"
slug: build-webhook-processing-system  
description: "Create a resilient webhook processing system that handles high-volume incoming webhooks, processes them reliably, and monitors for failures with automatic retry and alerting."
skills: [webhook-processor, batch-processor, error-monitoring]
category: development
tags: [webhooks, event-processing, reliability, monitoring, async, api-integration]
---

# Build a Webhook Processing System with Error Monitoring

## The Problem

Lisa, lead engineer at a 50-person fintech startup, faces a crisis every time their payment processor sends webhook bursts. Their system processes payment notifications, transaction updates, and dispute alerts from Stripe, but when Black Friday traffic hits, everything breaks down. Last month's disaster: 47,000 payment webhooks arrived in 3 hours during a flash sale. The server crashed after processing 12,000 events, losing 35,000 critical payment confirmations.

The current system processes webhooks synchronously in HTTP request handlers. Each webhook triggers 4-7 database queries, external API calls to update user balances, and email notifications. A single complex webhook (like a dispute with attachments) takes 8-12 seconds to process completely. When webhook volume spikes above 200/hour, the server's 6 request handlers saturate, causing a cascading failure: new webhooks timeout, payment confirmations get lost, customers don't receive purchase confirmations, and accounting reconciliation becomes impossible.

Worse: there's no visibility into failures. When a webhook fails, it's gone forever. No retry, no error tracking, no alerting. The team discovers missing payments during monthly reconciliation — sometimes 6 weeks later. Last quarter, they manually recovered $47,000 in lost transactions that never got processed due to webhook failures. The payment processor doesn't guarantee delivery, so dropped webhooks mean lost revenue unless caught immediately.

## The Solution

Build a resilient webhook processing system using **webhook-processor** for reliable ingestion and processing, **batch-processor** for handling high-volume bursts efficiently, and **error-monitoring** for comprehensive failure tracking and automated recovery. The approach: quickly ingest all webhooks into a queue, process them asynchronously with automatic retries, and monitor every step with alerting and recovery mechanisms.

```bash
npx terminal-skills install webhook-processor batch-processor error-monitoring
```

## Step-by-Step Walkthrough

### 1. Set up reliable webhook ingestion with immediate acknowledgment

```
Create a webhook processing system for Stripe events. I need to handle 5 types: payment_intent.succeeded, payment_intent.failed, charge.dispute.created, invoice.payment_succeeded, and customer.subscription.updated. Each webhook should be acknowledged immediately (200 OK) then processed asynchronously. Include signature verification, deduplication, and high-availability considerations.
```

```
🔗 WEBHOOK INGESTION SYSTEM SETUP...

Created webhook endpoints (src/routes/webhooks.ts):

POST /webhooks/stripe
├── Immediate signature verification (prevents spoofed webhooks)
├── Duplicate detection (event ID deduplication in Redis, 24h TTL)
├── Response time: <50ms (immediate 200 OK, processing queued)
├── Request logging: IP, timestamp, event type, processing status

Event type routing:
├── payment_intent.succeeded → PaymentConfirmationJob (high priority)
├── payment_intent.failed → PaymentFailureJob (high priority)  
├── charge.dispute.created → DisputeHandlingJob (urgent priority)
├── invoice.payment_succeeded → InvoiceProcessingJob (normal priority)
└── customer.subscription.updated → SubscriptionSyncJob (low priority)

Webhook infrastructure:
✅ Redis-backed job queue (BullMQ) for async processing
✅ Signature verification with webhook secret rotation support
✅ Rate limiting: 1000 requests/minute per IP (prevents abuse)
✅ Request size limits: 1MB max payload (prevents memory exhaustion)
✅ Health check endpoint: GET /webhooks/health

High-availability features:
✅ Multiple webhook URLs (primary + fallback) configured with Stripe
✅ Database connection pooling (prevents connection exhaustion)
✅ Graceful shutdown (processes in-flight requests before stopping)
✅ Horizontal scaling ready (stateless, Redis-backed)
```

### 2. Implement async processing with batch capabilities

```
Create background workers to process the queued webhook events. Payment events need individual processing with user balance updates and email notifications. For high-volume events like subscription updates, process them in batches of 50 to improve efficiency. Include proper error handling, progress tracking, and retry logic.
```

```
⚙️ ASYNC WEBHOOK PROCESSING WORKERS...

Created specialized workers:

PaymentConfirmationWorker (src/workers/payment-worker.ts):
- Concurrency: 10 jobs simultaneously
- Processing: Update user balance → Send confirmation email → Update analytics
- Average duration: 1.2 seconds per payment
- Retry policy: 3 attempts with exponential backoff (2s, 8s, 32s)
- Error handling: Failed balance updates trigger immediate Slack alerts

DisputeHandlingWorker (src/workers/dispute-worker.ts):  
- Priority: Urgent (processes immediately)
- Processing: Create dispute record → Notify finance team → Freeze related transactions
- Timeout: 30 seconds max (disputes are time-sensitive)
- Retry: 2 attempts only (manual intervention needed for persistent failures)

SubscriptionSyncWorker (src/workers/subscription-worker.ts):
- Batch processing: Groups 50 subscription updates per job
- Processing: Update user plans → Recalculate billing → Sync with analytics
- Efficiency: 50 individual API calls → 1 batch database transaction
- Memory optimization: Streams large subscription lists

Worker performance monitoring:
✅ Per-worker throughput tracking (jobs/minute)
✅ Average processing time by event type
✅ Retry rate analysis (identifies problematic event patterns)
✅ Memory and CPU usage per worker process
✅ Failed job analysis with error categorization

PROCESSING CAPACITY:
- Payment confirmations: 600 jobs/minute (10 workers × 60 jobs/hour each)
- Dispute alerts: Unlimited (urgent priority, preempts other jobs)
- Subscription updates: 1,500 subscriptions/minute in batches of 50
- Invoice processing: 300 jobs/minute
- Total system capacity: 2,400 webhook events/minute sustained
```

### 3. Add comprehensive error monitoring and alerting

```
Set up error monitoring for the webhook system. Track processing failures, identify patterns in failed webhooks, monitor system health metrics, and create intelligent alerting that escalates based on error severity. Include automated recovery for transient failures and detailed error reporting.
```

```
🔍 ERROR MONITORING & ALERTING SYSTEM...

Error tracking setup (src/monitoring/webhook-errors.ts):

FAILURE CLASSIFICATION:
├── Transient errors: Network timeouts, temporary database unavailability  
├── Data errors: Invalid webhook payload, missing required fields
├── Business logic errors: User not found, insufficient balance, duplicate processing
├── System errors: Memory exhaustion, worker crashes, Redis connection loss
└── Integration errors: External API failures (email service, analytics, etc.)

Real-time monitoring:
✅ Error rate by webhook type (payment vs subscription vs dispute)
✅ Processing time percentiles (p50, p95, p99) with alerts on regression
✅ Queue depth monitoring (alerts when backlog >1000 jobs)
✅ Worker health checks (automatic restart on failure detection)
✅ Duplicate webhook detection rate (indicates upstream issues)

AUTOMATED ALERTING RULES:

🚨 CRITICAL ALERTS (page on-call engineer):
- Payment webhook failure rate >2% for 5+ minutes
- Dispute webhooks failing (financial/legal impact)
- Webhook processing stopped completely (all workers down)
- Queue backlog >5000 jobs (system overloaded)

⚠️  WARNING ALERTS (Slack #engineering):
- Individual worker failure rate >5% over 30 minutes  
- Processing time >3x normal baseline (performance degradation)
- Redis memory >80% (queue storage issues)
- Duplicate webhook rate >1% (upstream system issues)

📊 DAILY REPORTS (automated Slack summary):
Webhook Processing Health - Feb 17, 2024
├── Total processed: 23,847 webhooks (avg 994/hour)
├── Success rate: 99.7% (99.9% target)
├── Average processing: 1.1 seconds (1.5s target)  
├── Failed events: 71 (auto-retried: 68, manual review: 3)
├── Queue backlog: 23 jobs (healthy: <100)
└── System uptime: 99.95% (1 brief Redis reconnection)

ERROR ANALYSIS DASHBOARD:
✅ Failed webhook inspector (view payload, error details, retry history)
✅ Error trend analysis (identifies systemic issues over time)  
✅ Integration health monitoring (external service reliability)
✅ Recovery recommendations (suggests fixes for common error patterns)
```

### 4. Implement automatic recovery and manual intervention tools

```
Build automated recovery mechanisms for common failure scenarios and admin tools for manual intervention when needed. Include webhook replay capabilities, failed job analysis, and emergency processing controls.
```

```
🔄 AUTOMATED RECOVERY & ADMIN TOOLS...

Automatic recovery systems:

SELF-HEALING MECHANISMS:
├── Database reconnection: Automatic retry with exponential backoff
├── Redis failover: Seamless switch to backup Redis instance  
├── Worker restart: Auto-restart crashed workers (max 3 attempts/hour)
├── Queue rebalancing: Redistribute jobs from overloaded to healthy workers
└── Circuit breaker: Temporarily disable failing external integrations

FAILED WEBHOOK RECOVERY:
- Auto-retry: 3 attempts with increasing delays (2s → 8s → 32s)
- Smart retry: Skip retry for permanent failures (invalid signature, malformed JSON)
- Exponential backoff: Prevents overwhelming struggling downstream systems
- Dead letter queue: Persistent failed jobs for manual analysis
- Batch retry: Replay multiple failed webhooks from the same time period

Admin dashboard (/admin/webhooks):

WEBHOOK MANAGEMENT:
✅ Search webhooks by date, type, status, or customer ID
✅ Replay individual failed webhooks with payload inspection
✅ Bulk retry: Reprocess webhooks from a specific time range  
✅ Emergency stop: Pause all webhook processing during incidents
✅ Queue manipulation: Move jobs between queues, adjust priorities

DIAGNOSTICS & DEBUGGING:
✅ Live webhook stream: Real-time view of incoming webhooks
✅ Processing timeline: Detailed step-by-step breakdown of webhook handling
✅ Error correlation: Group similar failures to identify systemic issues
✅ Performance profiler: Identify slow processing steps
✅ Webhook simulator: Test processing with sample payloads

OPERATIONAL CONTROLS:
✅ Worker scaling: Adjust concurrency per worker type
✅ Rate limiting: Temporarily slow processing during maintenance
✅ Failover controls: Manually switch to backup systems
✅ Maintenance mode: Gracefully drain queues before updates

RECOVERY SUCCESS METRICS:
- Auto-retry success rate: 94% (most failures are transient)
- Manual intervention required: <0.3% of all webhooks
- Mean time to recovery: 2.3 minutes (from failure to successful retry)
- Zero data loss: All webhooks eventually processed or flagged for review
```

## Real-World Example

A payment processing company was losing $15,000/month in revenue due to failed webhook processing. During high-traffic events (product launches, sales), their webhook system would crash, losing payment confirmations and leaving customers confused about order status. Their support team spent 8 hours/week manually reconciling missing payments.

The breaking point came during a flash sale that generated 15,000 orders in 2 hours. The webhook processor crashed after handling 4,000 payments, losing 11,000 payment confirmations. Customers didn't receive order confirmations, the inventory system wasn't updated, and the accounting team couldn't reconcile daily revenue. Recovery took 3 days of manual work and cost $23,000 in lost sales and overtime.

Using the webhook-processor skill, they rebuilt their system:

**Week 1 implementation:**
- Webhook ingestion now responds in 15ms (was 8+ seconds)
- All webhooks queued immediately, processed asynchronously  
- Automatic retry for failed webhooks with intelligent backoff
- Comprehensive error monitoring with real-time alerting

**Results after 60 days:**
- **Zero lost webhooks**: 99.97% processing success rate
- **Revenue recovery**: $15,000/month recovered (no more lost payments)
- **Support load**: 8 hours/week → 15 minutes/week on webhook issues
- **System reliability**: Handled Black Friday traffic (47,000 webhooks in 6 hours) without failures
- **Response time**: Webhook acknowledgment averages 22ms
- **Processing capacity**: Scaled from 200/hour → 3,000+/hour sustained

The system now processes 180,000+ webhooks monthly with zero manual intervention required. The error monitoring catches and auto-recovers from 94% of transient failures, and the admin dashboard makes the remaining 6% easy to resolve. Most importantly, customers now receive instant payment confirmations, improving satisfaction scores from 7.2/10 to 9.1/10.

## Related Skills

- [webhook-processor](../skills/webhook-processor/) — Reliable webhook ingestion, signature verification, and async processing architecture
- [batch-processor](../skills/batch-processor/) — High-volume event processing with intelligent batching and memory optimization  
- [error-monitoring](../skills/error-monitoring/) — Comprehensive failure tracking, automated recovery, and intelligent alerting systems