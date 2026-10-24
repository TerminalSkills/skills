---
title: Build a Cost-Aware Kubernetes Autoscaler
slug: build-cost-aware-kubernetes-autoscaler
description: >
  Replace reactive HPA with a predictive, cost-aware autoscaler that
  pre-scales for traffic spikes, right-sizes pods and caps spend,
  without sacrificing performance.
skills:
  - typescript
  - redis
  - postgresql
  - vitest
category: devops
tags:
  - kubernetes
  - autoscaling
  - cost-optimization
  - finops
  - capacity-planning
  - cloud-cost
---

# Build a Cost-Aware Kubernetes Autoscaler

## The Problem

Jay is a platform engineer at a B2B SaaS company spending $45K/month on Kubernetes clusters across 3 environments. CPU utilization averages 23%, so they pay for roughly four times what they use. The Horizontal Pod Autoscaler (HPA) reacts too slowly: when a sales demo drives five times the traffic at 2 PM, new pods take minutes to become ready and users see 503s. Engineers set high replica minimums "just in case", and nobody can say which services are over-provisioned because there is no cost attribution per team.

## The Solution

A small TypeScript service with five parts:

1. a **collector** that samples pod usage from metrics-server and requests from the pod specs into PostgreSQL;
2. a **right-sizer** that computes p95 usage in SQL and recommends requests;
3. a **pure decision function** (unit-tested with Vitest) that combines a scheduled event, last week's pattern and the HPA-style CPU ratio, then applies a budget cap and one-pod-at-a-time scale-down;
4. an **executor** that patches the Deployment's `scale` subresource and records history in Redis;
5. a **cost report** query per team.

Prerequisites: metrics-server (serves `metrics.k8s.io/v1beta1`), Redis, PostgreSQL, Node.js 22+ (Vitest 5 requires it). Do not run this against a Deployment that also has an HPA: the two controllers will fight over `replicas`. Remove the HPA for services you hand to this service, or keep the HPA and use only the collector, right-sizer and cost report.

Install: `npm i ioredis pg` and `npm i -D typescript vitest @types/node @types/pg`.

## Step-by-Step Walkthrough

### Step 1: Storage and permissions

```sql
CREATE TABLE pod_metrics (
  namespace    text        NOT NULL,
  deployment   text        NOT NULL,
  pod          text        NOT NULL,
  containers   jsonb       NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now()
);
```

Give the service its own ServiceAccount with only these rules: `get`/`list` on `pods` (core group) and on `pods` in `metrics.k8s.io` (a ClusterRole), and `get`/`patch` on `deployments/scale` in `apps` (a namespaced Role in each namespace it manages).

### Step 2: Usage collector

Run it every minute (a CronJob or `setInterval`). Inside the cluster, authenticate with the pod's ServiceAccount token. Kubernetes rotates that token, so read the file on every request instead of caching it, and start Node with `NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` so `fetch` trusts the API server.

```typescript
// src/k8s.ts
import { readFileSync } from "node:fs";
export const K8S = process.env.K8S_API ?? "https://kubernetes.default.svc";
export const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8").trim()}`,
});
```

Queries are parameterized, and pods are matched by namespace and name, since names are only unique within a namespace. Resource quantities come in several spellings (`250m`, `100000n`, `512M`, `1Gi`), so the parsers handle each suffix.

```typescript
// src/collector.ts
import { Pool } from "pg";
import { K8S, authHeaders } from "./k8s.js";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const parseCpu = (v: string): number => {
  const m = /^([\d.]+)(n|u|m)?$/.exec(v);
  if (!m) return 0;
  const scale = { n: 1e-6, u: 1e-3, m: 1 }[m[2] as "n" | "u" | "m"] ?? 1000;
  return parseFloat(m[1]) * scale; // -> millicores
};

export const parseMemory = (v: string): number => {
  const m = /^([\d.]+)(Ki|Mi|Gi|Ti|k|M|G|T)?$/.exec(v);
  if (!m) return 0;
  const bytes: Record<string, number> = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  return (parseFloat(m[1]) * (bytes[m[2]] ?? 1)) / 1024 ** 2; // -> MiB
};

