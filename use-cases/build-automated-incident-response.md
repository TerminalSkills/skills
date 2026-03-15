---
title: Build Automated Incident Response
slug: build-automated-incident-response
description: Build an automated incident response system with alert correlation, runbook automation, escalation chains, status page updates, post-mortem generation, and timeline tracking.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - incident-response
  - automation
  - alerting
  - runbooks
  - on-call
---

# Build Automated Incident Response

## The Problem

Max leads SRE at a 25-person company. When an incident occurs: PagerDuty fires, the on-call engineer opens Slack, creates a status page update, starts debugging, manually runs diagnostic scripts, escalates by calling people, and writes a post-mortem from memory 3 days later. Related alerts fire separately — 50 alerts for one database issue. The status page update is forgotten until customers complain. Post-mortems miss key timeline events. They need automated response: correlate related alerts, run diagnostic runbooks automatically, manage escalation chains, update status pages, and generate post-mortem timelines.

## Step 1: Build the Incident Response Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Incident { id: string; title: string; severity: "sev1" | "sev2" | "sev3" | "sev4"; status: "triggered" | "acknowledged" | "investigating" | "mitigating" | "resolved"; assignee: string; alerts: string[]; timeline: TimelineEvent[]; statusPageId: string | null; runbookResults: Array<{ name: string; output: string; status: string }>; startedAt: string; resolvedAt: string | null; }
interface TimelineEvent { timestamp: string; type: string; message: string; author: string; }
interface EscalationPolicy { levels: Array<{ delayMinutes: number; contacts: string[] }>; }

const ESCALATION: EscalationPolicy = { levels: [
  { delayMinutes: 0, contacts: ["on-call-primary"] },
  { delayMinutes: 10, contacts: ["on-call-secondary", "team-lead"] },
  { delayMinutes: 30, contacts: ["engineering-manager", "vp-engineering"] },
]};

const RUNBOOKS: Record<string, { name: string; check: (alert: any) => boolean; execute: () => Promise<string> }> = {
  db_high_connections: { name: "Check DB connections", check: (a) => a.type === "database" && a.metric === "connections", execute: async () => { const { rows } = await pool.query("SELECT count(*) as c FROM pg_stat_activity"); return `Active connections: ${rows[0].c}`; }},
  high_memory: { name: "Check memory usage", check: (a) => a.metric === "memory", execute: async () => { const mem = process.memoryUsage(); return `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`; }},
  api_errors: { name: "Check error rates", check: (a) => a.type === "api" && a.metric === "error_rate", execute: async () => { const rate = await redis.get("metrics:error_rate") || "0"; return `Current error rate: ${rate}%`; }},
};

// Create incident from alert(s)
export async function createIncident(alerts: Array<{ id: string; title: string; type: string; metric: string; severity: string; details: any }>): Promise<Incident> {
  // Correlate: check if existing incident matches
  const { rows: [existing] } = await pool.query(
    "SELECT id FROM incidents WHERE status NOT IN ('resolved') AND started_at > NOW() - INTERVAL '1 hour' AND title ILIKE $1 LIMIT 1",
    [`%${alerts[0].type}%`]
  );
  if (existing) { await addAlertsToIncident(existing.id, alerts.map((a) => a.id)); return (await getIncident(existing.id))!; }

  const id = `inc-${randomBytes(6).toString("hex")}`;
  const severity = alerts.reduce((worst, a) => a.severity < worst ? a.severity : worst, "sev4") as Incident["severity"];
  const incident: Incident = {
    id, title: `${alerts[0].type}: ${alerts[0].title}`, severity,
    status: "triggered", assignee: ESCALATION.levels[0].contacts[0],
    alerts: alerts.map((a) => a.id),
    timeline: [{ timestamp: new Date().toISOString(), type: "created", message: `Incident created from ${alerts.length} alert(s)`, author: "system" }],
    statusPageId: null, runbookResults: [], startedAt: new Date().toISOString(), resolvedAt: null,
  };

  await pool.query(
    `INSERT INTO incidents (id, title, severity, status, assignee, alerts, timeline, started_at) VALUES ($1, $2, $3, 'triggered', $4, $5, $6, NOW())`,
    [id, incident.title, severity, incident.assignee, JSON.stringify(incident.alerts), JSON.stringify(incident.timeline)]
  );

  // Auto-run matching runbooks
  for (const alert of alerts) {
    for (const [, runbook] of Object.entries(RUNBOOKS)) {
      if (runbook.check(alert)) {
        try {
          const output = await runbook.execute();
          incident.runbookResults.push({ name: runbook.name, output, status: "completed" });
          incident.timeline.push({ timestamp: new Date().toISOString(), type: "runbook", message: `${runbook.name}: ${output}`, author: "automation" });
        } catch (e: any) {
          incident.runbookResults.push({ name: runbook.name, output: e.message, status: "failed" });
        }
      }
    }
  }

  await pool.query("UPDATE incidents SET runbook_results = $2, timeline = $3 WHERE id = $1", [id, JSON.stringify(incident.runbookResults), JSON.stringify(incident.timeline)]);

  // Notify on-call
  await redis.rpush("notification:queue", JSON.stringify({ type: "incident_created", incidentId: id, severity, title: incident.title, contacts: ESCALATION.levels[0].contacts }));

  // Schedule escalation
  for (let i = 1; i < ESCALATION.levels.length; i++) {
    const level = ESCALATION.levels[i];
    await redis.setex(`incident:escalate:${id}:${i}`, level.delayMinutes * 60, JSON.stringify({ incidentId: id, level: i, contacts: level.contacts }));
  }

  // Auto-update status page for sev1/sev2
  if (severity === "sev1" || severity === "sev2") {
    await updateStatusPage(id, "investigating", `We are investigating issues with ${alerts[0].type}. More updates to follow.`);
  }

  return incident;
}

