---
title: Build Self-Healing Infrastructure with Observability-Driven Automation
slug: build-self-healing-infrastructure-with-observability
description: A platform team builds infrastructure that detects and fixes common issues automatically — using OpenTelemetry for unified observability, automated runbooks triggered by alert patterns, progressive rollbacks when error rates spike, and capacity auto-scaling based on predictive metrics — reducing 3 AM pages by 90% and MTTR from 45 minutes to under 3 minutes.
skills: [opentelemetry-js, docker-helper, kubernetes-helm, trigger-dev-v3, hono]
category: Cloud & Serverless
tags: [observability, self-healing, automation, sre, monitoring, incident-response, infrastructure]
---

# Build Self-Healing Infrastructure with Observability-Driven Automation

Reena is the SRE lead at a company running 40 microservices in Kubernetes. The team gets 15-20 PagerDuty alerts per week. 80% of them are the same 5 issues: pod OOMKills, certificate expirations, disk space on log volumes, database connection pool exhaustion, and deployment rollbacks needed after error rate spikes. Each alert wakes someone up, they run the same runbook they've run 50 times before, fix the issue in 10 minutes of actual work (after 35 minutes of context-gathering), and go back to sleep. Reena wants the system to fix itself for the known issues, and only page humans for novel problems.

## The Problem: Humans as Inefficient Automation

The on-call engineer's workflow for a typical alert:

1. Wake up at 3 AM (5 min to become conscious)
2. Open laptop, VPN in, check PagerDuty (5 min)
3. Read the alert, figure out which service, check dashboards (10 min)
4. SSH to the cluster, check pod status, check logs (10 min)
5. Run the fix they've run before: restart pod, scale up, rollback (5 min)
6. Verify the fix worked (5 min)
7. Write incident notes (5 min)

45 minutes for 5 minutes of actual work. The rest is context-gathering that a machine does in seconds.

## Step 1: Unified Observability with OpenTelemetry

Before automating fixes, you need reliable signal. Every service reports traces, metrics, and logs through OpenTelemetry:

```typescript
// lib/telemetry.ts — Standard instrumentation for all services
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis-4";

const sdk = new NodeSDK({
  serviceName: process.env.SERVICE_NAME!,
  traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_COLLECTOR_URL}/v1/traces` }),
  metricReader: new PrometheusExporter({ port: 9464 }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
    new RedisInstrumentation(),
  ],
});
sdk.start();

// Custom metrics for self-healing decisions
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("self-healing");

export const errorRate = meter.createHistogram("http_error_rate", {
  description: "Error rate over 5-minute windows",
  unit: "ratio",
});

export const memoryPressure = meter.createObservableGauge("memory_pressure_ratio", {
  description: "Memory usage as ratio of limit",
});

memoryPressure.addCallback((result) => {
  const used = process.memoryUsage().heapUsed;
  const limit = parseInt(process.env.MEMORY_LIMIT || "536870912"); // 512MB default
  result.observe(used / limit);
});
```

## Step 2: Alert Pattern Matching

Instead of PagerDuty directly alerting humans, alerts go to a routing service that checks if there's an automated fix:

```typescript
// healer/router.ts — Route alerts to automation or humans
interface AlertPattern {
  name: string;
  match: (alert: Alert) => boolean;
  handler: (alert: Alert) => Promise<HealingResult>;
  maxAutoFixes: number;                    // Safety: max auto-fixes per hour
  requiresApproval: boolean;               // Some fixes need Slack approval first
}

const patterns: AlertPattern[] = [
  {
    name: "pod-oomkill",
    match: (a) => a.labels.alertname === "KubePodOOMKill",
    handler: handleOOMKill,
    maxAutoFixes: 5,
    requiresApproval: false,
  },
  {
    name: "error-rate-spike",
    match: (a) => a.labels.alertname === "HighErrorRate" && parseFloat(a.labels.error_rate) > 0.05,
    handler: handleErrorRateSpike,
    maxAutoFixes: 3,
    requiresApproval: false,               // Auto-rollback is safe
  },
  {
    name: "db-connection-exhaustion",
    match: (a) => a.labels.alertname === "DatabaseConnectionPoolExhausted",
    handler: handleConnectionExhaustion,
    maxAutoFixes: 3,
    requiresApproval: false,
  },
  {
    name: "disk-pressure",
    match: (a) => a.labels.alertname === "DiskSpaceCritical",
    handler: handleDiskPressure,
    maxAutoFixes: 2,
    requiresApproval: true,                // Deleting logs needs approval
  },
  {
    name: "cert-expiry",
    match: (a) => a.labels.alertname === "CertificateExpiringSoon",
    handler: handleCertRenewal,
    maxAutoFixes: 10,
    requiresApproval: false,
  },
];

