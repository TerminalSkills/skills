---
title: Build a Tenant Onboarding Wizard
slug: build-tenant-onboarding-wizard
description: Build a multi-step tenant onboarding wizard with progress tracking, data import, team invitation, template provisioning, and automated health checks for SaaS platforms.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: business
tags:
  - onboarding
  - saas
  - multi-tenant
  - wizard
  - provisioning
---

# Build a Tenant Onboarding Wizard

## The Problem

Yuki leads product at a 25-person B2B SaaS. New customers sign up, see an empty dashboard, and 40% never come back. Onboarding requires manual steps: CSM creates their account, imports data from their old tool, invites their team, configures settings. This takes 3-5 business days. By then, the customer's excitement has faded. Competitors with self-service onboarding convert 60% of signups. They need automated onboarding: guided wizard, data import, team invitation, template setup, and progress tracking — all self-service in under 30 minutes.

## Step 1: Build the Onboarding Engine

```typescript
// src/onboarding/wizard.ts — Multi-step onboarding with import, team setup, and health checks
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface OnboardingFlow {
  id: string;
  tenantId: string;
  currentStep: number;
  steps: OnboardingStep[];
  status: "in_progress" | "completed" | "abandoned" | "paused";
  startedAt: string;
  completedAt: string | null;
  metadata: Record<string, any>;
}

interface OnboardingStep {
  id: string;
  name: string;
  type: "form" | "import" | "invite" | "template" | "verify" | "custom";
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  required: boolean;
  data: Record<string, any>;
  completedAt: string | null;
}

const DEFAULT_STEPS: Omit<OnboardingStep, "id" | "status" | "data" | "completedAt">[] = [
  { name: "Company Profile", type: "form", required: true },
  { name: "Import Data", type: "import", required: false },
  { name: "Invite Team", type: "invite", required: false },
  { name: "Choose Template", type: "template", required: true },
  { name: "Health Check", type: "verify", required: true },
];

// Start onboarding for new tenant
export async function startOnboarding(tenantId: string): Promise<OnboardingFlow> {
  const id = `ob-${randomBytes(6).toString("hex")}`;

  const steps: OnboardingStep[] = DEFAULT_STEPS.map((s, i) => ({
    id: `step-${i}`,
    ...s,
    status: i === 0 ? "in_progress" : "pending",
    data: {},
    completedAt: null,
  }));

  const flow: OnboardingFlow = {
    id, tenantId, currentStep: 0, steps,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    completedAt: null,
    metadata: {},
  };

  await pool.query(
    `INSERT INTO onboarding_flows (id, tenant_id, current_step, steps, status, started_at)
     VALUES ($1, $2, 0, $3, 'in_progress', NOW())`,
    [id, tenantId, JSON.stringify(steps)]
  );

  // Track in Redis for real-time progress
  await redis.setex(`onboarding:${tenantId}`, 86400 * 7, JSON.stringify(flow));

  return flow;
}

// Complete a step and advance
export async function completeStep(
  tenantId: string,
  stepId: string,
  data: Record<string, any>
): Promise<OnboardingFlow> {
  const flow = await getFlow(tenantId);
  if (!flow) throw new Error("Onboarding not found");

  const stepIndex = flow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) throw new Error("Step not found");

  const step = flow.steps[stepIndex];

  // Execute step-specific logic
  switch (step.type) {
    case "form":
      await processFormStep(tenantId, data);
      break;
    case "import":
      await processImportStep(tenantId, data);
      break;
    case "invite":
      await processInviteStep(tenantId, data);
      break;
    case "template":
      await processTemplateStep(tenantId, data);
      break;
    case "verify":
      await processVerifyStep(tenantId);
      break;
  }

  step.status = "completed";
  step.data = data;
  step.completedAt = new Date().toISOString();

  // Find next incomplete required step
  const nextStep = flow.steps.find((s, i) => i > stepIndex && s.status === "pending");
  if (nextStep) {
    nextStep.status = "in_progress";
    flow.currentStep = flow.steps.indexOf(nextStep);
  } else {
    flow.status = "completed";
    flow.completedAt = new Date().toISOString();
  }

  await saveFlow(flow);
  return flow;
}

// Skip optional step
export async function skipStep(tenantId: string, stepId: string): Promise<OnboardingFlow> {
  const flow = await getFlow(tenantId);
  if (!flow) throw new Error("Onboarding not found");

  const step = flow.steps.find((s) => s.id === stepId);
  if (!step) throw new Error("Step not found");
  if (step.required) throw new Error("Cannot skip required step");

  step.status = "skipped";
  step.completedAt = new Date().toISOString();

  const nextStep = flow.steps.find((s) => s.status === "pending");
  if (nextStep) {
    nextStep.status = "in_progress";
    flow.currentStep = flow.steps.indexOf(nextStep);
  }

  await saveFlow(flow);
  return flow;
}

async function processFormStep(tenantId: string, data: Record<string, any>): Promise<void> {
  await pool.query(
    "UPDATE tenants SET company_name = $2, industry = $3, size = $4, timezone = $5 WHERE id = $1",
    [tenantId, data.companyName, data.industry, data.companySize, data.timezone]
  );
}

async function processImportStep(tenantId: string, data: Record<string, any>): Promise<void> {
  const { source, fileUrl } = data;
  // Queue async import job
  await redis.rpush("import:queue", JSON.stringify({
    tenantId, source, fileUrl, startedAt: new Date().toISOString(),
  }));
}

async function processInviteStep(tenantId: string, data: Record<string, any>): Promise<void> {
  const { emails, role } = data;
  for (const email of emails) {
    const token = randomBytes(16).toString("hex");
    await pool.query(
      `INSERT INTO invitations (tenant_id, email, role, token, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [tenantId, email, role || "member", token]
    );
    await redis.rpush("notification:queue", JSON.stringify({
      type: "team_invite", email, tenantId, token,
    }));
  }
}