const get = async (path: string) => {
  const r = await fetch(`${K8S}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<any>;
};

// checkout-7d9f8b6c5-x2x4k -> ReplicaSet checkout-7d9f8b6c5 -> Deployment checkout
const deploymentOf = (pod: any): string => {
  const rs = pod.metadata.ownerReferences?.find((o: any) => o.kind === "ReplicaSet")?.name;
  return rs ? rs.replace(/-[a-z0-9]+$/, "") : pod.metadata.name;
};

export async function collectMetrics(): Promise<number> {
  const [usage, pods] = await Promise.all([get("/apis/metrics.k8s.io/v1beta1/pods"), get("/api/v1/pods")]);
  const specs = new Map<string, any>(pods.items.map((p: any) => [`${p.metadata.namespace}/${p.metadata.name}`, p]));
  let rows = 0;
  for (const item of usage.items) {
    const pod = specs.get(`${item.metadata.namespace}/${item.metadata.name}`);
    if (!pod) continue;
    const containers = item.containers.map((c: any) => {
      const res = pod.spec.containers.find((s: any) => s.name === c.name)?.resources ?? {};
      return {
        name: c.name,
        cpuUsage: parseCpu(c.usage.cpu),
        cpuRequest: parseCpu(res.requests?.cpu ?? "0"),
        memUsage: parseMemory(c.usage.memory),
        memRequest: parseMemory(res.requests?.memory ?? "0"),
      };
    });
    await db.query(
      "INSERT INTO pod_metrics (namespace, deployment, pod, containers) VALUES ($1, $2, $3, $4)",
      [item.metadata.namespace, deploymentOf(pod), item.metadata.name, JSON.stringify(containers)],
    );
    rows++;
  }
  return rows;
}
```

### Step 3: Right-sizing analyzer

The p95 is computed by PostgreSQL, so no samples are pulled into Node.

```typescript
// src/right-sizer.ts
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function recommend(namespace: string, deployment: string, days = 7) {
  const { rows } = await db.query(
    `SELECT c->>'name' AS container,
            count(*)::int AS samples,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY (c->>'cpuUsage')::float) AS cpu_p95,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY (c->>'memUsage')::float) AS mem_p95,
            max((c->>'cpuRequest')::float) AS cpu_request,
            max((c->>'memRequest')::float) AS mem_request
       FROM pod_metrics, jsonb_array_elements(containers) AS c
      WHERE namespace = $1 AND deployment = $2
        AND collected_at > now() - make_interval(days => $3)
      GROUP BY 1`,
    [namespace, deployment, days],
  );

  return rows.map((r) => ({
    container: r.container,
    cpuRequest: { current: r.cpu_request, recommended: Math.max(50, Math.ceil(r.cpu_p95 * 1.2)) }, // p95 + 20%, floor 50m
    memRequestMiB: { current: r.mem_request, recommended: Math.max(64, Math.ceil(r.mem_p95 * 1.2)) }, // floor 64 MiB
    confidence: r.samples >= 1000 ? "high" : r.samples >= 300 ? "medium" : "low",
  }));
}
```

### Step 4: The scaling decision, with tests

A pure function: every rule is testable without a cluster.

```typescript
// src/decide.ts
export interface ScaleInput {
  currentReplicas: number;
  currentCpuPercent: number;   // average CPU as % of request
  historicalReplicas: number;  // what this weekday/hour needed last time
  scheduled?: { replicas: number; reason: string };
  minReplicas: number;
  maxReplicas: number;
  targetCpuPercent: number;
  costPerReplicaHour: number;
  maxHourlyBudget: number;
}

export function decideReplicas(i: ScaleInput): { target: number; reason: string } {
  const clamp = (n: number) => Math.max(i.minReplicas, Math.min(i.maxReplicas, n));

  // Scheduled event (demo, campaign), else the larger of the HPA-style estimate and last week's pattern.
  let target = i.scheduled
    ? clamp(i.scheduled.replicas)
    : clamp(Math.max(Math.ceil((i.currentReplicas * i.currentCpuPercent) / i.targetCpuPercent), i.historicalReplicas));

  // Budget guardrail: stay under the hourly cap, but never below the floor.
  const affordable = Math.floor(i.maxHourlyBudget / i.costPerReplicaHour);
  if (target > affordable) target = Math.max(i.minReplicas, affordable);

  // Scale down at most one pod per cycle.
  if (target < i.currentReplicas) target = Math.max(target, i.currentReplicas - 1);

  const reason = i.scheduled && target >= i.scheduled.replicas ? `scheduled: ${i.scheduled.reason}`
    : target > i.currentReplicas ? `scale up: CPU ${i.currentCpuPercent}% vs target ${i.targetCpuPercent}%`
    : target < i.currentReplicas ? "scale down: load below target"
    : "no change";
  return { target, reason };
}
```

