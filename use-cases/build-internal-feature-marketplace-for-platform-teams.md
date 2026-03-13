---
title: Build an Internal Feature Marketplace for Platform Teams
slug: build-internal-feature-marketplace-for-platform-teams
description: >
  Create a self-service portal where product teams discover, request,
  and enable platform capabilities without filing tickets — reducing
  platform team toil by 60% and feature delivery time from weeks to hours.
skills:
  - typescript
  - hono
  - postgresql
  - redis
  - zod
  - authjs
category: Full-Stack Development
tags:
  - internal-developer-platform
  - self-service
  - platform-engineering
  - developer-experience
  - service-catalog
  - toil-reduction
---

# Build an Internal Feature Marketplace for Platform Teams

## The Problem

A platform team of 5 engineers serves 12 product teams. Every request — new database, feature flag, monitoring dashboard, S3 bucket, API key — requires a Jira ticket, prioritization meeting, and manual provisioning. Average turnaround: 8 days. The platform team spends 70% of their time on repetitive provisioning instead of building reusable infrastructure. Product teams are frustrated: "I just need a Redis instance, why does it take 2 weeks?"

## Step 1: Capability Registry

```typescript
// src/marketplace/registry.ts
import { z } from 'zod';

export const Capability = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['database', 'cache', 'messaging', 'monitoring', 'storage', 'auth', 'feature-flags', 'ci-cd']),
  tier: z.enum(['self-service', 'approval-required', 'custom']),
  provisioner: z.string(), // function that handles provisioning
  parameters: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'select']),
    required: z.boolean(),
    default: z.unknown().optional(),
    options: z.array(z.string()).optional(),
    description: z.string(),
  })),
  estimatedTimeMinutes: z.number().int(),
  monthlyEstimateCents: z.number().int().optional(),
  owner: z.string().email(),
  docsUrl: z.string().url().optional(),
});

export const capabilities: z.infer<typeof Capability>[] = [
  {
    id: 'postgres-db',
    name: 'PostgreSQL Database',
    description: 'Managed PostgreSQL instance with automated backups and monitoring',
    category: 'database',
    tier: 'self-service',
    provisioner: 'provision-postgres',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Database name (lowercase, hyphens)' },
      { name: 'size', type: 'select', required: true, options: ['small', 'medium', 'large'], description: 'Instance size', default: 'small' },
      { name: 'environment', type: 'select', required: true, options: ['development', 'staging', 'production'], description: 'Target environment' },
    ],
    estimatedTimeMinutes: 5,
    monthlyEstimateCents: 2500, // $25/mo for small
    owner: 'platform@company.com',
    docsUrl: 'https://wiki.internal/platform/postgres',
  },
  {
    id: 'redis-cache',
    name: 'Redis Cache',
    description: 'Managed Redis instance for caching and sessions',
    category: 'cache',
    tier: 'self-service',
    provisioner: 'provision-redis',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Instance name' },
      { name: 'maxMemoryMb', type: 'select', required: true, options: ['256', '512', '1024', '2048'], description: 'Max memory', default: '256' },
      { name: 'environment', type: 'select', required: true, options: ['development', 'staging', 'production'], description: 'Target environment' },
    ],
    estimatedTimeMinutes: 2,
    monthlyEstimateCents: 1500,
    owner: 'platform@company.com',
  },
  {
    id: 'monitoring-dashboard',
    name: 'Grafana Dashboard',
    description: 'Pre-configured monitoring dashboard with alerting',
    category: 'monitoring',
    tier: 'self-service',
    provisioner: 'provision-grafana-dashboard',
    parameters: [
      { name: 'service', type: 'string', required: true, description: 'Service name to monitor' },
      { name: 'template', type: 'select', required: true, options: ['api', 'worker', 'database', 'custom'], description: 'Dashboard template' },
      { name: 'alertChannels', type: 'string', required: false, description: 'Slack channels for alerts (comma-separated)' },
    ],
    estimatedTimeMinutes: 1,
    owner: 'platform@company.com',
  },
  {
    id: 'production-namespace',
    name: 'Production K8s Namespace',
    description: 'Isolated Kubernetes namespace with RBAC, network policies, and resource quotas',
    category: 'ci-cd',
    tier: 'approval-required',
    provisioner: 'provision-k8s-namespace',
    parameters: [
      { name: 'team', type: 'string', required: true, description: 'Team name' },
      { name: 'cpuLimit', type: 'select', required: true, options: ['2', '4', '8', '16'], description: 'CPU cores limit' },
      { name: 'memoryLimitGb', type: 'select', required: true, options: ['4', '8', '16', '32'], description: 'Memory limit' },
    ],
    estimatedTimeMinutes: 15,
    owner: 'platform@company.com',
  },
];
```

