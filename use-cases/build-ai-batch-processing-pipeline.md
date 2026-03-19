---
title: "Build a High-Throughput AI Batch Processing Pipeline"
description: "Process 100k+ documents overnight with a queue-based AI pipeline using Redis Bull, parallel workers, rate limiting, and dead letter queues."
skills: [anthropic-sdk, redis, prisma]
difficulty: advanced
time_estimate: "6 hours"
tags: [batch-processing, redis, bull, queue, parallel, rate-limiting, prisma, anthropic, workers]
---

# Build a High-Throughput AI Batch Processing Pipeline

> **Persona:** Your startup just won a due diligence contract: analyze 100,000 contracts by Monday morning. Each contract needs clause extraction, risk scoring, and a summary. Your team has 48 hours and a $2k API budget. Manual review isn't possible — this is an AI pipeline problem.

The challenge isn't one document. It's orchestrating tens of thousands while respecting rate limits, handling failures gracefully, and tracking progress in real time.

## Architecture

```
Contracts (S3/disk)
    ↓ enqueue
Redis Bull Queue → Worker Pool (N parallel)
                        ↓ per worker
                   fetch doc → call Claude → parse result
                        ↓ on error
                   retry (3x) → dead letter queue
                        ↓ success
                   save to Postgres (Prisma)
                        ↓
                   Progress Dashboard (SSE/WebSocket)
```

## Setup

```bash
npm install bullmq ioredis @anthropic-ai/sdk @prisma/client prisma
npx prisma init
```

## Prisma Schema

```prisma
model Contract {
  id          String   @id @default(cuid())
  filename    String   @unique
  rawText     String
  status      JobStatus @default(PENDING)
  summary     String?
  riskScore   Float?
  clauses     Json?
  error       String?
  processedAt DateTime?
  createdAt   DateTime @default(now())
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  DEAD_LETTER
}
```

## Queue Setup

```typescript
// queue/setup.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// Main processing queue
export const contractQueue = new Queue('contract-analysis', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false, // Keep failed jobs for dead letter
  },
});

// Dead letter queue for permanently failed jobs
export const deadLetterQueue = new Queue('contract-dlq', { connection });

export const queueEvents = new QueueEvents('contract-analysis', { connection });
```

## Enqueue Jobs

```typescript
// queue/enqueue.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function enqueueContracts(filePaths: string[]) {
  console.log(`Enqueuing ${filePaths.length} contracts...`);

  // Batch create DB records
  await prisma.contract.createMany({
    data: filePaths.map(fp => ({
      filename: path.basename(fp),
      rawText: '', // Will be populated by worker
      status: 'PENDING',
    })),
    skipDuplicates: true,
  });

  // Add to queue in batches
  const BATCH_SIZE = 500;
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    await contractQueue.addBulk(
      batch.map(fp => ({
        name: 'analyze-contract',
        data: { filePath: fp, contractId: path.basename(fp) },
      }))
    );
    console.log(`Enqueued ${Math.min(i + BATCH_SIZE, filePaths.length)}/${filePaths.length}`);
  }
}
```

## Worker with Rate Limiting

