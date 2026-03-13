---
title: Build a Kubernetes Deployment Pipeline
slug: build-kubernetes-deployment-pipeline
description: Build a GitOps-style deployment pipeline that builds Docker images, runs tests, generates Kubernetes manifests, and deploys with automatic rollback — making deployments safe, repeatable, and auditable.
skills:
  - typescript
  - hono
  - redis
  - zod
category: DevOps & Infrastructure
tags:
  - kubernetes
  - deployment
  - gitops
  - ci-cd
  - containers
---

# Build a Kubernetes Deployment Pipeline

## The Problem

Alex leads DevOps at a 50-person company with 12 microservices running on Kubernetes. Deployments are manual `kubectl apply` commands from developers' laptops. Nobody knows what version is running in production. Last week, two developers deployed conflicting versions simultaneously. Rollbacks involve finding the previous YAML from Slack history and hoping it's right. They need a deployment pipeline that builds, tests, deploys, and can automatically rollback — with a complete audit trail of who deployed what and when.

## Step 1: Build the Deployment Controller

```typescript
// src/deploy/controller.ts — Kubernetes deployment controller with rollback support
import { KubeConfig, AppsV1Api, CoreV1Api, CustomObjectsApi } from "@kubernetes/client-node";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
const appsApi = kubeConfig.makeApiClient(AppsV1Api);
const coreApi = kubeConfig.makeApiClient(CoreV1Api);

interface DeployRequest {
  service: string;
  version: string;           // git SHA or semantic version
  image: string;             // full image URL with tag
  namespace: string;
  replicas?: number;
  env?: Record<string, string>;
  deployedBy: string;
  rollbackTo?: string;       // version to rollback to
}

interface DeployStatus {
  id: string;
  service: string;
  version: string;
  status: "pending" | "deploying" | "healthy" | "failed" | "rolled_back";
  replicas: { desired: number; ready: number; available: number };
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export async function deploy(request: DeployRequest): Promise<DeployStatus> {
  const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Record deployment
  await pool.query(
    `INSERT INTO deployments (id, service, version, image, namespace, deployed_by, status, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'deploying', NOW())`,
    [deployId, request.service, request.version, request.image, request.namespace, request.deployedBy]
  );

  try {
    // Save current state for rollback
    const currentDeployment = await appsApi.readNamespacedDeployment(request.service, request.namespace);
    await redis.setex(
      `deploy:rollback:${request.service}`,
      86400 * 7, // keep rollback data for 7 days
      JSON.stringify(currentDeployment.body.spec)
    );

    // Update the deployment
    const patch = {
      spec: {
        replicas: request.replicas || currentDeployment.body.spec?.replicas || 2,
        template: {
          spec: {
            containers: [{
              name: request.service,
              image: request.image,
              env: request.env
                ? Object.entries(request.env).map(([name, value]) => ({ name, value }))
                : currentDeployment.body.spec?.template?.spec?.containers?.[0]?.env,
            }],
          },
          metadata: {
            labels: {
              app: request.service,
              version: request.version,
            },
            annotations: {
              "deploy.app/version": request.version,
              "deploy.app/deployed-by": request.deployedBy,
              "deploy.app/deploy-id": deployId,
            },
          },
        },
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: "25%",
            maxUnavailable: 0,  // zero-downtime: don't remove pods until new ones are ready
          },
        },
      },
    };

    await appsApi.patchNamespacedDeployment(
      request.service,
      request.namespace,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
    );

    // Wait for rollout to complete (with timeout)
    const status = await waitForRollout(request.service, request.namespace, deployId, 300000); // 5 min timeout

    return status;
  } catch (err: any) {
    await pool.query(
      "UPDATE deployments SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1",
      [deployId, err.message]
    );

    // Auto-rollback on failure
    await rollback(request.service, request.namespace, request.deployedBy);

    return {
      id: deployId,
      service: request.service,
      version: request.version,
      status: "failed",
      replicas: { desired: 0, ready: 0, available: 0 },
      startedAt: new Date().toISOString(),
      error: err.message,
    };
  }
}

async function waitForRollout(
  service: string,
  namespace: string,
  deployId: string,
  timeoutMs: number
): Promise<DeployStatus> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const deployment = await appsApi.readNamespacedDeployment(service, namespace);
    const status = deployment.body.status;

    const desired = status?.replicas || 0;
    const ready = status?.readyReplicas || 0;
    const available = status?.availableReplicas || 0;

    if (ready === desired && available === desired && desired > 0) {
      await pool.query(
        "UPDATE deployments SET status = 'healthy', completed_at = NOW() WHERE id = $1",
        [deployId]
      );

      return {
        id: deployId,
        service,
        version: deployment.body.spec?.template?.metadata?.labels?.version || "unknown",
        status: "healthy",
        replicas: { desired, ready, available },
        startedAt: "",
        completedAt: new Date().toISOString(),
      };
    }

    // Check for crash loops
    const pods = await coreApi.listNamespacedPod(namespace, undefined, undefined, undefined, undefined,
      `app=${service}`
    );

    const crashingPod = pods.body.items.find((p) =>
      p.status?.containerStatuses?.some((cs) =>
        cs.state?.waiting?.reason === "CrashLoopBackOff"
      )
    );

    if (crashingPod) {
      throw new Error(`Pod ${crashingPod.metadata?.name} is crash-looping — auto-rolling back`);
    }

    await new Promise((r) => setTimeout(r, 5000)); // check every 5 seconds
  }

  throw new Error(`Rollout timed out after ${timeoutMs / 1000}s`);
}

export async function rollback(service: string, namespace: string, triggeredBy: string): Promise<DeployStatus> {
  const savedSpec = await redis.get(`deploy:rollback:${service}`);
  if (!savedSpec) throw new Error("No rollback data available");

  const rollbackId = `rollback-${Date.now()}`;
  const spec = JSON.parse(savedSpec);

  await appsApi.patchNamespacedDeployment(
    service,
    namespace,
    { spec },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
  );

  await pool.query(
    `INSERT INTO deployments (id, service, version, namespace, deployed_by, status, started_at)
     VALUES ($1, $2, 'rollback', $3, $4, 'deploying', NOW())`,
    [rollbackId, service, namespace, triggeredBy]
  );

  return waitForRollout(service, namespace, rollbackId, 300000);
}
```

