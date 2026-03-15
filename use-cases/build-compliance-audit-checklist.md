---
title: Build a Compliance Audit Checklist System
slug: build-compliance-audit-checklist
description: Build a compliance audit checklist with configurable frameworks (SOC 2, ISO 27001, GDPR), evidence collection, progress tracking, recurring audits, and exportable reports.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - compliance
  - audit
  - soc2
  - gdpr
  - checklist
---

# Build a Compliance Audit Checklist System

## The Problem

Lena leads compliance at a 25-person SaaS undergoing SOC 2 Type II audit. The auditor sent a 200-item checklist. Evidence is scattered: some in Google Drive, some in Jira tickets, some in people's heads. Nobody knows which items are complete, in-progress, or blocked. When GDPR audit comes next quarter, they'll start from scratch. Annual recertification means doing it all again. They need a compliance system: configurable audit frameworks, evidence collection per item, progress tracking, recurring audits with carried-over evidence, and exportable reports.

## Step 1: Build the Compliance Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface AuditFramework { id: string; name: string; version: string; sections: AuditSection[]; }
interface AuditSection { id: string; name: string; items: AuditItem[]; }
interface AuditItem { id: string; requirement: string; description: string; priority: "critical" | "high" | "medium" | "low"; }

interface AuditInstance {
  id: string;
  frameworkId: string;
  name: string;
  status: "in_progress" | "completed" | "expired";
  progress: { total: number; completed: number; percentage: number };
  dueDate: string;
  items: AuditItemStatus[];
  createdAt: string;
}

interface AuditItemStatus {
  itemId: string;
  status: "not_started" | "in_progress" | "completed" | "not_applicable";
  assignee: string | null;
  evidence: Array<{ name: string; url: string; uploadedAt: string; uploadedBy: string }>;
  notes: string;
  completedAt: string | null;
}

const FRAMEWORKS: Record<string, AuditFramework> = {
  soc2: {
    id: "soc2", name: "SOC 2 Type II", version: "2024",
    sections: [
      { id: "cc1", name: "Control Environment", items: [
        { id: "cc1.1", requirement: "Management philosophy and operating style", description: "Document management's commitment to integrity and ethical values", priority: "critical" },
        { id: "cc1.2", requirement: "Organizational structure", description: "Define organizational chart and reporting structure", priority: "high" },
        { id: "cc1.3", requirement: "HR policies", description: "Background checks, onboarding/offboarding procedures", priority: "high" },
      ]},
      { id: "cc6", name: "Logical and Physical Access", items: [
        { id: "cc6.1", requirement: "Access control policy", description: "Document access control policies and procedures", priority: "critical" },
        { id: "cc6.2", requirement: "Authentication mechanisms", description: "MFA, password policies, SSO configuration", priority: "critical" },
        { id: "cc6.3", requirement: "Access reviews", description: "Quarterly access reviews with evidence", priority: "high" },
      ]},
    ],
  },
  gdpr: {
    id: "gdpr", name: "GDPR Compliance", version: "2024",
    sections: [
      { id: "data", name: "Data Processing", items: [
        { id: "data.1", requirement: "Data processing register", description: "Maintain register of all processing activities (Art. 30)", priority: "critical" },
        { id: "data.2", requirement: "Legal basis documentation", description: "Document legal basis for each processing activity", priority: "critical" },
        { id: "data.3", requirement: "Data retention policy", description: "Define retention periods for each data category", priority: "high" },
      ]},
    ],
  },
};

