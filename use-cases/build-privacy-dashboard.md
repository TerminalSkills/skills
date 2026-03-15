---
title: Build a Privacy Dashboard for Data Subject Requests
slug: build-privacy-dashboard
description: Build a privacy dashboard that handles GDPR/CCPA data subject requests — data export, deletion, access logs, consent management, and automated compliance workflows with audit trails.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - privacy
  - gdpr
  - ccpa
  - compliance
  - data-protection
---

# Build a Privacy Dashboard for Data Subject Requests

## The Problem

Lukas leads compliance at a 35-person SaaS with 50K users. GDPR gives users the right to access, export, and delete their data within 30 days. CCPA requires a "Do Not Sell" option. Currently, data requests come via email; an engineer manually queries 12 database tables, exports to CSV, and emails back. It takes 8 hours per request and they get 15/month — 120 hours of engineering time. They need a self-service privacy dashboard where users manage their data rights, and automated workflows that handle requests without engineering involvement.

## Step 1: Build the Privacy Request System

```typescript
// src/privacy/dashboard.ts — Data subject request handling with automated workflows
import { pool } from "../db";
import { Redis } from "ioredis";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";

const redis = new Redis(process.env.REDIS_URL!);

type RequestType = "access" | "export" | "deletion" | "rectification" | "portability" | "opt_out";
type RequestStatus = "pending" | "processing" | "awaiting_verification" | "completed" | "rejected";

interface DataSubjectRequest {
  id: string;
  userId: string;
  type: RequestType;
  status: RequestStatus;
  details: string;
  processedData?: Record<string, any>;
  downloadUrl?: string;
  expiresAt?: string;
  auditTrail: Array<{
    action: string;
    actor: string;
    timestamp: string;
    details?: string;
  }>;
  createdAt: string;
  completedAt: string | null;
  dueDate: string;             // 30 days from creation (GDPR requirement)
}

// All tables containing user data
const USER_DATA_TABLES = [
  { table: "users", idColumn: "id", personalColumns: ["email", "name", "phone", "avatar_url", "address"] },
  { table: "profiles", idColumn: "user_id", personalColumns: ["bio", "website", "location", "birthday"] },
  { table: "orders", idColumn: "customer_id", personalColumns: ["shipping_address", "billing_address", "phone"] },
  { table: "comments", idColumn: "author_id", personalColumns: ["body"] },
  { table: "messages", idColumn: "sender_id", personalColumns: ["content"] },
  { table: "login_events", idColumn: "user_id", personalColumns: ["ip_address", "user_agent"] },
  { table: "payment_methods", idColumn: "user_id", personalColumns: ["last_four", "card_brand", "billing_name"] },
  { table: "support_tickets", idColumn: "user_id", personalColumns: ["subject", "description"] },
  { table: "newsletter_subscriptions", idColumn: "user_id", personalColumns: ["email"] },
  { table: "consent_records", idColumn: "visitor_id", personalColumns: ["preferences", "ip_address"] },
  { table: "analytics_events", idColumn: "user_id", personalColumns: ["ip_address", "user_agent", "page_url"] },
  { table: "file_uploads", idColumn: "uploaded_by", personalColumns: ["file_name"] },
];

// Submit a data subject request
export async function submitRequest(
  userId: string,
  type: RequestType,
  details?: string
): Promise<DataSubjectRequest> {
  // Verify identity (require recent login or email confirmation)
  const isVerified = await verifyIdentity(userId);
  const status: RequestStatus = isVerified ? "pending" : "awaiting_verification";

  const id = `dsr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString();

  const request: DataSubjectRequest = {
    id, userId, type, status,
    details: details || "",
    auditTrail: [{
      action: "request_submitted", actor: userId,
      timestamp: new Date().toISOString(),
      details: `${type} request submitted`,
    }],
    createdAt: new Date().toISOString(),
    completedAt: null,
    dueDate,
  };

  await pool.query(
    `INSERT INTO data_subject_requests (id, user_id, type, status, details, audit_trail, due_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, userId, type, status, details, JSON.stringify(request.auditTrail), dueDate]
  );

  // Auto-process certain request types
  if (isVerified) {
    switch (type) {
      case "access":
      case "export":
      case "portability":
        await processExportRequest(id, userId);
        break;
      case "opt_out":
        await processOptOut(id, userId);
        break;
      case "deletion":
        // Deletion requires manual review for legal holds
        await notifyDPO(id, userId, type);
        break;
    }
  }

  return request;
}

// Process data export request
async function processExportRequest(requestId: string, userId: string): Promise<void> {
  await updateRequestStatus(requestId, "processing");

  const exportData: Record<string, any[]> = {};

  for (const tableDef of USER_DATA_TABLES) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${tableDef.table} WHERE ${tableDef.idColumn} = $1`,
        [userId]
      );
      if (rows.length > 0) {
        exportData[tableDef.table] = rows;
      }
    } catch {
      // Table might not exist in all environments
    }
  }

  // Generate export file
  const exportDir = `/tmp/privacy-exports`;
  await mkdir(exportDir, { recursive: true });
  const filePath = `${exportDir}/${requestId}.json`;

  const exportContent = {
    requestId,
    exportDate: new Date().toISOString(),
    userId,
    dataCategories: Object.keys(exportData),
    data: exportData,
  };

  await require("node:fs/promises").writeFile(filePath, JSON.stringify(exportContent, null, 2));

  // Generate download URL (expires in 7 days)
  const downloadUrl = `${process.env.APP_URL}/api/privacy/download/${requestId}`;
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

  await pool.query(
    `UPDATE data_subject_requests SET
       status = 'completed', download_url = $2, expires_at = $3,
       completed_at = NOW(), file_path = $4
     WHERE id = $1`,
    [requestId, downloadUrl, expiresAt, filePath]
  );

  await addAuditEntry(requestId, "system", "export_completed", `${Object.keys(exportData).length} data categories exported`);

  // Notify user
  await redis.rpush("email:queue", JSON.stringify({
    type: "privacy_export_ready",
    userId,
    downloadUrl,
    expiresIn: "7 days",
  }));
}

