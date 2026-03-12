---
title: Build an Automated Incident Response Runbook
slug: build-automated-incident-response-runbook
description: Build a system that codifies incident response procedures as executable runbooks, automatically triggering diagnostics, collecting evidence, and guiding responders through resolution steps.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - incident-response
  - runbooks
  - automation
  - on-call
  - sre
---

# Build an Automated Incident Response Runbook

## The Problem

Sven leads SRE at a 45-person platform company. Their incident response is tribal knowledge: experienced engineers know what to check when the payment service is slow, but juniors don't. Runbooks exist as Confluence pages that are outdated and hard to follow at 3 AM. Average incident resolution: 47 minutes. When the senior engineer was on vacation last month, a P1 took 2.5 hours because the on-call junior didn't know which metrics to check first. Codifying runbooks as executable automation would standardize response, auto-collect diagnostics, and cut MTTR in half.

## Step 1: Define the Runbook Schema

Runbooks are declarative workflows: a trigger condition, diagnostic steps to auto-execute, decision trees based on results, and remediation actions. They read like playbooks but execute like code.

```typescript
// src/types.ts — Executable runbook definition
import { z } from "zod";

export const DiagnosticStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["prometheus_query", "http_check", "shell_command", "database_query", "log_search"]),
  config: z.record(z.any()),
  timeout: z.number().default(30),    // seconds
  interpret: z.object({              // how to read the result
    healthy: z.string(),             // condition expression: "value < 80"
    warning: z.string(),
    critical: z.string(),
  }),
});

export const RemediationStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["manual", "automated", "escalate"]),
  // For automated steps
  action: z.object({
    type: z.enum(["restart_service", "scale_up", "rollback", "flush_cache", "run_script", "notify"]),
    config: z.record(z.any()),
  }).optional(),
  // For manual steps — instructions for the responder
  instructions: z.string().optional(),
  requiresApproval: z.boolean().default(false),
});

export const RunbookSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  severity: z.enum(["P1", "P2", "P3", "P4"]),
  service: z.string(),
  
  // When to trigger this runbook
  triggers: z.array(z.object({
    type: z.enum(["alert", "manual", "metric_threshold"]),
    alertName: z.string().optional(),
    metricQuery: z.string().optional(),
    threshold: z.number().optional(),
  })),
  
  // Diagnostic steps — executed automatically when runbook triggers
  diagnostics: z.array(DiagnosticStepSchema),
  
  // Decision tree — which remediation path based on diagnostic results
  decisionTree: z.array(z.object({
    condition: z.string(),          // "diagnostics.db_connections.status === 'critical'"
    then: z.array(z.string()),      // remediation step IDs to execute
    description: z.string(),
  })),
  
  // Available remediation steps
  remediations: z.array(RemediationStepSchema),
  
  // Who to notify
  escalation: z.object({
    primary: z.string(),           // Slack channel or PagerDuty service
    secondary: z.string().optional(),
    escalateAfterMinutes: z.number().default(30),
  }),
});

export type Runbook = z.infer<typeof RunbookSchema>;
export type DiagnosticStep = z.infer<typeof DiagnosticStepSchema>;

// Example: Payment Service Slow runbook
export const PAYMENT_SLOW_RUNBOOK: Runbook = {
  id: "payment-service-slow",
  name: "Payment Service High Latency",
  description: "Triggered when payment service P99 latency exceeds 2s",
  severity: "P1",
  service: "payment-service",
  
  triggers: [{
    type: "alert",
    alertName: "PaymentServiceHighLatency",
  }],
  
  diagnostics: [
    {
      id: "check_pod_health",
      name: "Pod Health",
      description: "Check if payment service pods are running and healthy",
      type: "prometheus_query",
      config: {
        query: 'kube_pod_status_ready{namespace="production",pod=~"payment.*"}'
      },
      timeout: 10,
      interpret: {
        healthy: "all_ready === true",
        warning: "ready_count < total_count",
        critical: "ready_count === 0",
      },
    },
    {
      id: "check_db_connections",
      name: "Database Connection Pool",
      description: "Check if the database connection pool is exhausted",
      type: "prometheus_query",
      config: {
        query: 'pg_stat_activity_count{datname="payments"} / pg_settings_max_connections * 100'
      },
      timeout: 10,
      interpret: {
        healthy: "value < 70",
        warning: "value >= 70 && value < 90",
        critical: "value >= 90",
      },
    },
    {
      id: "check_error_rate",
      name: "Error Rate",
      description: "Check 5xx error rate in the last 5 minutes",
      type: "prometheus_query",
      config: {
        query: 'rate(http_requests_total{service="payment",status=~"5.."}[5m]) / rate(http_requests_total{service="payment"}[5m]) * 100'
      },
      timeout: 10,
      interpret: {
        healthy: "value < 1",
        warning: "value >= 1 && value < 5",
        critical: "value >= 5",
      },
    },
    {
      id: "check_recent_deploy",
      name: "Recent Deployments",
      description: "Check if there was a deployment in the last 30 minutes",
      type: "shell_command",
      config: {
        command: "kubectl rollout history deployment/payment-service -n production | tail -3"
      },
      timeout: 10,
      interpret: {
        healthy: "no_recent_deploy",
        warning: "deploy_within_30m",
        critical: "deploy_within_5m",
      },
    },
    {
      id: "check_downstream",
      name: "Downstream Dependencies",
      description: "Check latency to Stripe API and fraud service",
      type: "http_check",
      config: {
        urls: [
          { name: "stripe", url: "https://api.stripe.com/healthcheck" },
          { name: "fraud-service", url: "http://fraud-service.production:8080/health" },
        ]
      },
      timeout: 15,
      interpret: {
        healthy: "all_healthy",
        warning: "any_slow > 1000ms",
        critical: "any_unreachable",
      },
    },
  ],
  
  decisionTree: [
    {
      condition: "diagnostics.check_db_connections.status === 'critical'",
      then: ["kill_idle_connections", "scale_db_connections"],
      description: "DB connection pool exhausted — kill idle connections and increase pool size",
    },
    {
      condition: "diagnostics.check_recent_deploy.status === 'warning'",
      then: ["rollback_deployment"],
      description: "Recent deployment detected — rollback to previous version",
    },
    {
      condition: "diagnostics.check_pod_health.status === 'critical'",
      then: ["restart_pods", "escalate_infra"],
      description: "Pods are not ready — restart and escalate to infra team",
    },
    {
      condition: "diagnostics.check_downstream.status === 'critical'",
      then: ["enable_circuit_breaker", "notify_downstream"],
      description: "Downstream dependency is down — enable circuit breaker",
    },
    {
      condition: "diagnostics.check_error_rate.status === 'critical'",
      then: ["capture_error_samples", "escalate_oncall"],
      description: "High error rate without obvious infra cause — escalate to on-call engineer",
    },
  ],
  
  remediations: [
    {
      id: "kill_idle_connections",
      name: "Kill Idle DB Connections",
      description: "Terminate idle database connections older than 5 minutes",
      type: "automated",
      action: {
        type: "run_script",
        config: { script: "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '5 minutes' AND datname = 'payments'" },
      },
    },
    {
      id: "rollback_deployment",
      name: "Rollback to Previous Version",
      description: "Roll back the payment service to the previous deployment",
      type: "automated",
      action: {
        type: "rollback",
        config: { deployment: "payment-service", namespace: "production" },
      },
      requiresApproval: true,
    },
    {
      id: "restart_pods",
      name: "Restart Payment Pods",
      description: "Rolling restart of all payment service pods",
      type: "automated",
      action: {
        type: "restart_service",
        config: { deployment: "payment-service", namespace: "production" },
      },
    },
    {
      id: "escalate_oncall",
      name: "Escalate to On-Call",
      description: "Page the on-call engineer with full diagnostic context",
      type: "escalate",
    },
  ],
  
  escalation: {
    primary: "#incidents-payment",
    secondary: "#sre-escalation",
    escalateAfterMinutes: 15,
  },
};
```