async function routeAlert(alert: Alert) {
  // Check rate limits (safety: don't auto-fix in a loop)
  for (const pattern of patterns) {
    if (pattern.match(alert)) {
      const recentFixes = await db.healingActions.count({
        where: { pattern: pattern.name, createdAt: { gte: new Date(Date.now() - 3600000) } },
      });

      if (recentFixes >= pattern.maxAutoFixes) {
        // Too many fixes for this pattern — escalate to human
        await escalateToHuman(alert, `Auto-fix rate limit reached for ${pattern.name} (${recentFixes}/${pattern.maxAutoFixes} in last hour)`);
        return;
      }

      if (pattern.requiresApproval) {
        await requestSlackApproval(alert, pattern);
        return;
      }

      // Execute automated fix
      const result = await executeWithSafety(pattern, alert);
      await recordHealingAction(pattern.name, alert, result);
      return;
    }
  }

  // No pattern matched — novel issue, page the human
  await escalateToHuman(alert, "No automated fix available");
}
```

## Step 3: Automated Fixes

Each handler implements a specific runbook:

```typescript
// healer/handlers.ts

// OOMKill → Restart pod with increased memory (temporary) + create ticket for permanent fix
async function handleOOMKill(alert: Alert): Promise<HealingResult> {
  const { namespace, pod, container } = alert.labels;
  const service = extractServiceName(pod);

  // Get current memory limit
  const deployment = await k8s.readNamespacedDeployment(service, namespace);
  const currentLimit = deployment.body.spec.template.spec.containers[0].resources.limits.memory;
  const currentMB = parseMemory(currentLimit);
  const newMB = Math.min(currentMB * 1.5, 4096);  // Increase 50%, cap at 4GB

  // Patch deployment with higher limit
  await k8s.patchNamespacedDeployment(service, namespace, {
    spec: {
      template: {
        spec: {
          containers: [{ name: container, resources: { limits: { memory: `${newMB}Mi` } } }],
        },
      },
    },
  });

  // Create ticket for permanent fix
  await linear.createIssue({
    teamId: getTeamForService(service),
    title: `[Auto-healed] OOMKill on ${service} — memory increased to ${newMB}Mi`,
    description: `Pod ${pod} was OOMKilled. Auto-healer increased memory from ${currentMB}Mi to ${newMB}Mi as a temporary fix.\n\nPlease investigate the root cause:\n- Check for memory leaks\n- Optimize data structures\n- Or confirm the new limit is appropriate`,
    priority: 3,
    labels: ["auto-healed", "memory"],
  });

  await notifySlack(`🔧 Auto-healed OOMKill on \`${service}\`: memory ${currentMB}Mi → ${newMB}Mi. Ticket created.`);

  return { action: "memory_increase", from: `${currentMB}Mi`, to: `${newMB}Mi`, service };
}

// Error rate spike → Auto-rollback to previous deployment
async function handleErrorRateSpike(alert: Alert): Promise<HealingResult> {
  const service = alert.labels.service;
  const namespace = alert.labels.namespace;

  // Check if there was a recent deployment (last 30 minutes)
  const recentDeploys = await db.deployments.findMany({
    where: { service, createdAt: { gte: new Date(Date.now() - 1800000) } },
    orderBy: { createdAt: "desc" },
  });

  if (recentDeploys.length === 0) {
    // No recent deploy — this isn't a deployment-related spike
    return { action: "escalate", reason: "Error spike without recent deployment" };
  }

  const lastDeploy = recentDeploys[0];
  const previousVersion = lastDeploy.previousVersion;

  // Rollback
  await k8s.patchNamespacedDeployment(service, namespace, {
    spec: {
      template: {
        spec: {
          containers: [{
            name: service,
            image: `${service}:${previousVersion}`,
          }],
        },
      },
    },
  });

  // Wait for rollback to complete
  await waitForDeployment(service, namespace, 120);

  // Verify error rate dropped
  const errorRateAfter = await queryPrometheus(
    `rate(http_requests_total{service="${service}",status=~"5.."}[2m]) / rate(http_requests_total{service="${service}"}[2m])`,
  );

  if (errorRateAfter > 0.05) {
    // Rollback didn't fix it — escalate
    await escalateToHuman(alert, `Rolled back ${service} to ${previousVersion} but error rate still ${(errorRateAfter * 100).toFixed(1)}%`);
    return { action: "rollback_insufficient", errorRate: errorRateAfter };
  }

  await notifySlack(
    `🔄 Auto-rolled back \`${service}\` from ${lastDeploy.version} to ${previousVersion}. ` +
    `Error rate: ${(parseFloat(alert.labels.error_rate) * 100).toFixed(1)}% → ${(errorRateAfter * 100).toFixed(1)}%. ` +
    `Deploy ${lastDeploy.version} likely has a bug.`,
  );

  return { action: "rollback", from: lastDeploy.version, to: previousVersion, errorRateAfter };
}

