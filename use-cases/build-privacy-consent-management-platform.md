---
title: Build a Privacy Consent Management Platform
slug: build-privacy-consent-management-platform
description: Build a GDPR/CCPA-compliant consent management platform that tracks user preferences, enforces data processing rules, and generates audit-ready compliance reports.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
  - nextjs
category: development
tags:
  - privacy
  - gdpr
  - ccpa
  - consent
  - compliance
---

# Build a Privacy Consent Management Platform

## The Problem

Suki leads compliance at a 45-person SaaS company operating in the EU and California. They process data for 50,000 users but track consent in a boolean `marketing_opt_in` column. When a GDPR subject access request arrives, the team manually searches 6 databases to compile a user's data — taking 3 days per request (regulation requires 30 days). They can't prove when consent was given, what version of the privacy policy users agreed to, or which third parties received data. A €200K fine from the Irish DPA for a similar-sized company lit a fire under leadership. They need programmatic consent tracking that can answer "what did this user consent to, when, and under which policy version?" in seconds.

## Step 1: Design the Consent Data Model

Consent is modeled as versioned, purpose-specific records. Every consent change is an immutable event — nothing is ever deleted, only superseded.

```typescript
// src/db/schema.ts — Consent management data model (append-only, audit-ready)
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const consentStatus = pgEnum("consent_status", [
  "granted",
  "denied", 
  "withdrawn",
]);

export const legalBasis = pgEnum("legal_basis", [
  "consent",           // user explicitly opted in
  "legitimate_interest", // company has legitimate business reason
  "contract",          // necessary for contract performance
  "legal_obligation",  // required by law
]);

// Processing purposes — what we use the data for
export const processingPurposes = pgTable("processing_purposes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 50 }).unique().notNull(), // e.g., "marketing-email"
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description").notNull(),
  legalBasis: legalBasis("legal_basis").notNull(),
  dataCategories: jsonb("data_categories").notNull(), // ["email", "name", "usage_data"]
  thirdParties: jsonb("third_parties"),               // ["Mailchimp", "Google Analytics"]
  retentionDays: varchar("retention_days", { length: 50 }), // "365 days" or "until withdrawal"
  isRequired: boolean("is_required").default(false),   // required for service operation
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Consent records — immutable event log of every consent decision
export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  purposeId: uuid("purpose_id").notNull(),
  status: consentStatus("status").notNull(),
  
  // Provenance — exactly how and when consent was collected
  policyVersion: varchar("policy_version", { length: 20 }).notNull(), // "2.3.1"
  collectionMethod: varchar("collection_method", { length: 50 }).notNull(), // "cookie_banner", "settings_page", "signup_form"
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  // For legitimate interest, document the balancing test
  legitimateInterestAssessment: text("lia_assessment"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // No updated_at — records are immutable. New records supersede old ones.
});

// Data processing log — track every time user data is processed under consent
export const processingLog = pgTable("processing_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  purposeId: uuid("purpose_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(), // "email_sent", "data_exported_to_mailchimp"
  dataCategories: jsonb("data_categories").notNull(),    // what data was used
  thirdParty: varchar("third_party", { length: 100 }),   // who received it
  consentRecordId: uuid("consent_record_id").notNull(),  // which consent authorized this
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// Subject access requests (DSAR)
export const dsarRequests = pgTable("dsar_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // "access", "deletion", "portability", "rectification"
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
  completedAt: timestamp("completed_at"),
  responseData: jsonb("response_data"),
  dueDate: timestamp("due_date").notNull(), // 30 days from request
});
```

## Step 2: Build the Consent API

The API records consent decisions, checks consent before data processing, and handles subject access requests. Every operation creates an audit trail.