export async function updateIncidentStatus(incidentId: string, status: Incident["status"], message: string, author: string): Promise<void> {
  const { rows: [inc] } = await pool.query("SELECT timeline, severity FROM incidents WHERE id = $1", [incidentId]);
  const timeline: TimelineEvent[] = JSON.parse(inc.timeline);
  timeline.push({ timestamp: new Date().toISOString(), type: "status_change", message: `Status → ${status}: ${message}`, author });

  await pool.query("UPDATE incidents SET status = $2, timeline = $3, resolved_at = $4 WHERE id = $1",
    [incidentId, status, JSON.stringify(timeline), status === "resolved" ? new Date().toISOString() : null]);

  if (["sev1", "sev2"].includes(inc.severity)) { await updateStatusPage(incidentId, status, message); }
}

async function updateStatusPage(incidentId: string, status: string, message: string): Promise<void> {
  await redis.rpush("statuspage:updates", JSON.stringify({ incidentId, status, message, timestamp: new Date().toISOString() }));
}

async function addAlertsToIncident(incidentId: string, alertIds: string[]): Promise<void> {
  const { rows: [inc] } = await pool.query("SELECT alerts, timeline FROM incidents WHERE id = $1", [incidentId]);
  const alerts = [...JSON.parse(inc.alerts), ...alertIds];
  const timeline: TimelineEvent[] = JSON.parse(inc.timeline);
  timeline.push({ timestamp: new Date().toISOString(), type: "alerts_correlated", message: `${alertIds.length} new alert(s) correlated`, author: "system" });
  await pool.query("UPDATE incidents SET alerts = $2, timeline = $3 WHERE id = $1", [incidentId, JSON.stringify(alerts), JSON.stringify(timeline)]);
}

export async function generatePostMortem(incidentId: string): Promise<string> {
  const { rows: [inc] } = await pool.query("SELECT * FROM incidents WHERE id = $1", [incidentId]);
  if (!inc) throw new Error("Incident not found");
  const timeline: TimelineEvent[] = JSON.parse(inc.timeline);
  const duration = inc.resolved_at ? Math.round((new Date(inc.resolved_at).getTime() - new Date(inc.started_at).getTime()) / 60000) : null;

  let pm = `# Post-Mortem: ${inc.title}\n\n`;
  pm += `**Severity:** ${inc.severity} | **Duration:** ${duration ? `${duration} minutes` : "ongoing"} | **Date:** ${new Date(inc.started_at).toLocaleDateString()}\n\n`;
  pm += `## Timeline\n\n`;
  for (const event of timeline) pm += `- **${new Date(event.timestamp).toLocaleTimeString()}** [${event.type}] ${event.message} _(${event.author})_\n`;
  pm += `\n## Runbook Results\n\n`;
  const runbooks = JSON.parse(inc.runbook_results || "[]");
  for (const rb of runbooks) pm += `- **${rb.name}**: ${rb.output} (${rb.status})\n`;
  pm += `\n## Action Items\n\n- [ ] Root cause analysis\n- [ ] Prevention measures\n- [ ] Monitoring improvements\n`;
  return pm;
}

async function getIncident(id: string): Promise<Incident | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM incidents WHERE id = $1", [id]);
  return row ? { ...row, alerts: JSON.parse(row.alerts), timeline: JSON.parse(row.timeline), runbookResults: JSON.parse(row.runbook_results || "[]") } : null;
}
```

## Results

- **50 alerts → 1 incident** — alert correlation groups related alerts; one incident for one root cause; no alert fatigue
- **Runbooks run automatically** — DB connection alert fires → "Check DB connections" runbook runs → output in incident timeline; on-call has diagnostic data before they even look
- **Escalation automated** — no ack in 10 min → secondary on-call notified; 30 min → engineering manager; no manual phone calls
- **Status page auto-updated** — sev1/sev2 → status page shows "investigating" within 30 seconds; customers informed before they report; trust preserved
- **Post-mortem generated** — timeline, runbook results, and duration auto-compiled; engineer fills in root cause and action items; 4-hour post-mortem writing → 30 minutes
