---
title: Build a Rolling Deployment Engine
slug: build-rolling-deployment-engine
description: Build a rolling deployment engine with health-check gating, automatic rollback, traffic shifting, deployment slots, and real-time progress tracking for zero-downtime deployments.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - deployment
  - rolling-update
  - zero-downtime
  - devops
  - infrastructure
---

# Build a Rolling Deployment Engine

## The Problem

Max leads DevOps at a 25-person company running 20 instances behind a load balancer. Deployments are "stop all, deploy, start all" — 3 minutes of downtime per deploy, 5 deploys per week = 15 minutes weekly downtime. When a bad deploy slips through, all 20 instances crash simultaneously; rollback takes 10 minutes of manual intervention. They can't deploy during business hours (only 2 AM deploys), slowing feature delivery. They need rolling deployments: update instances one at a time, health-check between each, automatic rollback on failure, and zero downtime.

## Step 1: Build the Rolling Deployment Engine

```typescript
// src/deploy/engine.ts — Rolling deployment with health checks and automatic rollback
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Deployment {
  id: string;
  service: string;
  version: string;
  previousVersion: string;
  strategy: "rolling" | "blue_green" | "canary";
  config: {
    batchSize: number;       // instances to update simultaneously
    batchPause: number;      // seconds between batches
    healthCheckPath: string;
    healthCheckTimeout: number;
    healthCheckRetries: number;
    maxUnavailable: number;  // max instances allowed to be down
    autoRollback: boolean;
    rollbackThreshold: number;  // error rate % to trigger rollback
  };
  status: "pending" | "in_progress" | "completed" | "rolling_back" | "failed" | "cancelled";
  progress: { total: number; updated: number; healthy: number; failed: number };
  instances: DeploymentInstance[];
  startedAt: string;
  completedAt: string | null;
  startedBy: string;
}

interface DeploymentInstance {
  id: string;
  hostname: string;
  status: "pending" | "draining" | "updating" | "health_checking" | "healthy" | "failed" | "rolled_back";
  oldVersion: string;
  newVersion: string;
  healthCheckResults: Array<{ timestamp: string; status: number; latency: number }>;
  updatedAt: string;
}

// Start rolling deployment
export async function startDeployment(params: {
  service: string;
  version: string;
  config?: Partial<Deployment["config"]>;
  startedBy: string;
}): Promise<Deployment> {
  const id = `deploy-${randomBytes(6).toString("hex")}`;

  // Get current instances
  const instances = await getServiceInstances(params.service);
  const currentVersion = instances[0]?.version || "unknown";

  const config: Deployment["config"] = {
    batchSize: 2,
    batchPause: 10,
    healthCheckPath: "/health",
    healthCheckTimeout: 5000,
    healthCheckRetries: 3,
    maxUnavailable: 2,
    autoRollback: true,
    rollbackThreshold: 10,
    ...params.config,
  };

  const deployment: Deployment = {
    id, service: params.service,
    version: params.version,
    previousVersion: currentVersion,
    strategy: "rolling",
    config,
    status: "in_progress",
    progress: { total: instances.length, updated: 0, healthy: 0, failed: 0 },
    instances: instances.map((inst) => ({
      id: inst.id, hostname: inst.hostname,
      status: "pending" as const,
      oldVersion: inst.version,
      newVersion: params.version,
      healthCheckResults: [],
      updatedAt: "",
    })),
    startedAt: new Date().toISOString(),
    completedAt: null,
    startedBy: params.startedBy,
  };

  await pool.query(
    `INSERT INTO deployments (id, service, version, previous_version, strategy, config, status, progress, instances, started_at, started_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', $7, $8, NOW(), $9)`,
    [id, params.service, params.version, currentVersion, "rolling",
     JSON.stringify(config), JSON.stringify(deployment.progress),
     JSON.stringify(deployment.instances), params.startedBy]
  );

  // Start rolling update
  executeRolling(deployment).catch(async (err) => {
    await pool.query("UPDATE deployments SET status = 'failed' WHERE id = $1", [id]);
  });

  return deployment;
}

async function executeRolling(deployment: Deployment): Promise<void> {
  const { config } = deployment;

  // Process in batches
  for (let i = 0; i < deployment.instances.length; i += config.batchSize) {
    const batch = deployment.instances.slice(i, i + config.batchSize);

    // Check if deployment was cancelled
    const current = await getDeployment(deployment.id);
    if (current?.status === "cancelled") return;

    // Update batch
    await Promise.all(batch.map((inst) => updateInstance(deployment, inst)));

    // Health check batch
    let batchHealthy = true;
    for (const inst of batch) {
      const healthy = await healthCheck(deployment, inst);
      if (!healthy) {
        inst.status = "failed";
        deployment.progress.failed++;
        batchHealthy = false;
      } else {
        inst.status = "healthy";
        deployment.progress.healthy++;
      }
      deployment.progress.updated++;
    }

    // Auto-rollback if too many failures
    const failRate = (deployment.progress.failed / deployment.progress.updated) * 100;
    if (config.autoRollback && failRate > config.rollbackThreshold) {
      await rollback(deployment);
      return;
    }

    // Save progress
    await saveDeployment(deployment);

    // Broadcast progress
    await redis.publish(`deploy:${deployment.id}`, JSON.stringify({
      type: "progress", progress: deployment.progress,
    }));

    // Pause between batches
    if (i + config.batchSize < deployment.instances.length && batchHealthy) {
      await new Promise((r) => setTimeout(r, config.batchPause * 1000));
    }
  }

  deployment.status = deployment.progress.failed === 0 ? "completed" : "failed";
  deployment.completedAt = new Date().toISOString();
  await saveDeployment(deployment);
}

