---
title: "Build a Compliance Audit Trail with AI"
slug: build-compliance-audit-trail
description: "Implement tamper-evident audit logging for sensitive operations to satisfy SOC 2, HIPAA, and regulatory requirements."
skills: [coding-agent, security-audit, data-analysis]
category: development
tags: [compliance, audit-trail, logging, sox, security]
---

# Build a Compliance Audit Trail with AI

## The Problem

Your application handles sensitive financial data, and your compliance auditor just flagged a gap: there is no audit trail for who accessed what data and when. The application logs show HTTP requests, but they do not capture business-level events like "user exported all customer records" or "admin changed billing plan for account X."

When the auditor asks "can you prove that only authorized users accessed PII in the last 90 days?" you cannot answer. The access logs show that someone hit `GET /customers/export`, but not who made the request, which fields they pulled, or whether they were authorized. Without that evidence a SOC 2 Type II audit has little to test.

Building a proper audit trail means instrumenting many endpoints, designing tamper-evident storage, and giving auditors a way to query it without writing SQL.

## The Solution

Use the **coding-agent** skill to hand the audit module and the route instrumentation to a background coding agent, the **security-audit** skill to review it for holes (missing events, injectable queries, PII in logs), and **data-analysis** to turn the exported events into the evidence tables auditors ask for. The design below has three layers: an append-only Postgres table, a hash chain over its rows, and an anchor of the chain head outside the database.

## Step-by-Step Walkthrough

### Step 1: Define Audit Requirements

Tell the agent what must be tracked and why:

```text
We're preparing for SOC 2 Type II. Stack: Express API, Postgres, React.
Build an audit trail for:
- Authentication events (login, logout, failed attempts, password changes)
- PII access (view, export, modify customer data)
- Admin actions (role changes, config updates)
- Data exports and bulk operations
Each event answers: who, what, which resource, outcome. Store it append-only
with a hash chain. Do not log field values, only field names.
```

### Step 2: Create an Append-Only Table with a Hash Chain

Each row records actor, action, resource and result, plus the hash of the previous row. Triggers reject UPDATE, DELETE and TRUNCATE from every role except one that owns the table and disables them:

```sql
CREATE TABLE audit_events (
  seq        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   text NOT NULL,
  action     text NOT NULL,           -- e.g. customer.pii.export
  resource   text,                    -- e.g. customer:cust_9
  result     text NOT NULL,           -- success | failure | denied
  details    jsonb NOT NULL DEFAULT '{}',  -- ip, user agent, field NAMES, before/after keys
  prev_hash  text NOT NULL,
  hash       text NOT NULL
);

CREATE FUNCTION audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;

CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_immutable();
```

Also give the application its own database role that does not own the table and holds only `INSERT` and `SELECT` on it (`GRANT INSERT, SELECT ON audit_events TO app_role;`). Row-level security is not the tool for this: it filters which rows a role sees or writes, while privileges and triggers decide whether a statement is allowed at all. Triggers can be disabled by the table owner, which is why the chain and the anchor in Step 5 exist.

### Step 3: Write and Verify the Chain

Writes take a transaction-scoped advisory lock so two concurrent requests cannot both chain onto the same previous hash. `jsonb` does not preserve key order, so the hash is computed over a key-sorted form of `details`:

```javascript
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const sorted = (v) => Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
const canon = (e) => JSON.stringify([e.event_id, e.at, e.actor_id, e.action,
  e.resource ?? null, e.result, sorted(e.details), e.prev_hash]);

// db: a pg Pool or PGlite-style client with transaction(); adapt to your driver
export async function record(db, e) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(727001)');
    const last = await tx.query('SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1');
    const prev = last.rows[0]?.hash ?? GENESIS;
    const id = (await tx.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const at = new Date().toISOString();
    const row = { event_id: id, at, ...e, details: e.details ?? {}, prev_hash: prev };
    await tx.query(
      `INSERT INTO audit_events (event_id, at, actor_id, action, resource, result, details, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, at, e.actor_id, e.action, e.resource ?? null, e.result,
       JSON.stringify(row.details), prev, sha(canon(row))]);
  });
}