// Connection pool exhaustion → Kill idle connections + scale up
async function handleConnectionExhaustion(alert: Alert): Promise<HealingResult> {
  const service = alert.labels.service;

  // Terminate idle connections older than 5 minutes
  await db.$queryRaw`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle'
    AND query_start < NOW() - INTERVAL '5 minutes'
    AND application_name = ${service}
  `;

  // Also scale up the service to spread connection load
  const deployment = await k8s.readNamespacedDeployment(service, alert.labels.namespace);
  const currentReplicas = deployment.body.spec.replicas || 1;
  const newReplicas = Math.min(currentReplicas + 2, 10);

  await k8s.patchNamespacedDeployment(service, alert.labels.namespace, {
    spec: { replicas: newReplicas },
  });

  await notifySlack(
    `🔧 Auto-healed connection exhaustion on \`${service}\`: killed idle connections + scaled ${currentReplicas} → ${newReplicas} replicas`,
  );

  return { action: "kill_idle_and_scale", newReplicas };
}
```

## Step 4: Safety Guardrails

Automation without guardrails is a disaster. Every auto-fix has safety checks:

```typescript
// healer/safety.ts

async function executeWithSafety(pattern: AlertPattern, alert: Alert): Promise<HealingResult> {
  // 1. Check if this service is in the "no auto-fix" list
  const service = alert.labels.service;
  if (PROTECTED_SERVICES.includes(service)) {
    await escalateToHuman(alert, `${service} is protected — no auto-fixes allowed`);
    return { action: "blocked", reason: "protected_service" };
  }

  // 2. Check if there's already an active fix for this service
  const activeFix = await db.healingActions.findFirst({
    where: { service, status: "in_progress" },
  });
  if (activeFix) {
    await escalateToHuman(alert, `Another fix is already in progress for ${service}`);
    return { action: "blocked", reason: "concurrent_fix" };
  }

  // 3. Execute with timeout
  const result = await Promise.race([
    pattern.handler(alert),
    new Promise<HealingResult>((_, reject) =>
      setTimeout(() => reject(new Error("Fix timed out after 5 minutes")), 300000),
    ),
  ]);

  // 4. Verify the fix worked (wait 2 minutes, then check)
  await sleep(120000);
  const stillAlerting = await checkAlertStillFiring(alert);
  if (stillAlerting) {
    await escalateToHuman(alert, `Auto-fix for ${pattern.name} did not resolve the issue`);
    result.verified = false;
  } else {
    result.verified = true;
  }

  return result;
}
```

## Results

After 6 months:

- **PagerDuty pages**: 15-20/week → 2-3/week (85% reduction); remaining are genuinely novel issues
- **MTTR for auto-healed issues**: 45 minutes → 2.5 minutes (alert → fix → verified)
- **Auto-rollbacks**: 12 bad deployments caught and rolled back before customers noticed; zero manual rollbacks needed
- **OOMKill response**: From "wake someone up" to "auto-increase memory + ticket" in 90 seconds
- **On-call engineer happiness**: NPS went from -30 to +40; "I actually sleep now"
- **False auto-fixes**: 3 in 6 months (0.8% of all auto-fixes); all caught by the verification step and escalated
- **Ticket creation**: Every auto-fix creates a ticket for root cause investigation; technical debt doesn't accumulate silently
- **Safety record**: Zero data loss, zero extended outages caused by automation; guardrails work
- **Cost**: Engineering time saved: ~20 hours/week × $100/hour = $8,000/month; infrastructure cost of healer: $150/month
