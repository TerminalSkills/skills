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

Suki leads compliance at a 45-person SaaS company operating in the EU and California. They process data for 50,000 users but track consent in a boolean `marketing_opt_in` column. When a subject access request arrives, the team manually searches six databases to compile a user's data, which takes days. They cannot prove when consent was given, which privacy policy version the user agreed to, or which third parties received data. Regulators in both jurisdictions expect those answers on request, so leadership wants programmatic consent tracking that can answer "what did this user consent to, when, and under which policy version?" in seconds.

## The Solution

Model every consent decision as an immutable, purpose-specific event in PostgreSQL (Drizzle ORM). Expose a small Hono API validated with Zod: record and withdraw consent, check consent before processing, and open data subject requests. Redis caches the latest decision per user and purpose so other services can check consent cheaply.

This is engineering scaffolding, not legal advice. Which purposes need consent and which can rest on another legal basis is a decision for your counsel.

## Step-by-Step Walkthrough

### Step 1: Design the consent data model

Every consent change is a new row. Nothing is updated or deleted, so the full history can be replayed for an audit.

```bash
npm install hono @hono/node-server zod drizzle-orm pg ioredis
npm install -D typescript @types/node @types/pg
```

```typescript
// src/db/schema.ts
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";

export const consentStatus = pgEnum("consent_status", ["granted", "denied", "withdrawn"]);

export const legalBasis = pgEnum("legal_basis", [
  "consent",
  "legitimate_interest",
  "contract",
  "legal_obligation",
]);

export const processingPurposes = pgTable("processing_purposes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 50 }).unique().notNull(), // "marketing-email"
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description").notNull(),
  legalBasis: legalBasis("legal_basis").notNull(),
  dataCategories: jsonb("data_categories").$type<string[]>().notNull(),
  thirdParties: jsonb("third_parties").$type<string[]>(),
  retention: varchar("retention", { length: 100 }), // "365 days" or "until withdrawal"
  isRequired: boolean("is_required").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only log of every consent decision
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    purposeId: uuid("purpose_id").notNull().references(() => processingPurposes.id),
    status: consentStatus("status").notNull(),
    policyVersion: varchar("policy_version", { length: 20 }).notNull(), // "2.3.1"
    collectionMethod: varchar("collection_method", { length: 50 }).notNull(), // "cookie_banner"
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("consent_user_purpose_idx").on(t.userId, t.purposeId, t.createdAt)],
);

export const dsarRequests = pgTable("dsar_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // access | deletion | portability | rectification
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  dueDate: timestamp("due_date").notNull(),
});
```

Make the log append-only at the database level too, so a bug in the API cannot rewrite history. Run this once, with the role your API connects as. That role must not own the table (an owner can grant itself the privileges back), so create the tables with a separate migration role and grant the API role only `SELECT` and `INSERT` on `consent_records`:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON consent_records FROM app_user;
GRANT SELECT, INSERT ON consent_records TO app_user;
```

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));
```

### Step 2: Build the consent API

Authentication is out of scope here: a middleware in front of these routes must set `userId` from your session. The `/consent/check` route is for your own backend services, so it takes a separate service token rather than a user id from the browser.