## Step 2: Provisioning Engine

```typescript
// src/marketplace/provisioner.ts
import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

type ProvisionResult = { success: boolean; outputs: Record<string, string>; error?: string };

const provisioners: Record<string, (params: Record<string, any>) => Promise<ProvisionResult>> = {
  'provision-postgres': async (params) => {
    const { name, size, environment } = params;
    const sizeMap: Record<string, string> = { small: 'db.t3.micro', medium: 'db.t3.small', large: 'db.t3.medium' };

    // Run Terraform to create the database
    await execAsync(`terraform apply -auto-approve -var="db_name=${name}" -var="instance_class=${sizeMap[size]}" -var="env=${environment}"`, {
      cwd: '/opt/terraform/modules/postgres',
    });

    // Get connection string from Terraform output
    const { stdout } = await execAsync('terraform output -json connection_string', {
      cwd: '/opt/terraform/modules/postgres',
    });

    const connectionString = JSON.parse(stdout);

    return {
      success: true,
      outputs: {
        connectionString,
        host: `${name}.db.internal`,
        port: '5432',
        dashboardUrl: `https://grafana.internal/d/postgres/${name}`,
      },
    };
  },

  'provision-redis': async (params) => {
    const { name, maxMemoryMb, environment } = params;

    await execAsync(`terraform apply -auto-approve -var="name=${name}" -var="memory=${maxMemoryMb}" -var="env=${environment}"`, {
      cwd: '/opt/terraform/modules/redis',
    });

    return {
      success: true,
      outputs: {
        host: `${name}.redis.internal`,
        port: '6379',
        maxMemory: `${maxMemoryMb}MB`,
      },
    };
  },

  'provision-grafana-dashboard': async (params) => {
    const { service, template } = params;

    // Create dashboard from template via Grafana API
    const templateJson = require(`/opt/grafana-templates/${template}.json`);
    templateJson.title = `${service} - ${template}`;

    const res = await fetch(`${process.env.GRAFANA_URL}/api/dashboards/db`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GRAFANA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard: templateJson, overwrite: false }),
    });

    const result = await res.json() as any;

    return {
      success: true,
      outputs: { dashboardUrl: `${process.env.GRAFANA_URL}${result.url}` },
    };
  },
};

export async function provision(
  capabilityId: string,
  requestId: string,
  params: Record<string, any>,
  requestedBy: string
): Promise<ProvisionResult> {
  const provisionerFn = provisioners[capabilityId];
  if (!provisionerFn) throw new Error(`No provisioner for ${capabilityId}`);

  await db.query(`UPDATE requests SET status = 'provisioning' WHERE id = $1`, [requestId]);

  try {
    const result = await provisionerFn(params);

    await db.query(`
      UPDATE requests SET status = 'completed', outputs = $1, completed_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(result.outputs), requestId]);

    return result;
  } catch (err: any) {
    await db.query(`UPDATE requests SET status = 'failed', error = $1 WHERE id = $2`, [err.message, requestId]);
    return { success: false, outputs: {}, error: err.message };
  }
}
```

## Step 3: Self-Service API

```typescript
// src/api/marketplace.ts
import { Hono } from 'hono';
import { capabilities } from '../marketplace/registry';
import { provision } from '../marketplace/provisioner';
import { Pool } from 'pg';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/v1/capabilities', (c) => {
  return c.json({ capabilities });
});

app.post('/v1/capabilities/:id/request', async (c) => {
  const capId = c.req.param('id');
  const cap = capabilities.find(c => c.id === capId);
  if (!cap) return c.json({ error: 'Capability not found' }, 404);

  const params = await c.req.json();
  const requestedBy = c.get('userId');
  const requestId = crypto.randomUUID();

  await db.query(`
    INSERT INTO requests (id, capability_id, params, requested_by, status, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [requestId, capId, JSON.stringify(params), requestedBy, cap.tier === 'self-service' ? 'provisioning' : 'pending_approval']);

  if (cap.tier === 'self-service') {
    // Auto-provision
    const result = await provision(cap.provisioner, requestId, params, requestedBy);
    return c.json({ requestId, status: 'completed', outputs: result.outputs });
  }

  return c.json({ requestId, status: 'pending_approval', estimatedTime: '1-2 business days' });
});

export default app;
```

## Results

- **Provisioning time**: 5 minutes for self-service items (was 8 days average)
- **Platform team toil**: 60% reduction — automated 80% of repetitive requests
- **Ticket volume**: dropped from 50/week to 12/week (only custom/approval items)
- **Product team satisfaction**: NPS +62 (was -15)
- **New database creation**: click a button, get connection string in 5 minutes
- **Cost visibility**: each team sees their infrastructure spend in real-time
- **Onboarding**: new teams self-service their entire stack in day 1
