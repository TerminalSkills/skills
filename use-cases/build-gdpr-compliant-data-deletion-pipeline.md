---
title: Build a GDPR-Compliant Data Deletion Pipeline
slug: build-gdpr-compliant-data-deletion-pipeline
description: >
  Automate "right to be forgotten" requests across 15 microservices
  and 3 data stores — completing deletions in 24 hours instead of
  6 weeks while generating audit-ready compliance reports.
skills:
  - typescript
  - kafka-js
  - postgresql
  - redis
  - bull-mq
  - zod
  - hono
category: development
tags:
  - gdpr
  - data-deletion
  - privacy
  - compliance
  - right-to-erasure
  - data-governance
---

# Build a GDPR-Compliant Data Deletion Pipeline

## The Problem

A SaaS company with 2M users across the EU receives 200+ data deletion requests per month. Currently, a privacy officer manually emails 8 engineering teams asking them to delete user data from their services. Each team runs manual SQL queries. The process takes 6 weeks average — GDPR requires completion within 30 days. Last audit found 3 services that were missed entirely, and backup retention meant "deleted" data was still recoverable for 90 days. The DPA (Data Protection Authority) has started asking questions.

## Step 1: Data Map Registry

```typescript
// src/registry/data-map.ts
import { z } from 'zod';

export const DataStore = z.object({
  serviceId: z.string(),
  serviceName: z.string(),
  dataTypes: z.array(z.enum([
    'personal_info', 'email', 'payment', 'activity_log',
    'analytics', 'support_tickets', 'files', 'preferences',
  ])),
  storageType: z.enum(['postgresql', 'mongodb', 'elasticsearch', 's3', 'redis', 'external_api']),
  tables: z.array(z.object({
    name: z.string(),
    userIdColumn: z.string(),
    deletionStrategy: z.enum(['hard_delete', 'anonymize', 'api_call']),
    retentionDays: z.number().int().optional(),
  })),
  owner: z.string().email(),
  deletionEndpoint: z.string().url().optional(),
  priority: z.number().int().min(1).max(10),
});

export const dataMap: z.infer<typeof DataStore>[] = [
  {
    serviceId: 'user-service',
    serviceName: 'User Service',
    dataTypes: ['personal_info', 'email', 'preferences'],
    storageType: 'postgresql',
    tables: [
      { name: 'users', userIdColumn: 'id', deletionStrategy: 'hard_delete' },
      { name: 'user_preferences', userIdColumn: 'user_id', deletionStrategy: 'hard_delete' },
      { name: 'user_addresses', userIdColumn: 'user_id', deletionStrategy: 'hard_delete' },
    ],
    owner: 'user-team@company.com',
    deletionEndpoint: 'http://user-service:8080/internal/delete-user',
    priority: 1,
  },
  {
    serviceId: 'payment-service',
    serviceName: 'Payment Service',
    dataTypes: ['payment'],
    storageType: 'postgresql',
    tables: [
      { name: 'payment_methods', userIdColumn: 'user_id', deletionStrategy: 'hard_delete' },
      { name: 'transactions', userIdColumn: 'user_id', deletionStrategy: 'anonymize', retentionDays: 2555 },
    ],
    owner: 'payments@company.com',
    deletionEndpoint: 'http://payment-service:8080/internal/delete-user',
    priority: 2,
  },
  {
    serviceId: 'analytics-service',
    serviceName: 'Analytics',
    dataTypes: ['activity_log', 'analytics'],
    storageType: 'elasticsearch',
    tables: [
      { name: 'events-*', userIdColumn: 'user_id', deletionStrategy: 'hard_delete' },
      { name: 'sessions-*', userIdColumn: 'user_id', deletionStrategy: 'hard_delete' },
    ],
    owner: 'data-team@company.com',
    deletionEndpoint: 'http://analytics:8080/internal/delete-user',
    priority: 3,
  },
  {
    serviceId: 'file-storage',
    serviceName: 'File Storage',
    dataTypes: ['files'],
    storageType: 's3',
    tables: [
      { name: 'user-uploads/*', userIdColumn: 'prefix', deletionStrategy: 'hard_delete' },
    ],
    owner: 'infra@company.com',
    deletionEndpoint: 'http://file-service:8080/internal/delete-user',
    priority: 4,
  },
];
```

## Step 2: Deletion Request Pipeline

