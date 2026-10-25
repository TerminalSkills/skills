---
name: audit-logging
description: >-
  Builds tamper-evident audit logs for compliance (SOC 2, HIPAA, PCI DSS): an append-only PostgreSQL
  table with a hash chain computed inside the database, a verification query, and an AWS CloudTrail
  plus S3 Object Lock archive. Use when building compliance audit trails, tracking who did what and
  when, or implementing immutable event logs that satisfy regulatory retention requirements.
license: Apache-2.0
compatibility: "PostgreSQL 14+ (built-in sha256, gen_random_uuid). Optional: Node.js 20+ with the pg package, AWS CLI v2."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "audit-logging, compliance, soc2, hipaa, immutable-log"
  use-cases: "Add HIPAA-compliant audit logging to a healthcare application, Build SOC 2 CC7 evidence with tamper-evident logs, Implement append-only audit trail with hash chaining"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Audit Logging

## Overview

A compliance audit log answers: **who** did **what** to **which resource**, **when**, from **where**, and with **what result**. It must also be tamper-evident, so an auditor can check that nobody edited or removed entries.

This skill puts the whole mechanism in PostgreSQL, so every application and every language gets it for free: a trigger links each row to the previous one by SHA-256, other triggers refuse UPDATE, DELETE and TRUNCATE, and one function re-checks the chain. The SQL below was run on PostgreSQL 18, including 40 concurrent inserts.

Retention floors to design for (confirm with your auditor, they depend on scope):

| Standard | Typical requirement |
|----------|---------------------|
| HIPAA | Documentation kept 6 years (45 CFR 164.316(b)(2)) |
| PCI DSS v4 (req. 10.5.1) | 12 months of history, the latest 3 months immediately available for analysis |
| SOC 2 | No fixed number; 1 year is the usual auditor expectation |
| GDPR | Only as long as the purpose needs; log IDs, not personal data |

## Instructions

### 1. Required fields

Every entry records: `id`, `occurred_at` (UTC), `actor_id` and `actor_type`, `action`, `resource_type` and `resource_id`, `result` (`success`, `failure`, `denied`) and the source `ip_address`. Add `session_id`, `reason` (the clinical or business justification HIPAA asks for) and `changed_fields` (names only). Never store passwords, tokens or full old values of sensitive fields: the log outlives the data and cannot be edited to remove them.

### 2. Append-only, hash-chained table

```sql
CREATE TABLE audit_logs (
  seq           BIGINT PRIMARY KEY,  -- chain position, assigned by the trigger
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_id      TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user','service','admin','system','anonymous')),
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  result        TEXT NOT NULL CHECK (result IN ('success','failure','denied')),
  ip_address    INET,
  session_id    TEXT,
  reason        TEXT,
  changed_fields TEXT[],
  prev_hash     BYTEA,
  hash          BYTEA NOT NULL
);
CREATE INDEX audit_actor_idx ON audit_logs (actor_id, occurred_at DESC);
CREATE INDEX audit_resource_idx ON audit_logs (resource_type, resource_id, occurred_at DESC);

-- The digest covers every business column, so changing any of them breaks the chain.
CREATE FUNCTION audit_row_digest(r audit_logs) RETURNS BYTEA LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to(jsonb_build_array(
    r.id, to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    r.actor_id, r.actor_type, r.action, r.resource_type, r.resource_id, r.result,
    host(r.ip_address), r.session_id, r.reason, r.changed_fields,
    encode(r.prev_hash, 'hex'))::text, 'UTF8'))
$$;

-- Link each new row to the previous one. The advisory lock serialises writers,
-- otherwise two concurrent inserts would share one parent and fork the chain.
-- SECURITY DEFINER: the trigger must read the previous row, which an INSERT-only role cannot do.
CREATE FUNCTION audit_chain() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_logs_chain'));
  SELECT seq + 1, hash INTO NEW.seq, NEW.prev_hash FROM audit_logs ORDER BY seq DESC LIMIT 1;
  NEW.seq := COALESCE(NEW.seq, 1);
  NEW.hash := audit_row_digest(NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE FUNCTION audit_forbid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_forbid();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_forbid();
```

The application never computes a hash. It inserts the business columns; `seq`, `prev_hash` and `hash` are filled by the trigger.

### 3. Verify the chain

```sql
CREATE FUNCTION audit_verify() RETURNS TABLE (broken_seq BIGINT) LANGUAGE sql STABLE AS $$
  SELECT seq FROM (
    SELECT a.*, lag(a.hash) OVER (ORDER BY seq) AS expected_prev FROM audit_logs a
  ) t
  WHERE t.hash IS DISTINCT FROM audit_row_digest(ROW(t.seq,t.id,t.occurred_at,t.actor_id,t.actor_type,
          t.action,t.resource_type,t.resource_id,t.result,t.ip_address,t.session_id,t.reason,
          t.changed_fields,t.prev_hash,t.hash)::audit_logs)
     OR t.prev_hash IS DISTINCT FROM t.expected_prev
  ORDER BY seq LIMIT 1
$$;

SELECT * FROM audit_verify();   -- zero rows = chain intact; otherwise the first broken seq
```

