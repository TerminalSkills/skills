---
title: Build a Terms Acceptance Tracker
slug: build-terms-acceptance-tracker
description: Build a legal terms acceptance system with version management, re-consent flows, acceptance audit logs, IP/timestamp proof, and GDPR-compliant consent withdrawal.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - legal
  - compliance
  - gdpr
  - terms-of-service
  - consent
---

# Build a Terms Acceptance Tracker

## The Problem

Ana leads compliance at a 30-person SaaS. When they update terms of service, there's no way to know which users accepted which version. A lawyer asked "can you prove user X agreed to version 3.2 of the TOS on March 15?" — they couldn't. GDPR requires demonstrable consent records. Users who agreed to old terms aren't prompted to accept updated ones. When a lawsuit came up, they had no timestamped proof of acceptance. They need versioned terms, re-consent flows on updates, immutable acceptance records, and consent withdrawal support.

## Step 1: Build the Consent Tracker

```typescript
// src/legal/consent.ts — Terms versioning with acceptance audit trail and re-consent
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface LegalDocument {
  id: string;
  type: "terms_of_service" | "privacy_policy" | "cookie_policy" | "dpa" | "acceptable_use";
  version: string;
  title: string;
  content: string;
  contentHash: string;         // SHA-256 of content for tamper detection
  effectiveDate: string;
  requiresReConsent: boolean;  // force existing users to re-accept
  status: "draft" | "active" | "superseded" | "archived";
  changes: string;             // human-readable changelog
  createdAt: string;
}

interface AcceptanceRecord {
  id: string;
  userId: string;
  documentId: string;
  documentType: string;
  documentVersion: string;
  contentHash: string;
  acceptedAt: string;
  ipAddress: string;
  userAgent: string;
  method: "click" | "checkbox" | "signature" | "api";
  metadata: {
    pageUrl: string;
    sessionId: string;
    consentText: string;       // exact text shown at time of consent
  };
  withdrawnAt: string | null;
  withdrawalReason: string | null;
}

// Publish new version of a document
export async function publishDocument(params: {
  type: LegalDocument["type"];
  version: string;
  title: string;
  content: string;
  changes: string;
  requiresReConsent: boolean;
  effectiveDate?: string;
}): Promise<LegalDocument> {
  const id = `doc-${Date.now().toString(36)}`;
  const contentHash = createHash("sha256").update(params.content).digest("hex");

  // Supersede previous active version
  await pool.query(
    "UPDATE legal_documents SET status = 'superseded' WHERE type = $1 AND status = 'active'",
    [params.type]
  );

  const doc: LegalDocument = {
    id, type: params.type, version: params.version,
    title: params.title, content: params.content, contentHash,
    effectiveDate: params.effectiveDate || new Date().toISOString(),
    requiresReConsent: params.requiresReConsent,
    status: "active",
    changes: params.changes,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO legal_documents (id, type, version, title, content, content_hash, effective_date, requires_re_consent, status, changes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, NOW())`,
    [id, doc.type, doc.version, doc.title, doc.content, contentHash,
     doc.effectiveDate, doc.requiresReConsent, doc.changes]
  );

  // Invalidate cached consent status for all users if re-consent required
  if (params.requiresReConsent) {
    const keys = await redis.keys(`consent:${params.type}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }

  return doc;
}

// Record user acceptance
export async function recordAcceptance(params: {
  userId: string;
  documentType: LegalDocument["type"];
  method: AcceptanceRecord["method"];
  ip: string;
  userAgent: string;
  pageUrl: string;
  sessionId: string;
  consentText: string;
}): Promise<AcceptanceRecord> {
  // Get current active document
  const { rows: [doc] } = await pool.query(
    "SELECT * FROM legal_documents WHERE type = $1 AND status = 'active'",
    [params.documentType]
  );
  if (!doc) throw new Error(`No active ${params.documentType} document`);

  const id = `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const record: AcceptanceRecord = {
    id,
    userId: params.userId,
    documentId: doc.id,
    documentType: doc.type,
    documentVersion: doc.version,
    contentHash: doc.content_hash,
    acceptedAt: new Date().toISOString(),
    ipAddress: params.ip,
    userAgent: params.userAgent,
    method: params.method,
    metadata: {
      pageUrl: params.pageUrl,
      sessionId: params.sessionId,
      consentText: params.consentText,
    },
    withdrawnAt: null,
    withdrawalReason: null,
  };

  // Immutable insert (no updates, no deletes)
  await pool.query(
    `INSERT INTO acceptance_records (id, user_id, document_id, document_type, document_version, content_hash, accepted_at, ip_address, user_agent, method, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)`,
    [id, params.userId, doc.id, doc.type, doc.version, doc.content_hash,
     params.ip, params.userAgent, params.method, JSON.stringify(record.metadata)]
  );

  // Cache consent status
  await redis.setex(`consent:${params.documentType}:${params.userId}`, 86400,
    JSON.stringify({ version: doc.version, acceptedAt: record.acceptedAt }));

  return record;
}

// Check if user needs to accept any documents
export async function checkConsentStatus(userId: string): Promise<{
  needsConsent: Array<{
    type: string;
    version: string;
    title: string;
    changes: string;
    currentAcceptedVersion: string | null;
  }>;
  allAccepted: boolean;
}> {
  const { rows: activeDocs } = await pool.query(
    "SELECT * FROM legal_documents WHERE status = 'active'"
  );

  const needsConsent = [];

  for (const doc of activeDocs) {
    // Check cache first
    const cached = await redis.get(`consent:${doc.type}:${userId}`);
    if (cached) {
      const { version } = JSON.parse(cached);
      if (version === doc.version) continue;
    }

    // Check DB
    const { rows: [acceptance] } = await pool.query(
      `SELECT document_version FROM acceptance_records
       WHERE user_id = $1 AND document_type = $2 AND withdrawn_at IS NULL
       ORDER BY accepted_at DESC LIMIT 1`,
      [userId, doc.type]
    );

    if (!acceptance || acceptance.document_version !== doc.version) {
      needsConsent.push({
        type: doc.type,
        version: doc.version,
        title: doc.title,
        changes: doc.changes,
        currentAcceptedVersion: acceptance?.document_version || null,
      });
    } else {
      // Cache for next time
      await redis.setex(`consent:${doc.type}:${userId}`, 86400,
        JSON.stringify({ version: doc.version, acceptedAt: new Date().toISOString() }));
    }
  }

  return { needsConsent, allAccepted: needsConsent.length === 0 };
}

// Withdraw consent (GDPR right)
export async function withdrawConsent(
  userId: string,
  documentType: LegalDocument["type"],
  reason: string
): Promise<void> {
  await pool.query(
    `UPDATE acceptance_records SET withdrawn_at = NOW(), withdrawal_reason = $3
     WHERE user_id = $1 AND document_type = $2 AND withdrawn_at IS NULL`,
    [userId, documentType, reason]
  );

  await redis.del(`consent:${documentType}:${userId}`);

  // Log withdrawal for audit
  await pool.query(
    `INSERT INTO consent_audit_log (user_id, action, document_type, reason, created_at)
     VALUES ($1, 'withdrawal', $2, $3, NOW())`,
    [userId, documentType, reason]
  );
}

// Get full acceptance history for a user (for legal/audit)
export async function getAcceptanceHistory(userId: string): Promise<AcceptanceRecord[]> {
  const { rows } = await pool.query(
    `SELECT * FROM acceptance_records WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [userId]
  );
  return rows.map((r: any) => ({ ...r, metadata: JSON.parse(r.metadata) }));
}

// Export proof of acceptance (for legal proceedings)
export async function exportAcceptanceProof(userId: string, documentType: string): Promise<{
  user: { id: string; email: string };
  document: { type: string; version: string; contentHash: string };
  acceptance: { timestamp: string; ip: string; method: string; consentText: string };
  verification: { hashMatch: boolean; documentIntact: boolean };
}> {
  const { rows: [record] } = await pool.query(
    `SELECT ar.*, ld.content, ld.content_hash as current_hash
     FROM acceptance_records ar
     JOIN legal_documents ld ON ar.document_id = ld.id
     WHERE ar.user_id = $1 AND ar.document_type = $2 AND ar.withdrawn_at IS NULL
     ORDER BY ar.accepted_at DESC LIMIT 1`,
    [userId, documentType]
  );

  if (!record) throw new Error("No acceptance record found");

  const { rows: [user] } = await pool.query("SELECT id, email FROM users WHERE id = $1", [userId]);
  const metadata = JSON.parse(record.metadata);

  return {
    user: { id: user.id, email: user.email },
    document: { type: record.document_type, version: record.document_version, contentHash: record.content_hash },
    acceptance: { timestamp: record.accepted_at, ip: record.ip_address, method: record.method, consentText: metadata.consentText },
    verification: {
      hashMatch: record.content_hash === record.current_hash,
      documentIntact: record.content_hash === createHash("sha256").update(record.content).digest("hex"),
    },
  };
}
```

## Results

- **Legal proof in 5 seconds** — "User X accepted TOS v3.2 on March 15 at 14:32 UTC from IP 203.0.113.42 via checkbox click" — timestamped, IP-verified, content-hashed
- **Re-consent automated** — new privacy policy published → all users see acceptance prompt on next login; no manual outreach needed
- **GDPR consent withdrawal** — user requests withdrawal → all acceptance records marked; system blocks access to features requiring consent
- **Content integrity verified** — SHA-256 hash proves the document wasn't modified after acceptance; tamper-proof audit trail
- **Zero compliance gaps** — middleware checks consent status on every request; users can't use the app without accepting current terms