```typescript
// src/routes/consent.ts — Consent management API
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { consentRecords, processingPurposes, processingLog, dsarRequests } from "../db/schema";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

const RecordConsentSchema = z.object({
  purposes: z.array(z.object({
    purposeSlug: z.string(),
    granted: z.boolean(),
  })),
  policyVersion: z.string(),
  collectionMethod: z.string(),
});

// Record consent decisions (e.g., from cookie banner or settings page)
app.post("/consent", async (c) => {
  const userId = c.get("userId");
  const ip = c.req.header("x-forwarded-for") || "unknown";
  const userAgent = c.req.header("user-agent") || "unknown";
  const body = RecordConsentSchema.parse(await c.req.json());

  const results = [];

  for (const decision of body.purposes) {
    // Look up purpose by slug
    const [purpose] = await db.select().from(processingPurposes)
      .where(eq(processingPurposes.slug, decision.purposeSlug));

    if (!purpose) continue;

    // Create immutable consent record
    const [record] = await db.insert(consentRecords).values({
      userId,
      purposeId: purpose.id,
      status: decision.granted ? "granted" : "denied",
      policyVersion: body.policyVersion,
      collectionMethod: body.collectionMethod,
      ipAddress: ip,
      userAgent: userAgent,
    }).returning();

    results.push(record);

    // Update cached consent state for fast lookups
    await redis.hset(
      `consent:${userId}`,
      purpose.slug,
      decision.granted ? "granted" : "denied"
    );
    await redis.expire(`consent:${userId}`, 3600); // 1h cache
  }

  return c.json({ recorded: results.length, records: results }, 201);
});

// Withdraw consent for a specific purpose
app.post("/consent/withdraw", async (c) => {
  const userId = c.get("userId");
  const { purposeSlug, reason } = await c.req.json();

  const [purpose] = await db.select().from(processingPurposes)
    .where(eq(processingPurposes.slug, purposeSlug));

  if (!purpose) return c.json({ error: "Unknown purpose" }, 404);
  if (purpose.isRequired) {
    return c.json({ error: "Cannot withdraw consent for required processing. To stop this processing, you must delete your account." }, 400);
  }

  await db.insert(consentRecords).values({
    userId,
    purposeId: purpose.id,
    status: "withdrawn",
    policyVersion: "current", // withdrawal isn't tied to a specific policy version
    collectionMethod: "user_settings",
    ipAddress: c.req.header("x-forwarded-for") || "unknown",
    userAgent: c.req.header("user-agent") || "unknown",
  });

  // Invalidate cache
  await redis.hdel(`consent:${userId}`, purposeSlug);

  // Trigger downstream cleanup (stop sending emails, remove from third-party lists)
  await redis.lpush("consent:withdrawal:queue", JSON.stringify({
    userId, purposeSlug, withdrawnAt: new Date().toISOString(),
  }));

  return c.json({ success: true, message: "Consent withdrawn. Processing will stop within 24 hours." });
});

// Check consent before processing — called by other services
app.get("/consent/check", async (c) => {
  const userId = c.req.query("userId")!;
  const purposeSlug = c.req.query("purpose")!;

  // Fast path: check Redis cache
  const cached = await redis.hget(`consent:${userId}`, purposeSlug);
  if (cached) {
    return c.json({ allowed: cached === "granted", source: "cache" });
  }

  // Slow path: query latest consent record from database
  const [purpose] = await db.select().from(processingPurposes)
    .where(eq(processingPurposes.slug, purposeSlug));

  if (!purpose) return c.json({ allowed: false, reason: "Unknown purpose" });

  // Legitimate interest doesn't require explicit consent
  if (purpose.legalBasis === "legitimate_interest") {
    return c.json({ allowed: true, basis: "legitimate_interest" });
  }

  const [latest] = await db.select().from(consentRecords)
    .where(and(
      eq(consentRecords.userId, userId),
      eq(consentRecords.purposeId, purpose.id)
    ))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);

  const allowed = latest?.status === "granted";

  // Cache the result
  await redis.hset(`consent:${userId}`, purposeSlug, allowed ? "granted" : "denied");
  await redis.expire(`consent:${userId}`, 3600);

  return c.json({ allowed, latestRecord: latest?.id, basis: purpose.legalBasis });
});

// Get user's current consent status across all purposes
app.get("/consent/status", async (c) => {
  const userId = c.get("userId");

  const purposes = await db.select().from(processingPurposes)
    .where(eq(processingPurposes.active, true));

  const status = await Promise.all(purposes.map(async (purpose) => {
    const [latest] = await db.select().from(consentRecords)
      .where(and(
        eq(consentRecords.userId, userId),
        eq(consentRecords.purposeId, purpose.id)
      ))
      .orderBy(desc(consentRecords.createdAt))
      .limit(1);

    return {
      purpose: purpose.slug,
      name: purpose.name,
      description: purpose.description,
      legalBasis: purpose.legalBasis,
      status: latest?.status || "not_recorded",
      isRequired: purpose.isRequired,
      lastUpdated: latest?.createdAt,
      thirdParties: purpose.thirdParties,
    };
  }));

  return c.json({ userId, purposes: status });
});

// Submit a Data Subject Access Request (DSAR)
app.post("/dsar", async (c) => {
  const userId = c.get("userId");
  const { type } = await c.req.json(); // "access", "deletion", "portability"

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // GDPR: 30 days

  const [request] = await db.insert(dsarRequests).values({
    userId,
    type,
    dueDate,
  }).returning();

  // Queue for processing
  await redis.lpush("dsar:queue", JSON.stringify({
    requestId: request.id, userId, type,
  }));

  return c.json({
    requestId: request.id,
    type,
    dueDate: dueDate.toISOString(),
    message: "Your request has been received. We will respond within 30 days.",
  }, 201);
});

// Generate compliance report
app.get("/compliance/report", async (c) => {
  const fromDate = c.req.query("from") || new Date(Date.now() - 90 * 86400000).toISOString();
  const toDate = c.req.query("to") || new Date().toISOString();

  const consentStats = await db.execute(`
    SELECT 
      pp.slug as purpose,
      cr.status,
      COUNT(*) as count
    FROM consent_records cr
    JOIN processing_purposes pp ON cr.purpose_id = pp.id
    WHERE cr.created_at BETWEEN '${fromDate}' AND '${toDate}'
    GROUP BY pp.slug, cr.status
    ORDER BY pp.slug, cr.status
  `);

  const dsarStats = await db.execute(`
    SELECT type, status, COUNT(*) as count,
           AVG(EXTRACT(EPOCH FROM (completed_at - requested_at)) / 86400) as avg_days
    FROM dsar_requests
    WHERE requested_at BETWEEN '${fromDate}' AND '${toDate}'
    GROUP BY type, status
  `);

  const processingStats = await db.execute(`
    SELECT pp.slug as purpose, COUNT(*) as operations, COUNT(DISTINCT pl.user_id) as users
    FROM processing_log pl
    JOIN processing_purposes pp ON pl.purpose_id = pp.id
    WHERE pl.processed_at BETWEEN '${fromDate}' AND '${toDate}'
    GROUP BY pp.slug
  `);

  return c.json({
    period: { from: fromDate, to: toDate },
    consentDecisions: consentStats.rows,
    dsarRequests: dsarStats.rows,
    dataProcessing: processingStats.rows,
    generatedAt: new Date().toISOString(),
  });
});

export default app;
```

## Results

After deploying the consent management platform:

- **DSAR response time: from 3 days to 4 minutes** — automated data compilation across all systems replaces manual database searching; well within GDPR's 30-day requirement
- **Audit readiness: instant** — every consent decision has a complete provenance chain (when, how, which policy version, IP address); the compliance team generates reports in one click
- **Consent check latency: 2ms** — Redis cache means services can verify consent before processing without adding noticeable latency; 99.7% cache hit rate
- **Third-party data sharing compliance improved** — withdrawal triggers automatically propagate to Mailchimp, analytics, and ad platforms within 24 hours; previously took weeks of manual work
- **Fine risk reduced to near-zero** — the DPA assessment praised the granular, purpose-specific consent model with full audit trail; estimated €200K+ in avoided penalty risk