```typescript
// src/routes/consent.ts
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { consentRecords, processingPurposes, dsarRequests } from "../db/schema";

type Env = { Variables: { userId: string } };

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono<Env>();
const CACHE_TTL = 3600;

const Decision = z.object({
  purposes: z.array(z.object({ purposeSlug: z.string(), granted: z.boolean() })).min(1),
  policyVersion: z.string().max(20),
  collectionMethod: z.enum(["cookie_banner", "settings_page", "signup_form"]),
});

// Only trust x-forwarded-for when a proxy you control sets it
function clientIp(header: string | undefined) {
  return header?.split(",")[0]?.trim() || null;
}

async function purposeBySlug(slug: string) {
  const [purpose] = await db.select().from(processingPurposes).where(eq(processingPurposes.slug, slug));
  return purpose;
}

class RequiredPurposeError extends Error {}

async function writeDecision(
  userId: string,
  slug: string,
  status: "granted" | "denied" | "withdrawn",
  meta: { policyVersion: string; collectionMethod: string; ip: string | null; userAgent: string | null },
) {
  const purpose = await purposeBySlug(slug);
  if (!purpose) return null;
  if (status === "withdrawn" && purpose.isRequired) throw new RequiredPurposeError();
  const [record] = await db.insert(consentRecords).values({
    userId, purposeId: purpose.id, status,
    policyVersion: meta.policyVersion, collectionMethod: meta.collectionMethod,
    ipAddress: meta.ip, userAgent: meta.userAgent,
  }).returning();
    await redis.hset(`consent:${userId}`, slug, status === "granted" ? "granted" : "denied");
  await redis.expire(`consent:${userId}`, CACHE_TTL);
  return record;
}

app.post("/consent", async (c) => {
  const userId = c.get("userId");
  const body = Decision.parse(await c.req.json());
  const meta = {
    policyVersion: body.policyVersion,
    collectionMethod: body.collectionMethod,
    ip: clientIp(c.req.header("x-forwarded-for")),
    userAgent: c.req.header("user-agent") ?? null,
  };
  const records = [];
  for (const d of body.purposes) {
    const r = await writeDecision(userId, d.purposeSlug, d.granted ? "granted" : "denied", meta);
    if (r) records.push(r);
  }
  return c.json({ recorded: records.length }, 201);
});

// Withdraw consent: as easy as giving it, and effective immediately for checks
app.post("/consent/withdraw", async (c) => {
  const userId = c.get("userId");
  const { purposeSlug, policyVersion } = z
    .object({ purposeSlug: z.string(), policyVersion: z.string().max(20) })
    .parse(await c.req.json());
  try {
    const r = await writeDecision(userId, purposeSlug, "withdrawn", {
      policyVersion, collectionMethod: "settings_page",
      ip: clientIp(c.req.header("x-forwarded-for")), userAgent: c.req.header("user-agent") ?? null,
    });
    if (!r) return c.json({ error: "Unknown purpose" }, 404);
  } catch (err) {
    if (!(err instanceof RequiredPurposeError)) throw err;
    return c.json({ error: "This processing is required for the service" }, 400);
  }
  // Downstream cleanup (unsubscribe from third-party lists) is picked up by a worker
  await redis.lpush("consent:withdrawal:queue", JSON.stringify({ userId, purposeSlug, at: new Date().toISOString() }));
  return c.json({ success: true });
});

// Service-to-service: may we process this user's data for this purpose?
function isService(header: string | undefined) {
  const given = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${process.env.INTERNAL_API_TOKEN}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

app.get("/consent/check", async (c) => {
  if (!isService(c.req.header("authorization"))) return c.json({ error: "Forbidden" }, 403);
  const { userId, purpose: slug } = z.object({ userId: z.string().uuid(), purpose: z.string() }).parse(c.req.query());

  const purpose = await purposeBySlug(slug);
  if (!purpose || !purpose.active) return c.json({ allowed: false, reason: "unknown or inactive purpose" });
  // Only the "consent" basis depends on a user decision; the others must be justified elsewhere
  if (purpose.legalBasis !== "consent") return c.json({ allowed: true, basis: purpose.legalBasis });

  const cached = await redis.hget(`consent:${userId}`, slug);
  if (cached) return c.json({ allowed: cached === "granted", source: "cache" });

  const [latest] = await db.select().from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.purposeId, purpose.id)))
    .orderBy(desc(consentRecords.createdAt)).limit(1);
  const allowed = latest?.status === "granted";
  await redis.hset(`consent:${userId}`, slug, allowed ? "granted" : "denied");
  await redis.expire(`consent:${userId}`, CACHE_TTL);
  return c.json({ allowed, consentRecordId: latest?.id ?? null, source: "db" });
});

app.post("/dsar", async (c) => {
  const userId = c.get("userId");
  const { type } = z.object({ type: z.enum(["access", "deletion", "portability", "rectification"]) })
    .parse(await c.req.json());
  const dueDate = new Date();
  dueDate.setMonth(dueDate.getMonth() + 1); // GDPR Art. 12(3): one month, extendable for complex requests
  const [request] = await db.insert(dsarRequests).values({ userId, type, dueDate }).returning();
  await redis.lpush("dsar:queue", JSON.stringify({ requestId: request.id, userId, type }));
  return c.json({ requestId: request.id, dueDate: dueDate.toISOString() }, 201);
});

export default app;
```

California's CCPA/CPRA sets its own response deadlines for consumer requests; confirm them with counsel and set `dueDate` from whichever law applies to the requester. Verify the requester's identity before the worker releases any data.

### Step 3: Report on consent and requests

Query parameters are validated and passed to Drizzle's `sql` template, which sends them as bound parameters. Never concatenate dates into a SQL string.

```typescript
// src/routes/report.ts
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";

const app = new Hono();
const Range = z.object({
  from: z.coerce.date().default(() => new Date(Date.now() - 90 * 86_400_000)),
  to: z.coerce.date().default(() => new Date()),
});

app.get("/compliance/report", async (c) => {
  const { from, to } = Range.parse(c.req.query());

  const consent = await db.execute(sql`
    SELECT pp.slug AS purpose, cr.status, COUNT(*)::int AS count
    FROM consent_records cr JOIN processing_purposes pp ON cr.purpose_id = pp.id
    WHERE cr.created_at BETWEEN ${from} AND ${to}
    GROUP BY pp.slug, cr.status ORDER BY pp.slug, cr.status`);

  return c.json({ period: { from, to }, decisions: consent.rows });
});

export default app;
```

### Step 4: Collect consent in your front end

Whatever front end you use, post the user's choices to `POST /consent` with the current policy version and `collectionMethod` set to `cookie_banner`, `settings_page` or `signup_form`. Do not pre-tick optional purposes (a pre-ticked box is not valid consent), and make "Reject all" as prominent as "Accept all". Proxy the route through your web app so the session cookie reaches the API.

## Real-World Example

Suki's team seeds `processing_purposes` with their real purposes, points their email sender at `/consent/check` before every campaign, and runs the withdrawal worker nightly. When an access request arrives, the worker joins `consent_records` with each system's export and writes the result against the `dsar_requests` row. The compliance report replaces a spreadsheet the team used to rebuild by hand before each audit, and the question "what did this user agree to, and under which policy version?" becomes one indexed query.

## Related Skills

- `typescript` - strict types across the schema and API
- `postgresql` - the append-only consent log and report queries
- `redis` - consent cache and the withdrawal and request queues
- `hono` - the HTTP API
- `zod` - request and query validation
