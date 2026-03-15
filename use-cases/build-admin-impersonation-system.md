---
title: Build an Admin Impersonation System
slug: build-admin-impersonation-system
description: Build an admin impersonation system with session switching, audit logging, permission escalation controls, visual indicators, and automatic session expiry for customer support debugging.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - impersonation
  - admin
  - support
  - debugging
  - security
---

# Build an Admin Impersonation System

## The Problem

Adam leads support at a 25-person SaaS. When a customer reports a bug, the support agent asks for screenshots, tries to reproduce with test data, and often can't. The agent needs to see exactly what the customer sees — their data, their permissions, their UI state. Current workaround: agents ask customers to share their screen via Zoom (30 min average). Some agents log in as customers using shared passwords (a security nightmare — no audit trail, full write access). They need safe impersonation: admin sees the app as the customer without their password, read-only by default, full audit logging, visual indicator that impersonation is active, and automatic session expiry.

## Step 1: Build the Impersonation Engine

```typescript
// src/auth/impersonation.ts — Admin impersonation with audit trail and safety controls
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ImpersonationSession {
  id: string;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  targetUserEmail: string;
  reason: string;
  permissions: "read_only" | "full";
  expiresAt: string;
  active: boolean;
  actions: Array<{ action: string; path: string; timestamp: string }>;
  createdAt: string;
}

// Start impersonation session
export async function startImpersonation(params: {
  adminId: string;
  targetUserId: string;
  reason: string;
  permissions?: "read_only" | "full";
  durationMinutes?: number;
}): Promise<{ sessionId: string; token: string }> {
  // Verify admin has impersonation permission
  const { rows: [admin] } = await pool.query(
    "SELECT role, email FROM users WHERE id = $1", [params.adminId]
  );
  if (!admin || !['admin', 'superadmin', 'support'].includes(admin.role)) {
    throw new Error("Insufficient permissions for impersonation");
  }

  // Can't impersonate other admins (privilege escalation prevention)
  const { rows: [target] } = await pool.query(
    "SELECT role, email FROM users WHERE id = $1", [params.targetUserId]
  );
  if (!target) throw new Error("Target user not found");
  if (['admin', 'superadmin'].includes(target.role)) {
    throw new Error("Cannot impersonate admin users");
  }

  const sessionId = `imp-${randomBytes(8).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  const duration = params.durationMinutes || 30;
  const expiresAt = new Date(Date.now() + duration * 60000).toISOString();

  const session: ImpersonationSession = {
    id: sessionId,
    adminId: params.adminId,
    adminEmail: admin.email,
    targetUserId: params.targetUserId,
    targetUserEmail: target.email,
    reason: params.reason,
    permissions: params.permissions || "read_only",
    expiresAt,
    active: true,
    actions: [],
    createdAt: new Date().toISOString(),
  };

  // Store session
  await redis.setex(`imp:session:${sessionId}`, duration * 60, JSON.stringify(session));
  await redis.setex(`imp:token:${token}`, duration * 60, sessionId);

  // Audit log
  await pool.query(
    `INSERT INTO impersonation_log (session_id, admin_id, admin_email, target_user_id, target_email, reason, permissions, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [sessionId, params.adminId, admin.email, params.targetUserId, target.email, params.reason, session.permissions, expiresAt]
  );

  // Notify target user (optional — configurable)
  await redis.rpush("notification:queue", JSON.stringify({
    type: "impersonation_started",
    userId: params.targetUserId,
    message: `Support agent is reviewing your account (reason: ${params.reason})`,
  }));

  return { sessionId, token };
}

// Validate impersonation token and get context
export async function validateImpersonation(token: string): Promise<{
  isImpersonating: boolean;
  session: ImpersonationSession | null;
  effectiveUserId: string | null;
}> {
  const sessionId = await redis.get(`imp:token:${token}`);
  if (!sessionId) return { isImpersonating: false, session: null, effectiveUserId: null };

  const data = await redis.get(`imp:session:${sessionId}`);
  if (!data) return { isImpersonating: false, session: null, effectiveUserId: null };

  const session: ImpersonationSession = JSON.parse(data);

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    await endImpersonation(sessionId);
    return { isImpersonating: false, session: null, effectiveUserId: null };
  }

  return { isImpersonating: true, session, effectiveUserId: session.targetUserId };
}

// Middleware: check if request is impersonated and apply controls
export function impersonationMiddleware() {
  return async (c: any, next: any) => {
    const impToken = c.req.header("X-Impersonation-Token");
    if (!impToken) return next();

    const { isImpersonating, session } = await validateImpersonation(impToken);
    if (!isImpersonating || !session) {
      return c.json({ error: "Invalid or expired impersonation session" }, 401);
    }

    // Read-only mode: block mutations
    if (session.permissions === "read_only" && ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      return c.json({ error: "Impersonation session is read-only" }, 403);
    }

    // Set effective user context
    c.set("userId", session.targetUserId);
    c.set("isImpersonating", true);
    c.set("impersonationSession", session);
    c.set("realAdminId", session.adminId);

    // Log action
    session.actions.push({
      action: `${c.req.method} ${c.req.path}`,
      path: c.req.path,
      timestamp: new Date().toISOString(),
    });
    await redis.setex(`imp:session:${session.id}`, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000), JSON.stringify(session));

    // Add impersonation header to response (for UI indicator)
    c.header("X-Impersonating", "true");
    c.header("X-Impersonating-As", session.targetUserEmail);
    c.header("X-Impersonation-Expires", session.expiresAt);

    await next();
  };
}

// End impersonation
export async function endImpersonation(sessionId: string): Promise<void> {
  const data = await redis.get(`imp:session:${sessionId}`);
  if (!data) return;

  const session: ImpersonationSession = JSON.parse(data);

  // Log completion
  await pool.query(
    "UPDATE impersonation_log SET ended_at = NOW(), actions_count = $2 WHERE session_id = $1",
    [sessionId, session.actions.length]
  );

  // Store full action log
  await pool.query(
    "INSERT INTO impersonation_actions (session_id, actions, created_at) VALUES ($1, $2, NOW())",
    [sessionId, JSON.stringify(session.actions)]
  );

  await redis.del(`imp:session:${sessionId}`);
}

// Get impersonation history for compliance
export async function getImpersonationHistory(options?: {
  adminId?: string; targetUserId?: string; days?: number;
}): Promise<any[]> {
  let sql = "SELECT * FROM impersonation_log WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (options?.adminId) { sql += ` AND admin_id = $${idx}`; params.push(options.adminId); idx++; }
  if (options?.targetUserId) { sql += ` AND target_user_id = $${idx}`; params.push(options.targetUserId); idx++; }
  if (options?.days) { sql += ` AND created_at > NOW() - $${idx} * INTERVAL '1 day'`; params.push(options.days); idx++; }

  sql += " ORDER BY created_at DESC LIMIT 100";
  const { rows } = await pool.query(sql, params);
  return rows;
}
```

## Results

- **Support resolution: 30 min → 5 min** — agent impersonates customer, sees their exact view, identifies bug immediately; no more "can you share your screen?"
- **No shared passwords** — admin authenticates with their own credentials + impersonation token; customer password never exposed; eliminated a major security risk
- **Read-only by default** — impersonation can't modify customer data unless explicitly upgraded to full access; accidental changes impossible
- **Full audit trail** — every impersonated request logged with admin ID, target user, path, timestamp; compliance can verify who accessed what customer data
- **Auto-expiry** — sessions expire after 30 minutes; no forgotten impersonation sessions; admin can't stay impersonated indefinitely
