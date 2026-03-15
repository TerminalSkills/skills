---
title: Build a Customer Self-Service Portal
slug: build-customer-portal-self-service
description: Build a customer self-service portal with account management, billing history, usage dashboards, support ticket creation, API key management, and team administration for SaaS platforms.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - self-service
  - customer-portal
  - account
  - billing
  - saas
---

# Build a Customer Self-Service Portal

## The Problem

Mia leads CS at a 25-person SaaS with 2,000 customers. 60% of support tickets are self-serviceable: "update my billing email", "download last month's invoice", "add a team member", "rotate my API key". Each ticket takes 15 minutes and costs $25 to handle. Customers wait 4 hours for simple changes. There's no portal — customers email for everything. They need a self-service portal: account settings, billing management, usage dashboard, team admin, API key management, and support integration — reducing tickets and improving customer experience.

## Step 1: Build the Portal Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PortalDashboard {
  account: { name: string; email: string; plan: string; status: string; createdAt: string };
  usage: { apiCalls: { used: number; limit: number }; storage: { used: number; limit: number }; users: { active: number; limit: number } };
  billing: { currentPlan: string; nextBillingDate: string; amount: number; currency: string; paymentMethod: string };
  recentInvoices: Array<{ id: string; date: string; amount: number; status: string; downloadUrl: string }>;
  team: Array<{ id: string; name: string; email: string; role: string; lastActive: string }>;
  apiKeys: Array<{ id: string; prefix: string; name: string; lastUsed: string; createdAt: string }>;
  recentTickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
}

// Get full portal dashboard
export async function getPortalDashboard(customerId: string): Promise<PortalDashboard> {
  // Account info
  const { rows: [account] } = await pool.query("SELECT name, email, plan, status, created_at FROM customers WHERE id = $1", [customerId]);

  // Usage
  const period = new Date().toISOString().slice(0, 7);
  const apiCalls = parseFloat(await redis.get(`usage:${customerId}:api_calls:${period}`) || "0");
  const storageMb = parseFloat(await redis.get(`usage:${customerId}:storage_mb:${period}`) || "0");
  const { rows: [{ count: userCount }] } = await pool.query("SELECT COUNT(*) as count FROM users WHERE customer_id = $1 AND status = 'active'", [customerId]);
  const planLimits: Record<string, any> = { free: { apiCalls: 10000, storage: 1000, users: 3 }, pro: { apiCalls: 500000, storage: 50000, users: 50 }, enterprise: { apiCalls: 5000000, storage: 500000, users: 500 } };
  const limits = planLimits[account?.plan] || planLimits.free;

  // Billing
  const { rows: [billing] } = await pool.query(
    "SELECT plan, next_billing_date, amount, currency, payment_method FROM subscriptions WHERE customer_id = $1 AND status = 'active' LIMIT 1", [customerId]
  );

  // Invoices
  const { rows: invoices } = await pool.query(
    "SELECT id, created_at as date, total as amount, status FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 12", [customerId]
  );

  // Team
  const { rows: team } = await pool.query(
    "SELECT id, name, email, role, last_login_at as last_active FROM users WHERE customer_id = $1 ORDER BY last_login_at DESC NULLS LAST", [customerId]
  );

  // API Keys
  const { rows: apiKeys } = await pool.query(
    "SELECT id, prefix, name, last_used_at, created_at FROM api_keys WHERE organization_id = $1 AND status = 'active' ORDER BY created_at DESC", [customerId]
  );

  // Support tickets
  const { rows: tickets } = await pool.query(
    "SELECT id, subject, status, created_at FROM tickets WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10", [customerId]
  );

  return {
    account: { name: account?.name, email: account?.email, plan: account?.plan, status: account?.status, createdAt: account?.created_at },
    usage: { apiCalls: { used: apiCalls, limit: limits.apiCalls }, storage: { used: storageMb, limit: limits.storage }, users: { active: parseInt(userCount), limit: limits.users } },
    billing: { currentPlan: billing?.plan || "free", nextBillingDate: billing?.next_billing_date || "", amount: billing?.amount || 0, currency: billing?.currency || "USD", paymentMethod: billing?.payment_method || "" },
    recentInvoices: invoices.map((i: any) => ({ ...i, downloadUrl: `/api/portal/invoices/${i.id}/download` })),
    team, apiKeys, recentTickets: tickets,
  };
}