```typescript
// src/decide.test.ts
import { describe, expect, it } from "vitest";
import { decideReplicas, type ScaleInput } from "./decide";

const base: ScaleInput = {
  currentReplicas: 4, currentCpuPercent: 60, historicalReplicas: 1,
  minReplicas: 2, maxReplicas: 20, targetCpuPercent: 60,
  costPerReplicaHour: 0.1, maxHourlyBudget: 1.0,
};

describe("decideReplicas", () => {
  it("scales up reactively", () => {
    expect(decideReplicas({ ...base, currentCpuPercent: 120 }).target).toBe(8);
  });
  it("pre-scales for a scheduled event", () => {
    const s = { replicas: 9, reason: "demo" };
    expect(decideReplicas({ ...base, currentCpuPercent: 10, scheduled: s }).target).toBe(9);
  });
  it("caps at the hourly budget", () => {
    expect(decideReplicas({ ...base, currentCpuPercent: 600 }).target).toBe(10);
  });
  it("scales down one pod per cycle, never below the floor", () => {
    expect(decideReplicas({ ...base, currentCpuPercent: 5 }).target).toBe(3);
  });
});
```

Run `npx vitest run`.

### Step 5: Executor

Scaling goes through the Deployment's `scale` subresource with a JSON merge patch. The loop that calls it reads the CPU average from the metrics table, the historical value from `scale:history:*`, and a `scale:scheduled:<namespace>:<deployment>` JSON value (`{"replicas":12,"reason":"customer demo","startAt":<ms>,"endAt":<ms>}`, with a TTL) when `now` is inside its window.

```typescript
// src/executor.ts
import { Redis } from "ioredis";
import { K8S, authHeaders } from "./k8s.js";

const redis = new Redis(process.env.REDIS_URL!);

export async function applyScale(namespace: string, deployment: string, replicas: number) {
  const r = await fetch(
    `${K8S}/apis/apps/v1/namespaces/${namespace}/deployments/${deployment}/scale`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/merge-patch+json",
      },
      body: JSON.stringify({ spec: { replicas } }),
    },
  );
  if (!r.ok) return { ok: false, message: `${r.status} ${await r.text()}` };
  const now = new Date(); // remembered for next week's pattern
  await redis.set(`scale:history:${namespace}:${deployment}:${now.getDay()}:${now.getHours()}`, replicas, "EX", 14 * 86400);
  return { ok: true, message: `${deployment} -> ${replicas}` };
}
```

### Step 6: Make scale-down graceful

The autoscaler only changes the replica count; Kubernetes picks the pod to remove. Dropped requests are prevented in the workload: give every service you scale down a `preStop` hook (`exec: { command: ["sleep", "10"] }`) so endpoints drain before SIGTERM, a `terminationGracePeriodSeconds` longer than your slowest request, and a PodDisruptionBudget with `maxUnavailable: 1` so node drains cannot remove several replicas at once.

### Step 7: Cost per team

Charge for what pods request, because that is what the scheduler reserves and the node bill follows. Each sample is one pod-minute, so request-minutes divided by 60 gives pod-hours; map namespaces to teams in a table you own.

```sql
SELECT namespace, deployment,
       round((sum((c->>'cpuRequest')::float) / 1000 / 60 * $1 +
              sum((c->>'memRequest')::float) / 1024 / 60 * $2)::numeric, 2) AS usd,
       round(100 * sum((c->>'cpuUsage')::float) / NULLIF(sum((c->>'cpuRequest')::float), 0)) AS cpu_utilization_pct
  FROM pod_metrics, jsonb_array_elements(containers) AS c
 WHERE collected_at::date = $3
 GROUP BY 1, 2 ORDER BY usd DESC;
```

Bind `$1`/`$2` as your CPU-core-hour and GiB-hour rates, `$3` as the day.

## Real-World Example

Jay runs the collector for a week, then the right-sizer over the 20 busiest Deployments. Most recommendations cut CPU requests by half or more, and `high` confidence ones are applied through the normal Helm values review rather than automatically. For the 2 PM demo he writes that scheduled entry for 12 replicas the day before, and the decision function holds 12 replicas for that window instead of waiting for CPU to rise. After a quarter the team's own bill figures show lower idle spend and no demo-time 503s; your numbers will depend on your workloads and cloud prices.

## Related Skills

- [typescript](../skills/typescript/) for the service code
- [redis](../skills/redis/) for scheduled events and weekday/hour history
- [postgresql](../skills/postgresql/) for usage history and p95 queries
- [vitest](../skills/vitest/) for testing the decision rules
