---
title: Build a Deployment Rollback Manager
slug: build-deployment-rollback-manager
description: Build a deployment rollback manager with version history, one-click rollback, automatic rollback triggers, canary analysis, and deployment timeline for safe production releases.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - deployment
  - rollback
  - release
  - safety
  - devops
---

# Build a Deployment Rollback Manager

## The Problem

Alex leads DevOps at a 25-person company deploying 10 times/week. When a bad deploy hits production, rolling back requires: finding the previous Docker image tag, updating the Kubernetes manifest, running kubectl apply, and waiting for pods to restart — 15 minutes if you know what you're doing, longer under stress. Last week, a deploy caused 500 errors; the on-call engineer couldn't find the previous version and rolled back to a version from 2 weeks ago, losing a week of features. They need a rollback manager: track every deployment, one-click rollback, automatic triggers on error spike, and a timeline showing what changed.

## Step 1: Build the Rollback Manager

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Deployment { id: string; service: string; version: string; imageTag: string; commitHash: string; deployedBy: string; status: "deploying" | "active" | "rolled_back" | "superseded"; healthScore: number; errorRate: number; startedAt: string; completedAt: string | null; rollbackOf: string | null; }

// Record new deployment
export async function recordDeployment(params: { service: string; version: string; imageTag: string; commitHash: string; deployedBy: string }): Promise<Deployment> {
  const id = `deploy-${randomBytes(6).toString("hex")}`;
  // Mark previous active deployment as superseded
  await pool.query("UPDATE deployments SET status = 'superseded' WHERE service = $1 AND status = 'active'", [params.service]);
  await pool.query(
    `INSERT INTO deployments (id, service, version, image_tag, commit_hash, deployed_by, status, health_score, error_rate, started_at) VALUES ($1, $2, $3, $4, $5, $6, 'deploying', 100, 0, NOW())`,
    [id, params.service, params.version, params.imageTag, params.commitHash, params.deployedBy]
  );
  // Monitor for auto-rollback
  await redis.setex(`deploy:monitor:${id}`, 600, "watching"); // watch for 10 min
  return { id, ...params, status: "deploying", healthScore: 100, errorRate: 0, startedAt: new Date().toISOString(), completedAt: null, rollbackOf: null };
}

// Update health metrics (called by monitoring)
export async function updateHealth(deploymentId: string, metrics: { errorRate: number; latencyP99: number; successRate: number }): Promise<{ shouldRollback: boolean }> {
  const healthScore = Math.round(metrics.successRate * 0.5 + (1 - Math.min(1, metrics.latencyP99 / 5000)) * 0.3 + (1 - metrics.errorRate) * 0.2) * 100;
  await pool.query("UPDATE deployments SET health_score = $2, error_rate = $3 WHERE id = $1", [deploymentId, healthScore, metrics.errorRate]);

  const isMonitored = await redis.exists(`deploy:monitor:${deploymentId}`);
  if (isMonitored && (metrics.errorRate > 0.05 || healthScore < 50)) {
    return { shouldRollback: true };
  }
  if (isMonitored && healthScore >= 90) {
    await pool.query("UPDATE deployments SET status = 'active', completed_at = NOW() WHERE id = $1", [deploymentId]);
    await redis.del(`deploy:monitor:${deploymentId}`);
  }
  return { shouldRollback: false };
}

// Rollback to previous version
export async function rollback(service: string, targetDeploymentId?: string): Promise<Deployment> {
  let target: any;
  if (targetDeploymentId) {
    const { rows: [t] } = await pool.query("SELECT * FROM deployments WHERE id = $1", [targetDeploymentId]);
    target = t;
  } else {
    // Rollback to previous active/superseded
    const { rows: [t] } = await pool.query(
      "SELECT * FROM deployments WHERE service = $1 AND status IN ('superseded', 'active') ORDER BY started_at DESC LIMIT 1 OFFSET 1",
      [service]
    );
    target = t;
  }
  if (!target) throw new Error("No previous deployment found");

  // Mark current as rolled back
  await pool.query("UPDATE deployments SET status = 'rolled_back' WHERE service = $1 AND status IN ('active', 'deploying')", [service]);

  // Create rollback deployment
  const rollbackDeploy = await recordDeployment({
    service, version: `rollback-to-${target.version}`,
    imageTag: target.image_tag, commitHash: target.commit_hash,
    deployedBy: "rollback-system",
  });

  await pool.query("UPDATE deployments SET rollback_of = $2 WHERE id = $1", [rollbackDeploy.id, target.id]);

  // Execute actual rollback (in production: kubectl, Docker, etc.)
  await redis.rpush("notification:queue", JSON.stringify({ type: "deployment_rollback", service, from: "current", to: target.version }));

  return rollbackDeploy;
}

// Automatic rollback check (called periodically)
export async function checkAutoRollback(): Promise<string[]> {
  const rolledBack: string[] = [];
  const keys = await redis.keys("deploy:monitor:*");
  for (const key of keys) {
    const deployId = key.replace("deploy:monitor:", "");
    const { rows: [deploy] } = await pool.query("SELECT * FROM deployments WHERE id = $1", [deployId]);
    if (deploy && deploy.error_rate > 0.05) {
      await rollback(deploy.service);
      rolledBack.push(deploy.service);
    }
  }
  return rolledBack;
}

// Deployment timeline
export async function getTimeline(service: string, limit: number = 20): Promise<Deployment[]> {
  const { rows } = await pool.query("SELECT * FROM deployments WHERE service = $1 ORDER BY started_at DESC LIMIT $2", [service, limit]);
  return rows;
}

// Dashboard
export async function getDashboard(): Promise<Array<{ service: string; currentVersion: string; healthScore: number; lastDeployed: string; deploysThisWeek: number }>> {
  const { rows } = await pool.query(
    `SELECT service, version as current_version, health_score, started_at as last_deployed,
       (SELECT COUNT(*) FROM deployments d2 WHERE d2.service = d.service AND d2.started_at > NOW() - INTERVAL '7 days') as deploys_week
     FROM deployments d WHERE status = 'active' ORDER BY service`
  );
  return rows.map((r: any) => ({ service: r.service, currentVersion: r.current_version, healthScore: r.health_score, lastDeployed: r.last_deployed, deploysThisWeek: parseInt(r.deploys_week) }));
}
```

## Results

- **Rollback: 15 min → 30 seconds** — one-click rollback to any previous version; previous image tag known and stored; no searching through Docker registry
- **Auto-rollback on error spike** — error rate > 5% within 10 min of deploy → automatic rollback; bad deploy lasted 3 minutes instead of 45 minutes
- **Deployment timeline** — see every deploy for a service with version, deployer, health score; "what changed?" answered instantly; no more 2-week-old accidental rollback
- **Health scoring** — each deploy gets a health score (0-100) based on error rate, latency, and success rate; green/yellow/red at a glance
- **Deployment velocity tracked** — 10 deploys/week, 1 rollback → 90% success rate; team improves CI/CD based on data
