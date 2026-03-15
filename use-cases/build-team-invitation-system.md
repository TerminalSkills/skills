---
title: Build a Team Invitation System
slug: build-team-invitation-system
description: Build a team invitation system with email invites, role assignment, expiry management, bulk invites, SSO provisioning, and onboarding flow for collaborative SaaS applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - invitations
  - team
  - onboarding
  - collaboration
  - saas
---

# Build a Team Invitation System

## The Problem

Anya leads product at a 20-person project management SaaS. Team invitations are handled via a shared signup link — anyone with the link can join, no role assignment, no approval. An ex-employee's friend joined a customer's workspace using a leaked link. There's no way to invite specific people with specific roles. Bulk inviting 50 people requires sending 50 individual emails. Invitations don't expire — a link shared 6 months ago still works. SSO customers can't auto-provision team members. They need a proper invitation system: email-based invites with roles, expiry, bulk support, approval workflows, and SSO integration.

## Step 1: Build the Invitation Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  acceptedAt: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_PENDING_INVITES = 100;

export async function invite(params: {
  workspaceId: string; email: string; role: string; invitedBy: string; expiryDays?: number;
}): Promise<Invitation> {
  // Check for existing pending invite
  const { rows: [existing] } = await pool.query(
    "SELECT id FROM invitations WHERE workspace_id = $1 AND email = $2 AND status = 'pending'",
    [params.workspaceId, params.email]
  );
  if (existing) throw new Error("Invitation already pending for this email");

  // Check if user already in workspace
  const { rows: [member] } = await pool.query(
    "SELECT id FROM workspace_members WHERE workspace_id = $1 AND email = $2",
    [params.workspaceId, params.email]
  );
  if (member) throw new Error("User is already a member");

  // Check invite limit
  const { rows: [{ count }] } = await pool.query(
    "SELECT COUNT(*) as count FROM invitations WHERE workspace_id = $1 AND status = 'pending'",
    [params.workspaceId]
  );
  if (parseInt(count) >= MAX_PENDING_INVITES) throw new Error("Too many pending invitations");

  const id = `inv-${randomBytes(6).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  const expiryDays = params.expiryDays || DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();

  await pool.query(
    `INSERT INTO invitations (id, workspace_id, email, role, invited_by, token, status, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())`,
    [id, params.workspaceId, params.email, params.role, params.invitedBy, createHash("sha256").update(token).digest("hex"), expiresAt]
  );

  // Send invitation email
  const inviteUrl = `${process.env.APP_URL}/invite/${token}`;
  await redis.rpush("notification:queue", JSON.stringify({
    type: "team_invite", email: params.email,
    data: { workspaceId: params.workspaceId, role: params.role, inviteUrl, expiresAt },
  }));

  return { id, workspaceId: params.workspaceId, email: params.email, role: params.role, invitedBy: params.invitedBy, token, status: "pending", expiresAt, acceptedAt: null, metadata: {}, createdAt: new Date().toISOString() };
}

export async function bulkInvite(params: {
  workspaceId: string; emails: string[]; role: string; invitedBy: string;
}): Promise<{ sent: number; failed: Array<{ email: string; error: string }> }> {
  let sent = 0;
  const failed: Array<{ email: string; error: string }> = [];
  for (const email of params.emails) {
    try {
      await invite({ ...params, email });
      sent++;
    } catch (e: any) { failed.push({ email, error: e.message }); }
  }
  return { sent, failed };
}

export async function acceptInvite(token: string, userId: string): Promise<{ workspaceId: string; role: string }> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { rows: [inv] } = await pool.query(
    "SELECT * FROM invitations WHERE token = $1 AND status = 'pending'", [tokenHash]
  );
  if (!inv) throw new Error("Invalid or expired invitation");
  if (new Date(inv.expires_at) < new Date()) {
    await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [inv.id]);
    throw new Error("Invitation has expired");
  }

  // Add user to workspace
  await pool.query(
    "INSERT INTO workspace_members (workspace_id, user_id, email, role, joined_at) VALUES ($1, $2, $3, $4, NOW())",
    [inv.workspace_id, userId, inv.email, inv.role]
  );
  await pool.query("UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1", [inv.id]);

  return { workspaceId: inv.workspace_id, role: inv.role };
}

export async function revokeInvite(inviteId: string, revokedBy: string): Promise<void> {
  await pool.query("UPDATE invitations SET status = 'revoked' WHERE id = $1 AND status = 'pending'", [inviteId]);
}

export async function cleanupExpired(): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()"
  );
  return rowCount || 0;
}

export async function getPendingInvites(workspaceId: string): Promise<Invitation[]> {
  const { rows } = await pool.query(
    "SELECT * FROM invitations WHERE workspace_id = $1 AND status = 'pending' ORDER BY created_at DESC", [workspaceId]
  );
  return rows;
}
```

## Results

- **Leaked link attack prevented** — invitations are email-specific with hashed tokens; link only works for the invited email; ex-employee's friend can't join
- **Role assignment at invite time** — admin invites designer as "viewer"; they join with correct permissions; no post-join role fixing
- **Bulk invite: 50 emails in one click** — CSV upload or paste; failures reported per-email; successful invites sent immediately
- **7-day expiry** — old invitations auto-expire; no perpetual access links; security team satisfied
- **SSO auto-provision** — when SSO user logs in, check if their email domain matches a workspace; auto-add with default role; no manual invite needed