Run it on a schedule and alert on any row. A chain inside the same database protects against edits that bypass the triggers only if the verifier's result and a recent `hash` are also kept somewhere the database admin cannot change (step 5).

### 4. Write entries from the application

```javascript
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.AUDIT_DATABASE_URL });

export async function audit({ actorId, actorType = 'user', action, resourceType, resourceId,
                              result, ip, sessionId, reason, changedFields }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, resource_type, resource_id,
                             result, ip_address, session_id, reason, changed_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [actorId, actorType, action, resourceType, resourceId, result, ip, sessionId, reason, changedFields]);
}

// Express: log the access decision where it is made, not every request.
app.get('/patients/:id', requireLogin, async (req, res) => {
  const allowed = await canRead(req.user, req.params.id);
  await audit({ actorId: req.user.id, action: 'read', resourceType: 'patient_record',
                resourceId: req.params.id, result: allowed ? 'success' : 'denied',
                ip: req.ip, sessionId: req.sessionID, reason: req.query.reason });
  if (!allowed) return res.sendStatus(403);
  res.json(await loadPatient(req.params.id));
});
```

Await the insert for security-relevant actions: if the audit write fails, the action should fail too (fail closed). For low-value events, queue the insert instead and alert when the queue backs up.

Give the application a database role with only `INSERT` (and `SELECT` for the reviewer role) on `audit_logs`. The triggers stop honest mistakes; privileges stop the rest. The chain trigger runs as the table owner (`SECURITY DEFINER`), so that role needs no read access.

### 5. Anchor and archive outside the database

An attacker with superuser rights can disable the triggers and rewrite the whole chain consistently. Defend by periodically exporting the newest `hash` (and rotated rows) to storage the database cannot reach, such as an S3 bucket with Object Lock:

```bash
aws s3api create-bucket --bucket acme-audit-archive-2026 --region us-east-1 \
  --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --bucket acme-audit-archive-2026 \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"GOVERNANCE","Days":365}}}'
```

`GOVERNANCE` lets a privileged user with a special permission remove objects; `COMPLIANCE` lets nobody, not even the root account, until retention ends. Test with `GOVERNANCE`, and switch to `COMPLIANCE` only when the retention period is final: it cannot be shortened. Outside `us-east-1`, `create-bucket` also needs `--create-bucket-configuration LocationConstraint=<region>` with your region.

### 6. Cloud control-plane events: CloudTrail

CloudTrail records AWS API calls (not your application's events). Turn on log file validation, which signs digest files so deletion or edits are detectable:

```bash
aws cloudtrail create-trail --name org-audit-trail --s3-bucket-name acme-cloudtrail-2026 \
  --is-multi-region-trail --include-global-service-events --enable-log-file-validation
aws cloudtrail start-logging --name org-audit-trail
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail \
  --start-time 2026-10-01T00:00:00Z
```

The destination bucket needs the CloudTrail bucket policy before `create-trail` succeeds. `validate-logs` requires both `--trail-arn` and `--start-time`.

## Examples

### Example 1: "Prove nobody changed the patient access log"

```console
$ psql "$AUDIT_DATABASE_URL" -c "SELECT * FROM audit_verify();"
 broken_seq
------------
(0 rows)
```

Zero rows: every digest and every parent link matches. If someone edited the IP of row 2 with the triggers disabled, the same call returns `broken_seq = 2`.

### Example 2: "Who touched patient-456 and who was refused?"

```sql
SELECT occurred_at, actor_id, action, result, ip_address, reason
FROM audit_logs
WHERE resource_type = 'patient_record' AND resource_id = 'patient-456'
ORDER BY occurred_at DESC;

SELECT actor_id, COUNT(*) AS refused, MAX(occurred_at) AS last_attempt
FROM audit_logs
WHERE result IN ('failure','denied') AND occurred_at > now() - INTERVAL '24 hours'
GROUP BY actor_id HAVING COUNT(*) > 5
ORDER BY refused DESC;
```

The first query is the evidence for an access-review request; the second feeds a failed-access alert.

## Guidelines

- The chain serialises every insert behind one lock. That is fine up to a few hundred events per second; above that, shard by tenant (one chain per tenant) or batch inserts.
- Use the default READ COMMITTED isolation for writers. Under REPEATABLE READ the trigger can read a stale parent.
- `FOR EACH ROW` triggers do not fire for TRUNCATE, hence the separate statement-level trigger. A superuser can still drop triggers: monitor DDL on the table and keep the anchor from step 5.
- Do not partition or archive by deleting old rows; move whole partitions to the archive and keep the first remaining row's `prev_hash` as the new anchor.
- Log access to the audit log itself, and review it on a schedule (monthly for SOC 2, more often for high-risk systems).
- Keep personal data out of the log. Store IDs, and keep the sensitive values in the system of record, so erasure requests do not collide with immutability.
- Synchronise server clocks (NTP); `occurred_at` is only as trustworthy as the host's time.
- A log that is only written is not evidence. Run `audit_verify()` on a schedule, test a restore of the archive, and alert on gaps.
