---
title: Build an E-Signature System
slug: build-e-signature-system
description: Build a document signing system with signing links, multi-party signing order, a hash-chained audit trail, reminders and a completion certificate, replacing a hosted e-signature tool for internal workflows.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - s3-storage
  - pdfkit
category: development
tags:
  - e-signature
  - documents
  - legal
  - workflow
  - pdf
---

# Build an E-Signature System

## The Problem

Oscar leads ops at a 40-person company that sends 200+ contracts a month through a hosted e-signature service. The flow is rigid: sales fills details, legal reviews, the client signs, then the company countersigns. The service does not talk to their CRM or enforce that chain, so they want signing embedded in their own app.

## What the Law Says (read this before shipping)

Engineering guidance, not legal advice; have counsel review it.

- **United States.** The ESIGN Act says a signature or contract may not be denied legal effect, validity or enforceability solely because it is in electronic form ([15 U.S.C. 7001(a)](https://www.law.cornell.edu/uscode/text/15/7001)). When a law requires information to be given to a *consumer* in writing, the consumer must first consent to electronic records after a clear disclosure (7001(c)). Some documents are excluded, such as wills, family-law matters, much of the UCC, and court orders ([15 U.S.C. 7003](https://www.law.cornell.edu/uscode/text/15/7003)).
- **European Union.** Under [eIDAS (Regulation 910/2014), Article 25](https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng), an electronic signature cannot be denied legal effect or admissibility solely because it is electronic. Only a *qualified* electronic signature has the effect of a handwritten one. An *advanced* signature (Article 26) must be uniquely linked to the signatory, under their sole control, and make later changes to the data detectable. An emailed link plus a drawn signature, as built here, is a simple electronic signature: valid in principle, but weaker evidence than an advanced or qualified one. If you need those levels, use a qualified trust service provider.

## Step 1: Schema

Requests, signers and an append-only audit log. Tokens are stored only as SHA-256 hashes.

```sql
CREATE TABLE signing_requests (
  id text PRIMARY KEY, title text NOT NULL,
  document_key text NOT NULL, document_sha256 text NOT NULL,   -- S3 object key and its hash
  status text NOT NULL DEFAULT 'pending',                      -- pending | completed | declined
  fields jsonb NOT NULL, created_by text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, certificate_key text
);
CREATE TABLE signers (
  id text PRIMARY KEY, request_id text NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
  name text NOT NULL, email text NOT NULL, role text NOT NULL,
  step int NOT NULL,                                           -- same step = parallel, higher waits
  status text NOT NULL DEFAULT 'waiting',                      -- waiting | notified | signed | declined
  token_hash text UNIQUE, notified_at timestamptz, signed_at timestamptz,
  signature text, field_values jsonb, signer_ip text
);
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, request_id text NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
  action text NOT NULL, actor text NOT NULL, ip text NOT NULL, user_agent text NOT NULL,
  details text NOT NULL, at timestamptz NOT NULL, prev_hash text NOT NULL, hash text NOT NULL
);
CREATE INDEX ON signers (request_id); CREATE INDEX ON audit_events (request_id, id);
```

## Step 2: The Signing Engine
Three rules matter more than the rest. The request row is locked with `FOR UPDATE` while a signature is recorded, so two simultaneous submissions cannot both pass the "not signed yet" check. Signing links are random 32-byte values stored as a hash and replaced on every reminder. The audit log hashes each row together with the previous one.

```typescript
// src/signing/engine.ts
import { randomBytes, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export interface FieldSpec {
  id: string; signerEmail: string; type: "signature" | "initials" | "date" | "text" | "checkbox";
  page: number; x: number; y: number; width: number; height: number; required: boolean;
}
export interface SignerSpec { name: string; email: string; role: string; step: number }
export interface Meta { ip: string; userAgent: string }
// Append-only audit log: each row hashes the previous one, so editing an old row breaks the chain.
// Call inside a transaction that holds the request row lock.
async function audit(db: PoolClient, requestId: string, action: string, actor: string, meta: Meta, details = "") {
  const { rows } = await db.query(
    "SELECT hash FROM audit_events WHERE request_id = $1 ORDER BY id DESC LIMIT 1", [requestId]);
  const prev: string = rows[0]?.hash ?? "";
  const at = new Date().toISOString();
  const hash = sha256([prev, requestId, action, actor, meta.ip, at, details].join("|"));
  await db.query(
    `INSERT INTO audit_events (request_id, action, actor, ip, user_agent, details, at, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [requestId, action, actor, meta.ip, meta.userAgent, details, at, prev, hash]);
}
// Each notification rotates the signer's token; only its SHA-256 is stored.
async function notify(db: PoolClient, signerId: string, kind: "signing_request" | "signing_reminder") {
  const token = randomBytes(32).toString("base64url");
  const { rows: [s] } = await db.query(
    `UPDATE signers SET token_hash = $2, status = CASE WHEN status = 'waiting' THEN 'notified' ELSE status END,
            notified_at = now() WHERE id = $1 RETURNING name, email`, [signerId, sha256(token)]);
  const signingUrl = `${process.env.APP_URL}/sign/${token}`;
  await redis.rpush("email:queue", JSON.stringify({ type: kind, to: s.email, signerName: s.name, signingUrl }));
}
export async function createRequest(
  documentKey: string, documentSha256: string, title: string, signers: SignerSpec[],
  fields: FieldSpec[], createdBy: string, expiresInDays = 30,
): Promise<string> {
  const id = `req_${randomBytes(8).toString("hex")}`;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO signing_requests (id, title, document_key, document_sha256, fields, created_by, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7))`,
      [id, title, documentKey, documentSha256, JSON.stringify(fields), createdBy, expiresInDays]);
    const ids: { id: string; step: number }[] = [];
    for (const s of signers) {
      const sid = `sgn_${randomBytes(6).toString("hex")}`;
      await db.query("INSERT INTO signers (id, request_id, name, email, role, step) VALUES ($1,$2,$3,$4,$5,$6)",
        [sid, id, s.name, s.email.toLowerCase(), s.role, s.step]);
      ids.push({ id: sid, step: s.step });
    }
    await audit(db, id, "created", createdBy, { ip: "", userAgent: "" }, `document sha256 ${documentSha256}`);
    const first = Math.min(...signers.map((s) => s.step));
    for (const s of ids.filter((x) => x.step === first)) await notify(db, s.id, "signing_request");
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  return id;
}
export async function sign(token: string, values: Record<string, string>, signature: string, meta: Meta) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [found] } = await db.query("SELECT id, request_id FROM signers WHERE token_hash = $1", [sha256(token)]);
    if (!found) throw new Error("Invalid or expired link");
    // Lock the request row: two simultaneous submissions for the same request run one after the other
    const { rows: [req] } = await db.query("SELECT * FROM signing_requests WHERE id = $1 FOR UPDATE", [found.request_id]);
    if (req.status !== "pending" || new Date(req.expires_at) < new Date()) throw new Error("Request is closed");
    const { rows: signers } = await db.query("SELECT * FROM signers WHERE request_id = $1 ORDER BY step", [req.id]);
    const me = signers.find((s) => s.id === found.id);
    if (me.status === "signed") throw new Error("Already signed");
    if (signers.some((s) => s.step < me.step && s.status !== "signed")) throw new Error("Not your turn yet");
    for (const f of (req.fields as FieldSpec[]).filter((f) => f.signerEmail === me.email)) {
      if (f.required && !values[f.id]) throw new Error(`Field ${f.id} is required`);
    }
    await db.query("UPDATE signers SET status='signed', signed_at=now(), signature=$2, field_values=$3, signer_ip=$4 WHERE id=$1",
      [me.id, signature, JSON.stringify(values), meta.ip]);
    await audit(db, req.id, "signed", `${me.name} <${me.email}>`, meta, `role ${me.role}`);
    const remaining = signers.filter((s) => s.id !== me.id && s.status !== "signed");
    if (remaining.length === 0) {
      await db.query("UPDATE signing_requests SET status = 'completed', completed_at = now() WHERE id = $1", [req.id]);
      await audit(db, req.id, "completed", "system", { ip: "", userAgent: "" });
    } else if (!remaining.some((s) => s.step <= me.step)) {
      const next = Math.min(...remaining.map((s) => s.step));
      for (const s of remaining.filter((s) => s.step === next)) await notify(db, s.id, "signing_request");
    }
    await db.query("COMMIT");
    if (remaining.length === 0) await redis.rpush("jobs:certificate", req.id); // after commit
    return { completed: remaining.length === 0 };
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
// Run from cron (for example every hour): remind signers who were notified 3+ days ago
export async function sendReminders() {
  const db = await pool.connect();
  try {
    const { rows } = await db.query(
      `SELECT s.id FROM signers s JOIN signing_requests r ON r.id = s.request_id
       WHERE r.status = 'pending' AND r.expires_at > now() AND s.status = 'notified'
         AND s.notified_at < now() - interval '3 days' LIMIT 100`);
    for (const { id } of rows) await notify(db, id, "signing_reminder");
  } finally { db.release(); }
}
```

## Step 3: HTTP API with Hono and Zod
The CRM creates requests with an HMAC-signed call (constant-time compare). Signers use the link token, a per-IP Redis rate limit guards guessing, and the PDF is served through a 5-minute presigned S3 URL.

```typescript
// src/routes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Redis } from "ioredis";
import { createRequest, sign } from "./signing/engine";
import { pool } from "./db";
const s3 = new S3Client({ region: process.env.S3_REGION });
const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();
const createBody = z.object({
  documentKey: z.string().min(1),
  title: z.string().min(1).max(200),
  signers: z.array(z.object({ name: z.string().min(1), email: z.email(), role: z.string(), step: z.number().int().min(1) })).min(1).max(10),
  fields: z.array(z.object({  // where each signer fills in the PDF (coordinates in points)
    id: z.string(), signerEmail: z.email(), type: z.enum(["signature", "initials", "date", "text", "checkbox"]),
    page: z.number().int().min(1), x: z.number(), y: z.number(), width: z.number(), height: z.number(), required: z.boolean(),
  })),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
// Internal API called by your CRM. Authenticate it with a shared HMAC of the body (constant-time compare).
app.post("/api/requests", async (c, next) => {
  const raw = await c.req.raw.clone().text();
  const expected = createHmac("sha256", process.env.CRM_WEBHOOK_SECRET!).update(raw).digest();
  const given = Buffer.from(c.req.header("x-signature") ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return c.text("Unauthorized", 401);
  await next();
}, zValidator("json", createBody), async (c) => {
  const b = c.req.valid("json");
  // Hash the stored PDF now; the hash goes into the audit log and the completion certificate
  const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: b.documentKey }));
  const sha = createHash("sha256").update(await obj.Body!.transformToByteArray()).digest("hex");
  const id = await createRequest(b.documentKey, sha, b.title, b.signers, b.fields, "crm", b.expiresInDays);
  return c.json({ id }, 201);
});
// The URL token is the credential; limit guesses per IP.
async function limited(ip: string) {
  const n = await redis.incr(`rl:sign:${ip}`);
  if (n === 1) await redis.expire(`rl:sign:${ip}`, 60);
  return n > 30;
}
// Trust x-forwarded-for only behind your own reverse proxy, which must overwrite it; otherwise clients can spoof the rate limit and the audit IP
const ipOf = (c: { req: { header(n: string): string | undefined } }) => c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "";
app.get("/api/sign/:token", async (c) => {
  if (await limited(ipOf(c))) return c.text("Too many requests", 429);
  const hash = createHash("sha256").update(c.req.param("token")).digest("hex");
  const { rows: [r] } = await pool.query(
    `SELECT r.title, r.document_key, r.fields, r.status, s.email FROM signers s
     JOIN signing_requests r ON r.id = s.request_id WHERE s.token_hash = $1 AND r.expires_at > now()`, [hash]);
  if (!r || r.status !== "pending") return c.text("Not found", 404);
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: r.document_key }), { expiresIn: 300 });
  return c.json({ title: r.title, documentUrl: url, fields: r.fields.filter((f: { signerEmail: string }) => f.signerEmail === r.email) });
});
const signBody = z.object({ values: z.record(z.string(), z.string().max(2000)),
  signature: z.string().max(200_000) }); // typed name or PNG data URL from the signature pad
app.post("/api/sign/:token", zValidator("json", signBody), async (c) => {
  const ip = ipOf(c);
  if (await limited(ip)) return c.text("Too many requests", 429);
  const { values, signature } = c.req.valid("json");
  try {
    return c.json(await sign(c.req.param("token"), values, signature, { ip, userAgent: c.req.header("user-agent") ?? "" }));
  } catch (e) { return c.json({ error: (e as Error).message }, 409); }
});
export default app;
```

## Step 4: Completion Certificate
A worker pops request ids from the `jobs:certificate` Redis list, re-hashes the stored PDF, compares it with the hash recorded at creation, and writes a certificate PDF with the signers and the audit trail next to the original in S3.

```typescript
// src/signing/certificate.ts: run by a worker that pops request ids from the jobs:certificate list
import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { pool } from "../db";
const s3 = new S3Client({ region: process.env.S3_REGION });
export async function buildCertificate(requestId: string) {
  const q = (sql: string) => pool.query(sql, [requestId]).then((r) => r.rows);
  const [req] = await q("SELECT * FROM signing_requests WHERE id = $1");
  const signers = await q("SELECT * FROM signers WHERE request_id = $1 ORDER BY step, signed_at");
  const events = await q("SELECT * FROM audit_events WHERE request_id = $1 ORDER BY id");
  // The stored PDF must still match the hash recorded when the request was created
  const orig = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: req.document_key }));
  const sha = createHash("sha256").update(await orig.Body!.transformToByteArray()).digest("hex");
  if (sha !== req.document_sha256) throw new Error(`Document ${requestId} changed after signing started`);
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(chunks))));
  doc.fontSize(16).text("Certificate of completion").fontSize(10).moveDown()
    .text(`Document: ${req.title}\nRequest: ${requestId}\nSHA-256: ${sha}`).moveDown().text("Signers");
  for (const s of signers) doc.fontSize(10).text(`${s.name} <${s.email}> (${s.role}) signed ${s.signed_at.toISOString()} from ${s.signer_ip}`);
  doc.moveDown().fontSize(10).text("Audit trail (hash prefix)");
  for (const e of events) doc.fontSize(8).text(`${e.at.toISOString()}  ${e.action}  ${e.actor}  ${e.ip}  ${e.hash.slice(0, 16)}`);
  doc.end();
  const key = `certificates/${requestId}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: await done, ContentType: "application/pdf" }));
  await pool.query("UPDATE signing_requests SET certificate_key = $2 WHERE id = $1", [requestId, key]);
}
```

The certificate lists the signatures; it does not stamp them onto the contract's pages (that needs a PDF editing library in the same worker).

## Check It and What to Expect

Against Postgres 18 and Redis 7 in containers, a test created a three-signer request (step 1, then two parallel step-2 signers). Order was enforced, a missing required field was rejected, two simultaneous submissions with one link gave one success and one "Already signed", a reused link was refused, the last signature queued the certificate job, the audit hashes recomputed correctly, and reminders queued one email per overdue signer. The S3 calls and the certificate worker were type-checked only.

The audit chain is tamper-evident only if you also store the latest hash where an administrator cannot rewrite it (a separate bucket with object lock, for example).

## Related Skills

- [typescript](/skills/typescript): strict types for the engine, routes and worker
- [redis](/skills/redis): email and certificate job queues, and the per-IP rate limit
- [postgresql](/skills/postgresql): transactional state, `FOR UPDATE` locking and the audit table
- [hono](/skills/hono): the HTTP API for the CRM and the signer pages
- [zod](/skills/zod): validation of request bodies, signer lists and field coordinates
- [s3-storage](/skills/s3-storage): storing the contract and certificate, presigned download links
- [pdfkit](/skills/pdfkit): generating the completion certificate PDF