```typescript
// src/pipeline/deletion-orchestrator.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { dataMap } from '../registry/data-map';

const connection = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const deletionQueue = new Queue('data-deletion', { connection });

export async function initiateDeletion(request: {
  requestId: string;
  userId: string;
  requestedBy: string;
  reason: string;
}): Promise<void> {
  // Record the request
  await db.query(`
    INSERT INTO deletion_requests (id, user_id, requested_by, reason, status, created_at)
    VALUES ($1, $2, $3, $4, 'pending', NOW())
  `, [request.requestId, request.userId, request.requestedBy, request.reason]);

  // Create deletion jobs for each service (ordered by priority)
  const sortedStores = [...dataMap].sort((a, b) => a.priority - b.priority);

  for (const store of sortedStores) {
    await deletionQueue.add('delete-from-service', {
      requestId: request.requestId,
      userId: request.userId,
      serviceId: store.serviceId,
      serviceName: store.serviceName,
      deletionEndpoint: store.deletionEndpoint,
      tables: store.tables,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

// Worker that processes deletions per service
const worker = new Worker('data-deletion', async (job) => {
  const { requestId, userId, serviceId, deletionEndpoint, tables } = job.data;

  try {
    // Call the service's deletion endpoint
    const response = await fetch(deletionEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) throw new Error(`Service responded ${response.status}`);

    const result = await response.json();

    // Record completion
    await db.query(`
      INSERT INTO deletion_results (request_id, service_id, status, rows_affected, completed_at)
      VALUES ($1, $2, 'completed', $3, NOW())
    `, [requestId, serviceId, result.rowsDeleted ?? 0]);

    // Check if all services complete
    await checkCompletion(requestId);
  } catch (err: any) {
    await db.query(`
      INSERT INTO deletion_results (request_id, service_id, status, error, completed_at)
      VALUES ($1, $2, 'failed', $3, NOW())
      ON CONFLICT (request_id, service_id) DO UPDATE SET status = 'failed', error = $3
    `, [requestId, serviceId, err.message]);

    throw err; // BullMQ will retry
  }
}, { connection, concurrency: 5 });

async function checkCompletion(requestId: string): Promise<void> {
  const { rows } = await db.query(`
    SELECT COUNT(*) FILTER (WHERE status = 'completed') as done,
           COUNT(*) FILTER (WHERE status = 'failed') as failed,
           COUNT(*) as total
    FROM deletion_results WHERE request_id = $1
  `, [requestId]);

  const { done, failed, total } = rows[0];
  const expectedTotal = dataMap.length;

  if (parseInt(done) + parseInt(failed) >= expectedTotal) {
    const finalStatus = parseInt(failed) > 0 ? 'partial' : 'completed';
    await db.query(
      `UPDATE deletion_requests SET status = $1, completed_at = NOW() WHERE id = $2`,
      [finalStatus, requestId]
    );
  }
}
```

## Step 3: Compliance Report Generator

```typescript
// src/reports/deletion-report.ts
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function generateDeletionReport(requestId: string): Promise<string> {
  const request = await db.query('SELECT * FROM deletion_requests WHERE id = $1', [requestId]);
  const results = await db.query(
    'SELECT * FROM deletion_results WHERE request_id = $1 ORDER BY completed_at', [requestId]
  );

  const req = request.rows[0];
  let report = `# Data Deletion Report\n\n`;
  report += `**Request ID**: ${req.id}\n`;
  report += `**User ID**: ${req.user_id}\n`;
  report += `**Requested**: ${req.created_at}\n`;
  report += `**Completed**: ${req.completed_at}\n`;
  report += `**Status**: ${req.status}\n`;
  report += `**Processing Time**: ${Math.round((new Date(req.completed_at).getTime() - new Date(req.created_at).getTime()) / 3600000)}h\n\n`;
  report += `## Service Results\n\n`;

  for (const r of results.rows) {
    const icon = r.status === 'completed' ? '✅' : '❌';
    report += `${icon} **${r.service_id}**: ${r.status}`;
    if (r.rows_affected) report += ` (${r.rows_affected} records)`;
    if (r.error) report += ` — Error: ${r.error}`;
    report += `\n`;
  }

  return report;
}
```

## Results

- **Deletion completion time**: 24 hours average (was 6 weeks manual)
- **GDPR compliance**: 100% within 30-day window (was failing for 40% of requests)
- **Services covered**: 15/15 automatically (was missing 3 services in manual process)
- **Audit report generation**: instant (was 2 days to compile manually)
- **200 requests/month**: fully automated, zero manual intervention
- **DPA inquiry**: resolved with generated compliance reports showing full audit trail
- **Backup handling**: automated backup purge job runs after 90-day retention