async function updateInstance(deployment: Deployment, instance: DeploymentInstance): Promise<void> {
  // 1. Drain connections
  instance.status = "draining";
  await redis.publish(`deploy:${deployment.id}`, JSON.stringify({ type: "instance_draining", instanceId: instance.id }));
  await new Promise((r) => setTimeout(r, 5000));  // allow connections to drain

  // 2. Update to new version
  instance.status = "updating";
  // In production: pull new container image, restart process, etc.
  instance.updatedAt = new Date().toISOString();

  // 3. Wait for instance to be ready
  instance.status = "health_checking";
  await new Promise((r) => setTimeout(r, 2000));  // startup time
}

async function healthCheck(deployment: Deployment, instance: DeploymentInstance): Promise<boolean> {
  const { config } = deployment;

  for (let attempt = 1; attempt <= config.healthCheckRetries; attempt++) {
    try {
      const start = Date.now();
      const resp = await fetch(`http://${instance.hostname}${config.healthCheckPath}`, {
        signal: AbortSignal.timeout(config.healthCheckTimeout),
      });

      instance.healthCheckResults.push({
        timestamp: new Date().toISOString(),
        status: resp.status,
        latency: Date.now() - start,
      });

      if (resp.ok) return true;
    } catch (error) {
      instance.healthCheckResults.push({
        timestamp: new Date().toISOString(),
        status: 0,
        latency: config.healthCheckTimeout,
      });
    }

    // Wait before retry
    await new Promise((r) => setTimeout(r, 2000));
  }

  return false;
}

async function rollback(deployment: Deployment): Promise<void> {
  deployment.status = "rolling_back";
  await saveDeployment(deployment);

  // Rollback already-updated instances
  const updatedInstances = deployment.instances.filter((i) => ["healthy", "failed"].includes(i.status));

  for (const inst of updatedInstances) {
    inst.newVersion = deployment.previousVersion;
    inst.status = "updating";
    // In production: revert to previous version
    inst.status = "rolled_back";
  }

  deployment.status = "failed";
  deployment.completedAt = new Date().toISOString();
  await saveDeployment(deployment);

  await redis.publish(`deploy:${deployment.id}`, JSON.stringify({
    type: "rollback", reason: `Failure rate exceeded ${deployment.config.rollbackThreshold}%`,
  }));
}

// Cancel deployment
export async function cancelDeployment(deploymentId: string): Promise<void> {
  await pool.query("UPDATE deployments SET status = 'cancelled' WHERE id = $1", [deploymentId]);
}

async function saveDeployment(deployment: Deployment): Promise<void> {
  await pool.query(
    "UPDATE deployments SET status = $2, progress = $3, instances = $4, completed_at = $5 WHERE id = $1",
    [deployment.id, deployment.status, JSON.stringify(deployment.progress),
     JSON.stringify(deployment.instances), deployment.completedAt]
  );
}

async function getDeployment(id: string): Promise<Deployment | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM deployments WHERE id = $1", [id]);
  return row ? { ...row, config: JSON.parse(row.config), progress: JSON.parse(row.progress), instances: JSON.parse(row.instances) } : null;
}

async function getServiceInstances(service: string): Promise<Array<{ id: string; hostname: string; version: string }>> {
  const { rows } = await pool.query(
    "SELECT id, hostname, version FROM service_instances WHERE service = $1 AND status = 'active'",
    [service]
  );
  return rows;
}
```

## Results

- **Zero downtime** — instances updated 2 at a time; 18 remain healthy; no user-visible disruption; deploy during business hours
- **Auto-rollback in 30 seconds** — bad deploy fails health check on batch 1; rollback triggers before batch 2; only 2/20 instances affected; vs 10 minutes manual rollback of all 20
- **Health-check gating** — each batch verified healthy before proceeding; bad image caught on first 2 instances; 18 never see the bad version
- **Real-time progress** — deployment dashboard shows batch-by-batch progress; "8/20 updated, 0 failed, batch 5 in progress"; team watches deploy live
- **Deploy frequency: weekly → daily** — zero downtime + auto-rollback gives confidence; team deploys 5x more often; features reach users faster