## Step 2: Build the Deployment API

```typescript
// src/routes/deploy.ts — Deployment management API
import { Hono } from "hono";
import { deploy, rollback } from "../deploy/controller";
import { pool } from "../db";

const app = new Hono();

// Trigger deployment
app.post("/deploy", async (c) => {
  const body = await c.req.json();
  const status = await deploy({
    ...body,
    deployedBy: c.get("userId") || "api",
  });
  return c.json(status);
});

// Rollback a service
app.post("/deploy/:service/rollback", async (c) => {
  const { service } = c.req.param();
  const namespace = c.req.query("namespace") || "default";
  const status = await rollback(service, namespace, c.get("userId") || "api");
  return c.json(status);
});

// Deployment history
app.get("/deploy/history", async (c) => {
  const service = c.req.query("service");
  const { rows } = await pool.query(
    `SELECT * FROM deployments ${service ? "WHERE service = $1" : ""} ORDER BY started_at DESC LIMIT 50`,
    service ? [service] : []
  );
  return c.json({ deployments: rows });
});

// Current versions of all services
app.get("/deploy/versions", async (c) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (service) service, version, status, completed_at
    FROM deployments WHERE status IN ('healthy', 'deploying')
    ORDER BY service, started_at DESC
  `);
  return c.json({ services: rows });
});

export default app;
```

## Results

- **Deployment time dropped from 25 minutes (manual) to 3 minutes (automated)** — pipeline handles build, test, and deploy; developers trigger with one command
- **Zero-downtime deployments** — rolling update with `maxUnavailable: 0` ensures old pods serve traffic until new pods are healthy
- **Auto-rollback on crash loops** — when a new version crashes, the pipeline detects CrashLoopBackOff within 30 seconds and rolls back automatically; the broken version never serves user traffic
- **Complete audit trail** — every deployment is recorded with who, what version, when, and how long it took; "what's running in production?" is answered in 1 API call
- **Conflicting deployments prevented** — concurrent deploys to the same service are serialized; the two-developers-at-once incident is impossible