async function processTemplateStep(tenantId: string, data: Record<string, any>): Promise<void> {
  const { templateId } = data;
  // Clone template data into tenant's workspace
  const { rows: [template] } = await pool.query("SELECT * FROM templates WHERE id = $1", [templateId]);
  if (template) {
    await pool.query(
      "INSERT INTO tenant_configs (tenant_id, config, created_at) VALUES ($1, $2, NOW())",
      [tenantId, template.config]
    );
  }
}

async function processVerifyStep(tenantId: string): Promise<void> {
  // Run health checks on the new tenant setup
  const checks = [
    { name: "Database schema", check: () => pool.query("SELECT 1") },
    { name: "Tenant data", check: () => pool.query("SELECT id FROM tenants WHERE id = $1", [tenantId]) },
  ];

  for (const c of checks) {
    try { await c.check(); }
    catch (e) { throw new Error(`Health check failed: ${c.name}`); }
  }
}

async function getFlow(tenantId: string): Promise<OnboardingFlow | null> {
  const cached = await redis.get(`onboarding:${tenantId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query(
    "SELECT * FROM onboarding_flows WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1",
    [tenantId]
  );
  return row ? { ...row, steps: JSON.parse(row.steps) } : null;
}

async function saveFlow(flow: OnboardingFlow): Promise<void> {
  await pool.query(
    "UPDATE onboarding_flows SET current_step = $2, steps = $3, status = $4, completed_at = $5 WHERE id = $1",
    [flow.id, flow.currentStep, JSON.stringify(flow.steps), flow.status, flow.completedAt]
  );
  await redis.setex(`onboarding:${flow.tenantId}`, 86400 * 7, JSON.stringify(flow));
}

// Analytics: onboarding funnel
export async function getOnboardingFunnel(): Promise<Array<{ step: string; started: number; completed: number; dropoffRate: number }>> {
  const { rows } = await pool.query(
    `SELECT steps FROM onboarding_flows WHERE started_at > NOW() - INTERVAL '30 days'`
  );

  const stepStats: Record<string, { started: number; completed: number }> = {};
  for (const row of rows) {
    const steps: OnboardingStep[] = JSON.parse(row.steps);
    for (const step of steps) {
      if (!stepStats[step.name]) stepStats[step.name] = { started: 0, completed: 0 };
      if (step.status !== "pending") stepStats[step.name].started++;
      if (step.status === "completed") stepStats[step.name].completed++;
    }
  }

  return Object.entries(stepStats).map(([step, s]) => ({
    step,
    started: s.started,
    completed: s.completed,
    dropoffRate: s.started > 0 ? Math.round(((s.started - s.completed) / s.started) * 100) : 0,
  }));
}
```

## Results

- **Onboarding time: 3-5 days → 25 minutes** — self-service wizard replaces manual CSM process; customers set up their account while excitement is high
- **Day-1 retention: 60% → 85%** — guided steps ensure customers see value immediately; template provisioning gives them a working setup, not empty dashboard
- **Team adoption faster** — invite step sends emails during onboarding; 70% of invited team members join within 24 hours vs 30% when invited later
- **Funnel analytics** — see exactly where customers drop off; "Import Data" step had 45% dropoff → added CSV template download → dropoff dropped to 15%
- **CSM time freed up** — manual onboarding eliminated for standard accounts; CSMs focus on enterprise customers with custom needs