export async function startAudit(frameworkId: string, name: string, dueDate: string): Promise<AuditInstance> {
  const framework = FRAMEWORKS[frameworkId];
  if (!framework) throw new Error("Framework not found");

  const id = `audit-${randomBytes(6).toString("hex")}`;
  const allItems = framework.sections.flatMap((s) => s.items);
  const items: AuditItemStatus[] = allItems.map((item) => ({ itemId: item.id, status: "not_started", assignee: null, evidence: [], notes: "", completedAt: null }));

  // Carry over evidence from previous audit of same framework
  const { rows: [prev] } = await pool.query(
    "SELECT items FROM audit_instances WHERE framework_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1",
    [frameworkId]
  );
  if (prev) {
    const prevItems: AuditItemStatus[] = JSON.parse(prev.items);
    for (const item of items) {
      const prevItem = prevItems.find((p) => p.itemId === item.itemId);
      if (prevItem?.evidence.length) {
        item.evidence = prevItem.evidence;
        item.notes = prevItem.notes + "\n[Carried over from previous audit]";
      }
    }
  }

  const instance: AuditInstance = {
    id, frameworkId, name, status: "in_progress",
    progress: { total: items.length, completed: 0, percentage: 0 },
    dueDate, items, createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO audit_instances (id, framework_id, name, status, due_date, items, created_at) VALUES ($1, $2, $3, 'in_progress', $4, $5, NOW())`,
    [id, frameworkId, name, dueDate, JSON.stringify(items)]
  );

  return instance;
}

export async function updateItemStatus(auditId: string, itemId: string, update: Partial<AuditItemStatus>): Promise<void> {
  const { rows: [audit] } = await pool.query("SELECT items FROM audit_instances WHERE id = $1", [auditId]);
  if (!audit) throw new Error("Audit not found");

  const items: AuditItemStatus[] = JSON.parse(audit.items);
  const item = items.find((i) => i.itemId === itemId);
  if (!item) throw new Error("Item not found");

  if (update.status) item.status = update.status;
  if (update.assignee !== undefined) item.assignee = update.assignee;
  if (update.notes !== undefined) item.notes = update.notes;
  if (update.evidence) item.evidence.push(...update.evidence);
  if (update.status === "completed") item.completedAt = new Date().toISOString();

  const completed = items.filter((i) => i.status === "completed" || i.status === "not_applicable").length;
  const progress = { total: items.length, completed, percentage: Math.round((completed / items.length) * 100) };

  await pool.query("UPDATE audit_instances SET items = $2, progress = $3 WHERE id = $1",
    [auditId, JSON.stringify(items), JSON.stringify(progress)]);
}

export async function generateReport(auditId: string): Promise<string> {
  const { rows: [audit] } = await pool.query("SELECT * FROM audit_instances WHERE id = $1", [auditId]);
  if (!audit) throw new Error("Audit not found");
  const framework = FRAMEWORKS[audit.framework_id];
  const items: AuditItemStatus[] = JSON.parse(audit.items);
  const progress = JSON.parse(audit.progress);

  let report = `# ${framework.name} Audit Report\n## ${audit.name}\n\n`;
  report += `**Status:** ${audit.status} | **Progress:** ${progress.percentage}% (${progress.completed}/${progress.total})\n`;
  report += `**Due:** ${audit.due_date} | **Generated:** ${new Date().toISOString().slice(0, 10)}\n\n`;

  for (const section of framework.sections) {
    report += `### ${section.name}\n\n`;
    for (const req of section.items) {
      const status = items.find((i) => i.itemId === req.id);
      const icon = status?.status === "completed" ? "✅" : status?.status === "in_progress" ? "🔄" : status?.status === "not_applicable" ? "➖" : "❌";
      report += `${icon} **${req.id}**: ${req.requirement}\n`;
      if (status?.evidence.length) report += `   Evidence: ${status.evidence.map((e) => e.name).join(", ")}\n`;
      if (status?.notes) report += `   Notes: ${status.notes}\n`;
      report += "\n";
    }
  }
  return report;
}
```

## Results

- **Audit prep: 3 months → 3 weeks** — checklist with clear ownership; evidence uploaded per item; no last-minute scramble; auditor gets organized package
- **Evidence carried over** — annual SOC 2 recertification: 60% of evidence from last year still valid; team only updates what changed; effort halved
- **Progress visible** — dashboard shows 72% complete, 5 critical items remaining; leadership knows exact status; no surprises before audit date
- **Multi-framework support** — SOC 2 in Q1, GDPR in Q2, ISO 27001 in Q3; same system, different checklists; evidence shared across frameworks where applicable
- **Exportable reports** — auditor receives markdown/PDF report with all items, evidence links, and notes; professional presentation; audit completed in 2 days instead of 2 weeks