## Step 2: Build the Diagnostic Executor

The executor runs each diagnostic step in parallel, collects results, and evaluates conditions against the decision tree.

```typescript
// src/executor/diagnostic-runner.ts — Execute diagnostic steps and evaluate results
import { DiagnosticStep, Runbook } from "../types";

interface DiagnosticResult {
  stepId: string;
  name: string;
  status: "healthy" | "warning" | "critical" | "error";
  rawValue: any;
  message: string;
  durationMs: number;
}

interface RunbookExecution {
  runbookId: string;
  triggeredAt: Date;
  diagnosticResults: DiagnosticResult[];
  recommendedActions: string[];
  overallSeverity: "healthy" | "warning" | "critical";
  timeline: Array<{ timestamp: Date; event: string }>;
}

export async function executeDiagnostics(runbook: Runbook): Promise<RunbookExecution> {
  const execution: RunbookExecution = {
    runbookId: runbook.id,
    triggeredAt: new Date(),
    diagnosticResults: [],
    recommendedActions: [],
    overallSeverity: "healthy",
    timeline: [{ timestamp: new Date(), event: `Runbook "${runbook.name}" triggered` }],
  };

  // Run all diagnostics in parallel with individual timeouts
  const results = await Promise.allSettled(
    runbook.diagnostics.map((step) => runDiagnosticStep(step))
  );

  for (let i = 0; i < results.length; i++) {
    const step = runbook.diagnostics[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      execution.diagnosticResults.push(result.value);
      execution.timeline.push({
        timestamp: new Date(),
        event: `${step.name}: ${result.value.status} — ${result.value.message}`,
      });
    } else {
      execution.diagnosticResults.push({
        stepId: step.id,
        name: step.name,
        status: "error",
        rawValue: null,
        message: `Failed: ${result.reason}`,
        durationMs: 0,
      });
    }
  }

  // Evaluate decision tree
  const resultMap = new Map(execution.diagnosticResults.map((r) => [r.stepId, r]));

  for (const decision of runbook.decisionTree) {
    if (evaluateCondition(decision.condition, resultMap)) {
      execution.recommendedActions.push(...decision.then);
      execution.timeline.push({
        timestamp: new Date(),
        event: `Decision: ${decision.description}`,
      });
    }
  }

  // Set overall severity
  const statuses = execution.diagnosticResults.map((r) => r.status);
  execution.overallSeverity = statuses.includes("critical") ? "critical"
    : statuses.includes("warning") ? "warning" : "healthy";

  return execution;
}

async function runDiagnosticStep(step: DiagnosticStep): Promise<DiagnosticResult> {
  const start = Date.now();

  try {
    let rawValue: any;

    switch (step.type) {
      case "prometheus_query": {
        const res = await fetch(
          `${process.env.PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(step.config.query)}`
        );
        const data = await res.json();
        rawValue = data.data?.result?.[0]?.value?.[1] || null;
        break;
      }

      case "http_check": {
        const checks = await Promise.allSettled(
          step.config.urls.map(async (url: any) => {
            const checkStart = Date.now();
            const res = await fetch(url.url, { signal: AbortSignal.timeout(step.timeout * 1000) });
            return { name: url.name, status: res.status, latencyMs: Date.now() - checkStart };
          })
        );
        rawValue = checks.map((c, i) => ({
          name: step.config.urls[i].name,
          ...(c.status === "fulfilled" ? c.value : { status: 0, latencyMs: -1, error: c.reason?.message }),
        }));
        break;
      }

      case "shell_command": {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(step.config.command, { timeout: step.timeout * 1000 });
        rawValue = stdout.trim();
        break;
      }

      case "database_query": {
        const { pool } = await import("../db");
        const { rows } = await pool.query(step.config.query);
        rawValue = rows;
        break;
      }

      case "log_search": {
        // Search recent logs for patterns
        rawValue = "log search not implemented";
        break;
      }
    }

    // Evaluate health status
    const status = evaluateHealth(rawValue, step.interpret);
    const durationMs = Date.now() - start;

    return {
      stepId: step.id,
      name: step.name,
      status,
      rawValue,
      message: `${step.name}: ${status} (${JSON.stringify(rawValue).slice(0, 200)})`,
      durationMs,
    };
  } catch (error) {
    return {
      stepId: step.id,
      name: step.name,
      status: "error",
      rawValue: null,
      message: `${step.name}: error — ${(error as Error).message}`,
      durationMs: Date.now() - start,
    };
  }
}

function evaluateHealth(
  value: any,
  interpret: { healthy: string; warning: string; critical: string }
): "healthy" | "warning" | "critical" {
  // Simple evaluation — in production, use a proper expression evaluator
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (typeof numValue === "number" && !isNaN(numValue)) {
    // Parse threshold from expression like "value < 70"
    const critMatch = interpret.critical.match(/value\s*(>=?|<=?|===?)\s*(\d+)/);
    const warnMatch = interpret.warning.match(/value\s*(>=?|<=?|===?)\s*(\d+)/);

    if (critMatch) {
      const threshold = parseFloat(critMatch[2]);
      if (critMatch[1].includes(">") && numValue >= threshold) return "critical";
      if (critMatch[1].includes("<") && numValue <= threshold) return "critical";
    }
    if (warnMatch) {
      const threshold = parseFloat(warnMatch[2]);
      if (warnMatch[1].includes(">") && numValue >= threshold) return "warning";
      if (warnMatch[1].includes("<") && numValue <= threshold) return "warning";
    }
  }

  return "healthy";
}

function evaluateCondition(
  condition: string,
  results: Map<string, DiagnosticResult>
): boolean {
  // Parse condition like "diagnostics.check_db_connections.status === 'critical'"
  const match = condition.match(/diagnostics\.(\w+)\.status\s*===\s*'(\w+)'/);
  if (!match) return false;

  const [, stepId, expectedStatus] = match;
  const result = results.get(stepId);
  return result?.status === expectedStatus;
}
```