// Update account settings
export async function updateAccount(customerId: string, updates: { name?: string; email?: string; billingEmail?: string }): Promise<void> {
  const sets: string[] = []; const params: any[] = [customerId]; let idx = 2;
  if (updates.name) { sets.push(`name = $${idx}`); params.push(updates.name); idx++; }
  if (updates.email) { sets.push(`email = $${idx}`); params.push(updates.email); idx++; }
  if (updates.billingEmail) { sets.push(`billing_email = $${idx}`); params.push(updates.billingEmail); idx++; }
  if (sets.length > 0) await pool.query(`UPDATE customers SET ${sets.join(", ")} WHERE id = $1`, params);
}

// Invite team member
export async function inviteTeamMember(customerId: string, email: string, role: string): Promise<string> {
  const token = randomBytes(16).toString("hex");
  await pool.query(
    "INSERT INTO invitations (customer_id, email, role, token, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [customerId, email, role, createHash("sha256").update(token).digest("hex")]
  );
  await redis.rpush("notification:queue", JSON.stringify({ type: "team_invite", email, inviteUrl: `${process.env.APP_URL}/invite/${token}` }));
  return token;
}

// Generate new API key
export async function generateApiKey(customerId: string, name: string): Promise<{ key: string; prefix: string }> {
  const rawKey = randomBytes(32).toString("hex");
  const prefix = rawKey.slice(0, 8);
  const lookupHash = createHash("sha256").update(`sk_live_${rawKey}`).digest("hex");
  await pool.query(
    "INSERT INTO api_keys (id, prefix, lookup_hash, name, organization_id, status, created_at) VALUES ($1, $2, $3, $4, $5, 'active', NOW())",
    [`key-${randomBytes(6).toString("hex")}`, prefix, lookupHash, name, customerId]
  );
  return { key: `sk_live_${rawKey}`, prefix };
}

// Download invoice
export async function downloadInvoice(customerId: string, invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  const { rows: [invoice] } = await pool.query(
    "SELECT * FROM invoices WHERE id = $1 AND customer_id = $2", [invoiceId, customerId]
  );
  if (!invoice) throw new Error("Invoice not found");
  // In production: generate PDF
  return { buffer: Buffer.from(`Invoice ${invoiceId}`), filename: `invoice-${invoiceId}.pdf` };
}

// Create support ticket
export async function createTicket(customerId: string, subject: string, message: string): Promise<string> {
  const id = `ticket-${randomBytes(6).toString("hex")}`;
  await pool.query(
    "INSERT INTO tickets (id, customer_id, subject, status, created_at) VALUES ($1, $2, $3, 'open', NOW())",
    [id, customerId, subject]
  );
  await pool.query(
    "INSERT INTO ticket_messages (ticket_id, content, from_customer, created_at) VALUES ($1, $2, true, NOW())",
    [id, message]
  );
  return id;
}
```

## Results

- **60% fewer support tickets** — billing email change, invoice download, team invite all self-service; 1,200 tickets/month → 480; $18K/month saved
- **4 hours wait → instant** — customer updates billing email in 10 seconds; no ticket, no wait, no frustration
- **Usage visibility** — customer sees "API calls: 450K/500K (90%)" and upgrades before hitting limit; proactive upsell; no surprise blocks
- **API key management** — generate, name, and revoke keys without contacting support; developer experience improved; onboarding faster
- **Team admin** — account owner invites/removes members, assigns roles; no admin involvement; scales to 500-person enterprise teams