```typescript
// workers/analyzer.ts
import Anthropic from '@anthropic-ai/sdk';
import { Worker, Job } from 'bullmq';
import Bottleneck from 'bottleneck';

const client = new Anthropic();

// Rate limiter: Claude Sonnet allows 50 req/min — spread across workers
// If running 5 workers, each gets 10 req/min
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || '5');
const limiter = new Bottleneck({
  reservoir: 50 / WORKER_COUNT,
  reservoirRefreshAmount: 50 / WORKER_COUNT,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
  maxConcurrent: 1,
  minTime: (60 * 1000) / (50 / WORKER_COUNT),
});

async function analyzeContract(job: Job) {
  const { filePath, contractId } = job.data;

  // Update status
  await prisma.contract.update({
    where: { filename: contractId },
    data: { status: 'PROCESSING' },
  });

  // Read document
  const text = await fs.readFile(filePath, 'utf-8');

  // Rate-limited Claude call
  const response = await limiter.schedule(() =>
    client.messages.create({
      model: 'claude-haiku-4-5', // Use Haiku for cost efficiency at scale
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this contract and return JSON:
{
  "summary": "2-3 sentence summary",
  "riskScore": 0-10,
  "clauses": {
    "termination": "...",
    "liability": "...",
    "payment": "..."
  }
}

CONTRACT:
${text.slice(0, 6000)}` // Truncate to fit context
      }]
    })
  );

  const result = JSON.parse(
    response.content[0].type === 'text' ? response.content[0].text : '{}'
  );

  // Save results
  await prisma.contract.update({
    where: { filename: contractId },
    data: {
      rawText: text,
      status: 'COMPLETED',
      summary: result.summary,
      riskScore: result.riskScore,
      clauses: result.clauses,
      processedAt: new Date(),
    },
  });

  // Report progress
  await job.updateProgress(100);
  return result;
}

// Create N workers
export function startWorkers(count: number) {
  const workers: Worker[] = [];

  for (let i = 0; i < count; i++) {
    const worker = new Worker('contract-analysis', analyzeContract, {
      connection,
      concurrency: 1, // Each worker processes one at a time
    });

    worker.on('failed', async (job, err) => {
      if (job && job.attemptsMade >= job.opts.attempts!) {
        // Move to dead letter queue
        await deadLetterQueue.add('failed-contract', {
          ...job.data,
          error: err.message,
          failedAt: new Date().toISOString(),
        });
        await prisma.contract.update({
          where: { filename: job.data.contractId },
          data: { status: 'DEAD_LETTER', error: err.message },
        });
      }
    });

    workers.push(worker);
    console.log(`Worker ${i + 1} started`);
  }

  return workers;
}
```

## Progress Dashboard

```typescript
// dashboard/progress.ts
import express from 'express';

const app = express();

app.get('/progress', async (req, res) => {
  const [waiting, active, completed, failed] = await Promise.all([
    contractQueue.getWaitingCount(),
    contractQueue.getActiveCount(),
    contractQueue.getCompletedCount(),
    contractQueue.getFailedCount(),
  ]);

  const total = waiting + active + completed + failed;
  const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';

  // Estimate time remaining
  const processedPerMin = await getProcessingRate();
  const eta = processedPerMin > 0 ? Math.ceil(waiting / processedPerMin) : null;

  res.json({
    total, waiting, active, completed, failed,
    percentComplete: pct,
    etaMinutes: eta,
    etaFormatted: eta ? `${Math.floor(eta / 60)}h ${eta % 60}m` : 'calculating...',
  });
});

// SSE endpoint for real-time updates
app.get('/progress/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const interval = setInterval(async () => {
    const stats = await getProgressStats();
    res.write(`data: ${JSON.stringify(stats)}\n\n`);
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

app.listen(3001, () => console.log('Dashboard: http://localhost:3001/progress'));
```

## Run the Pipeline

```typescript
// main.ts
import glob from 'glob';

const contracts = glob.sync('./contracts/**/*.pdf');
console.log(`Found ${contracts.length} contracts`);

// Enqueue all jobs
await enqueueContracts(contracts);

// Start worker pool
const workers = startWorkers(parseInt(process.env.WORKER_COUNT || '5'));

console.log(`
🚀 Pipeline started
===================
Documents:  ${contracts.length}
Workers:    ${workers.length}
Rate limit: 50 req/min (shared)
Est. time:  ~${Math.ceil(contracts.length / 50)} minutes

Dashboard: http://localhost:3001/progress
`);

// Wait for completion
await queueEvents.waitUntilReady();
```

## What to Build Next

- **Cost tracking:** Sum tokens per job, alert when budget threshold hit
- **Priority queue:** Fast-track urgent contracts with higher BullMQ priority
- **Resumable pipeline:** On restart, skip already-completed contracts
- **Export:** Auto-generate Excel report when all jobs complete