## Step 3: Build the Incident Response API

The API triggers runbooks, tracks executions, and provides a Slack-friendly interface for responders.

```typescript
// src/routes/incidents.ts — Incident response API
import { Hono } from "hono";
import { executeDiagnostics } from "../executor/diagnostic-runner";
import { pool } from "../db";
import { PAYMENT_SLOW_RUNBOOK } from "../types";

const app = new Hono();

// Registry of available runbooks
const runbooks = new Map([
  ["payment-service-slow", PAYMENT_SLOW_RUNBOOK],
]);

// Trigger a runbook (from alert webhook or manual)
app.post("/incidents/trigger", async (c) => {
  const { runbookId, alertName, context } = await c.req.json();

  const runbook = runbooks.get(runbookId);
  if (!runbook) return c.json({ error: "Unknown runbook" }, 404);

  // Execute diagnostics
  const execution = await executeDiagnostics(runbook);

  // Save execution record
  await pool.query(
    `INSERT INTO incident_executions (id, runbook_id, triggered_at, severity, diagnostic_results, recommended_actions, timeline)
     VALUES (gen_random_uuid(), $1, NOW(), $2, $3, $4, $5)`,
    [runbookId, execution.overallSeverity, JSON.stringify(execution.diagnosticResults),
     execution.recommendedActions, JSON.stringify(execution.timeline)]
  );

  // Format for Slack notification
  const slackMessage = formatSlackMessage(execution, runbook);
  await sendSlackMessage(runbook.escalation.primary, slackMessage);

  return c.json({
    execution,
    message: `Runbook executed. ${execution.diagnosticResults.length} diagnostics run, ${execution.recommendedActions.length} actions recommended.`,
  });
});

// List recent incidents
app.get("/incidents", async (c) => {
  const { rows } = await pool.query(
    "SELECT * FROM incident_executions ORDER BY triggered_at DESC LIMIT 50"
  );
  return c.json({ incidents: rows });
});

function formatSlackMessage(execution: any, runbook: any) {
  const severityEmoji = { critical: "🔴", warning: "🟡", healthy: "🟢" };
  const emoji = severityEmoji[execution.overallSeverity as keyof typeof severityEmoji];

  const diagnosticSummary = execution.diagnosticResults
    .map((d: any) => `${severityEmoji[d.status as keyof typeof severityEmoji] || "⚪"} ${d.name}: ${d.status}`)
    .join("\n");

  return {
    text: `${emoji} *${runbook.name}* — ${execution.overallSeverity.toUpperCase()}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} ${runbook.name}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Severity:* ${execution.overallSeverity}\n*Service:* ${runbook.service}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Diagnostics:*\n${diagnosticSummary}` } },
      ...(execution.recommendedActions.length > 0 ? [
        { type: "section", text: { type: "mrkdwn", text: `*Recommended Actions:*\n${execution.recommendedActions.map((a: string) => `• ${a}`).join("\n")}` } },
      ] : []),
    ],
  };
}

async function sendSlackMessage(channel: string, message: any) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ...message }),
  }).catch(() => {});
}

export default app;
```

## Results

After codifying the top 15 incident runbooks:

- **MTTR dropped from 47 minutes to 18 minutes** — automated diagnostics collect evidence in 30 seconds that previously took 15 minutes of manual investigation
- **Junior engineer incident resolution improved 3x** — decision trees guide them to the right remediation; no more guessing what to check or in what order
- **Diagnostic coverage: 100% of common root causes** — the top 5 incident types (DB connections, OOM, bad deploy, downstream failure, certificate expiry) are all covered with automated checks
- **Incident context preserved automatically** — every diagnostic result, timeline event, and action is logged; post-incident reviews have perfect data instead of reconstructing from memory
- **On-call handoff improved** — incoming on-call engineer reviews the runbook execution log and picks up where the previous responder left off, with full context