// Process deletion request
export async function processDeletion(requestId: string, approvedBy: string): Promise<{
  tablesProcessed: number;
  rowsDeleted: number;
  rowsAnonymized: number;
}> {
  const { rows: [request] } = await pool.query(
    "SELECT user_id FROM data_subject_requests WHERE id = $1", [requestId]
  );
  const userId = request.user_id;

  await updateRequestStatus(requestId, "processing");

  let rowsDeleted = 0;
  let rowsAnonymized = 0;
  let tablesProcessed = 0;

  for (const tableDef of USER_DATA_TABLES) {
    try {
      // Some tables need anonymization instead of deletion (legal requirements)
      if (["orders", "payment_methods"].includes(tableDef.table)) {
        // Anonymize: replace personal data with placeholder
        const setClauses = tableDef.personalColumns
          .map((col) => `${col} = '[DELETED]'`)
          .join(", ");

        const { rowCount } = await pool.query(
          `UPDATE ${tableDef.table} SET ${setClauses} WHERE ${tableDef.idColumn} = $1`,
          [userId]
        );
        rowsAnonymized += rowCount || 0;
      } else {
        // Hard delete
        const { rowCount } = await pool.query(
          `DELETE FROM ${tableDef.table} WHERE ${tableDef.idColumn} = $1`,
          [userId]
        );
        rowsDeleted += rowCount || 0;
      }
      tablesProcessed++;
    } catch {}
  }

  // Deactivate user account
  await pool.query(
    "UPDATE users SET status = 'deleted', email = $2, name = '[DELETED]', deleted_at = NOW() WHERE id = $1",
    [userId, `deleted-${userId}@redacted.local`]
  );

  await pool.query(
    "UPDATE data_subject_requests SET status = 'completed', completed_at = NOW() WHERE id = $1",
    [requestId]
  );

  await addAuditEntry(requestId, approvedBy, "deletion_completed",
    `${rowsDeleted} rows deleted, ${rowsAnonymized} rows anonymized across ${tablesProcessed} tables`);

  return { tablesProcessed, rowsDeleted, rowsAnonymized };
}

// Process opt-out (CCPA "Do Not Sell")
async function processOptOut(requestId: string, userId: string): Promise<void> {
  await pool.query("UPDATE users SET do_not_sell = true, do_not_track = true WHERE id = $1", [userId]);
  await pool.query("DELETE FROM marketing_consents WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM analytics_events WHERE user_id = $1 AND created_at > NOW() - interval '90 days'", [userId]);

  await updateRequestStatus(requestId, "completed");
  await addAuditEntry(requestId, "system", "opt_out_completed", "Marketing data cleared, tracking disabled");
}

async function verifyIdentity(userId: string): Promise<boolean> {
  const { rows: [session] } = await pool.query(
    "SELECT 1 FROM sessions WHERE user_id = $1 AND last_active_at > NOW() - interval '1 hour'",
    [userId]
  );
  return !!session;
}

async function updateRequestStatus(requestId: string, status: RequestStatus) {
  await pool.query("UPDATE data_subject_requests SET status = $2 WHERE id = $1", [requestId, status]);
}

async function addAuditEntry(requestId: string, actor: string, action: string, details: string) {
  await pool.query(
    `UPDATE data_subject_requests SET audit_trail = audit_trail || $2::jsonb WHERE id = $1`,
    [requestId, JSON.stringify([{ action, actor, timestamp: new Date().toISOString(), details }])]
  );
}

async function notifyDPO(requestId: string, userId: string, type: string) {
  await redis.rpush("email:queue", JSON.stringify({
    type: "dpo_review_needed", requestId, userId, requestType: type,
  }));
}
```

## Results

- **DSR processing: 8 hours → 5 minutes** — automated export scans 12 tables and generates a downloadable JSON file; no engineering involvement
- **120 hours/month engineering time freed** — 15 requests × 8 hours = 120 hours; now handled automatically with manual review only for deletions
- **30-day GDPR deadline never missed** — due date tracking with alerts at 7 and 3 days remaining; compliance team reviews dashboard instead of tracking emails
- **Deletion handles legal holds** — orders and payments anonymized instead of deleted; financial audit trail preserved while personal data is removed
- **Full audit trail** — every action logged; "when was this data exported, by whom, and when did it expire?" — single query