export async function verify(db) {
  const { rows } = await db.query('SELECT * FROM audit_events ORDER BY seq');
  let prev = GENESIS;
  for (const r of rows) {
    const e = { ...r, at: new Date(r.at).toISOString() };
    if (r.prev_hash !== prev || sha(canon(e)) !== r.hash) return { ok: false, brokenAtSeq: Number(r.seq) };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, head: prev };
}
```

With node-postgres, wrap `BEGIN`/`COMMIT` on one checked-out client instead of `db.transaction`. This code was run against an in-process Postgres (PGlite): five events (three written concurrently) verified, `UPDATE`, `DELETE` and `TRUNCATE` were rejected, and after the trigger was disabled and a row edited, `verify` reported `{ ok: false, brokenAtSeq: 2 }`. The same code and the `INSERT, SELECT` grant were also run against PostgreSQL 18 with a separate application role: the chain verified, and `UPDATE`, `DELETE` and `TRUNCATE` from that role failed with `permission denied`.

### Step 4: Capture Events

Two capture paths work together. Middleware records every state-changing request after the response is sent, so failures and denials are logged too:

```javascript
export function auditRequests(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    record(db, {
      actor_id: req.user?.id ?? 'anonymous',
      action: `${req.method} ${req.route?.path ?? req.path}`,
      result: res.statusCode < 400 ? 'success' : res.statusCode < 500 ? 'denied' : 'failure',
      details: { ip: req.ip, userAgent: req.get('user-agent'), status: res.statusCode },
    }).catch((err) => console.error('audit write failed', err));
  });
  next();
}
```

Reads of PII (`GET /customers/:id`, `GET /customers/export`) are not mutations, so call `record` explicitly in those handlers with `action: 'customer.pii.view'` or `'customer.pii.export'`, the field names accessed and a row count. Do the same in background jobs and cron tasks, which no middleware sees. Decide per action whether a failed audit write must fail the request: for exports of regulated data it should (write the event first, inside the same transaction), for page views it usually should not. Never put field values, tokens or passwords in `details`.

Ask the agent to produce an event catalog (`auth.login.success`, `auth.login.failure`, `auth.password.change`, `customer.pii.update`, `admin.role.change`, `admin.config.update`) and a table of which route emits which event. That table is what you review in Step 6.

### Step 5: Anchor the Chain Head Outside the Database

A hash chain only detects edits if the attacker cannot recompute it. Someone with owner access to the database can rewrite rows and every later hash. Close that gap by copying the latest `head` from `verify` on a schedule (hourly or daily) to storage the database admins cannot rewrite, such as an object-lock bucket in compliance mode, or a separate account's log archive. During an audit, `verify` must reproduce each anchored head. Retention is a policy you define and state to the auditor, not a number the SOC 2 criteria set; keep the table and anchors at least through your audit observation window plus your contractual and legal minimums.

### Step 6: Review with the Security Audit Skill

Run the **security-audit** skill over the new module. It should check that audit queries are parameterised (as above), that no PII values reach `details`, that the auditor endpoints require an auditor role and are themselves audited, and that every sensitive route in your table emits an event. Fix what it reports before the auditor sees the system.

### Step 7: Evidence for Auditors with Data Analysis

Export events to CSV for the audit window (`details->>'ip' AS ip` as a column) and let the **data-analysis** skill build the tables auditors ask for:

```python
import pandas as pd

df = pd.read_csv("audit_events.csv", parse_dates=["at"])
pii = df[df["action"].str.startswith("customer.pii.")]
print(pii.groupby(["actor_id", "action"]).size().rename("events"))

fails = df[df["action"] == "auth.login.failure"]
# failed logins per source IP per day; the threshold is yours to tune
per_ip = fails.groupby(["ip", fails["at"].dt.date]).size().rename("failures")
print(per_ip[per_ip >= 5])
```

Typical deliverables: PII access by actor and month, failed logins by IP, admin role changes with before and after, and the `verify` result plus anchored heads as the integrity evidence. Keep the CSV and the script with the audit workpapers so the auditor can rerun them.

## Real-World Example

Nadia leads engineering at a 15-person fintech preparing for its first SOC 2 Type II audit. The auditor's preliminary assessment says the audit trail is insufficient, and there are three weeks before the follow-up. She has the agent generate the table, the chain writer and the middleware, then walks the route table with the security-audit skill and finds two export endpoints that emitted no event. Those are fixed the same day.

For the follow-up she shows the append-only table rejecting an `UPDATE` in front of the auditor, runs `verify`, and matches its head against the hash anchored in the object-lock bucket that morning. The auditor asks for PII access by admin users in the quarter; the data-analysis script produces it from a CSV export in seconds. The finding is closed with evidence the auditor can re-run, not a screenshot.

## Related Skills

- [coding-agent](/skills/coding-agent) - hand the audit module and route instrumentation to a background agent
- [security-audit](/skills/security-audit) - review the module for missing events, injection and PII in logs
- [data-analysis](/skills/data-analysis) - build the evidence tables from exported audit events
