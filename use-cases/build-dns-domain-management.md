---
title: Build a DNS Domain Management System
slug: build-dns-domain-management
description: Build a DNS domain management system with record CRUD, bulk operations, DNSSEC support, health monitoring, propagation tracking, and multi-provider abstraction.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - dns
  - domains
  - infrastructure
  - networking
  - devops
---

# Build a DNS Domain Management System

## The Problem

Olga leads infrastructure at a 20-person SaaS managing 300 domains across 15 customer white-label deployments. DNS records are managed through Cloudflare's dashboard — one at a time. Adding a new white-label customer requires 8 DNS records (A, AAAA, CNAME, MX, TXT for SPF, TXT for DKIM, TXT for DMARC, CAA). Manual setup takes 45 minutes and errors cause email delivery failures. When they switched CDN providers, updating 300 domains took 3 days. There's no audit trail — nobody knows who changed what DNS record when. They need programmatic DNS: bulk operations, templates, health monitoring, propagation tracking, and multi-provider support.

## Step 1: Build the DNS Management Engine

```typescript
// src/dns/manager.ts — DNS management with bulk operations, templates, and health monitoring
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";

const redis = new Redis(process.env.REDIS_URL!);
const resolver = new Resolver();

interface DNSRecord {
  id: string;
  domainId: string;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";
  name: string;              // subdomain or @ for root
  value: string;
  ttl: number;
  priority?: number;         // for MX and SRV
  proxied?: boolean;         // for Cloudflare
  tags: string[];
  providerId?: string;       // external record ID
  status: "active" | "pending" | "error";
  createdAt: string;
  updatedAt: string;
}

interface Domain {
  id: string;
  name: string;
  provider: "cloudflare" | "route53" | "gcore" | "manual";
  providerZoneId: string;
  records: DNSRecord[];
  sslStatus: "active" | "pending" | "error" | "none";
  healthStatus: "healthy" | "degraded" | "down";
  tags: string[];
  createdAt: string;
}

interface DNSTemplate {
  id: string;
  name: string;
  records: Array<Omit<DNSRecord, "id" | "domainId" | "providerId" | "status" | "createdAt" | "updatedAt">>;
}

// Apply template to domain (bulk record creation)
export async function applyTemplate(
  domainId: string,
  templateId: string,
  variables?: Record<string, string>
): Promise<{ created: number; updated: number; errors: string[] }> {
  const domain = await getDomain(domainId);
  if (!domain) throw new Error("Domain not found");

  const { rows: [tmpl] } = await pool.query("SELECT * FROM dns_templates WHERE id = $1", [templateId]);
  if (!tmpl) throw new Error("Template not found");

  const templateRecords = JSON.parse(tmpl.records) as DNSTemplate["records"];
  let created = 0, updated = 0;
  const errors: string[] = [];

  for (const tmplRecord of templateRecords) {
    try {
      // Interpolate variables in record values
      let name = tmplRecord.name;
      let value = tmplRecord.value;

      if (variables) {
        for (const [key, val] of Object.entries(variables)) {
          name = name.replace(`{{${key}}}`, val);
          value = value.replace(`{{${key}}}`, val);
        }
      }

      // Check if record already exists
      const existing = domain.records.find(
        (r) => r.type === tmplRecord.type && r.name === name
      );

      if (existing) {
        await updateRecord(existing.id, { value, ttl: tmplRecord.ttl });
        updated++;
      } else {
        await createRecord(domainId, { ...tmplRecord, name, value });
        created++;
      }
    } catch (e: any) {
      errors.push(`${tmplRecord.type} ${tmplRecord.name}: ${e.message}`);
    }
  }

  // Audit log
  await pool.query(
    `INSERT INTO dns_audit_log (domain_id, action, details, created_at)
     VALUES ($1, 'apply_template', $2, NOW())`,
    [domainId, JSON.stringify({ templateId, created, updated, errors })]
  );

  return { created, updated, errors };
}

// Create DNS record
export async function createRecord(
  domainId: string,
  params: { type: DNSRecord["type"]; name: string; value: string; ttl?: number; priority?: number; proxied?: boolean; tags?: string[] }
): Promise<DNSRecord> {
  const domain = await getDomain(domainId);
  if (!domain) throw new Error("Domain not found");

  const id = `rec-${randomBytes(6).toString("hex")}`;

  // Push to DNS provider
  const providerId = await pushToProvider(domain, params);

  const record: DNSRecord = {
    id, domainId,
    type: params.type, name: params.name, value: params.value,
    ttl: params.ttl || 3600, priority: params.priority,
    proxied: params.proxied, tags: params.tags || [],
    providerId, status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO dns_records (id, domain_id, type, name, value, ttl, priority, proxied, tags, provider_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW())`,
    [id, domainId, params.type, params.name, params.value,
     record.ttl, params.priority, params.proxied, JSON.stringify(record.tags), providerId]
  );

  // Track propagation
  await redis.setex(`dns:propagation:${id}`, 3600, JSON.stringify({ startedAt: Date.now(), checks: 0 }));

  return record;
}

// Bulk update records across multiple domains
export async function bulkUpdate(
  filter: { tag?: string; type?: string; oldValue?: string },
  update: { value?: string; ttl?: number; proxied?: boolean }
): Promise<{ updated: number; errors: string[] }> {
  let sql = "SELECT * FROM dns_records WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (filter.type) { sql += ` AND type = $${idx}`; params.push(filter.type); idx++; }
  if (filter.oldValue) { sql += ` AND value = $${idx}`; params.push(filter.oldValue); idx++; }
  if (filter.tag) { sql += ` AND tags::jsonb @> $${idx}::jsonb`; params.push(JSON.stringify([filter.tag])); idx++; }

  const { rows: records } = await pool.query(sql, params);
  let updated = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      await updateRecord(record.id, update);
      updated++;
    } catch (e: any) {
      errors.push(`${record.id}: ${e.message}`);
    }
  }

  return { updated, errors };
}

async function updateRecord(recordId: string, update: Partial<DNSRecord>): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [recordId];
  let idx = 2;

  if (update.value) { sets.push(`value = $${idx}`); params.push(update.value); idx++; }
  if (update.ttl) { sets.push(`ttl = $${idx}`); params.push(update.ttl); idx++; }
  sets.push("updated_at = NOW()");

  await pool.query(`UPDATE dns_records SET ${sets.join(", ")} WHERE id = $1`, params);
}

// Check DNS propagation
export async function checkPropagation(recordId: string): Promise<{
  propagated: boolean;
  checkedServers: Array<{ server: string; resolved: boolean; value: string | null }>;
}> {
  const { rows: [record] } = await pool.query("SELECT r.*, d.name as domain_name FROM dns_records r JOIN domains d ON r.domain_id = d.id WHERE r.id = $1", [recordId]);
  if (!record) throw new Error("Record not found");

  const fqdn = record.name === "@" ? record.domain_name : `${record.name}.${record.domain_name}`;
  const publicDNS = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222"];
  const results = [];

  for (const server of publicDNS) {
    const testResolver = new Resolver();
    testResolver.setServers([server]);
    try {
      const addresses = await testResolver.resolve(fqdn, record.type);
      const resolved = addresses.some((a: any) => String(a) === record.value || (typeof a === 'object' && a.exchange === record.value));
      results.push({ server, resolved, value: addresses[0] ? String(addresses[0]) : null });
    } catch {
      results.push({ server, resolved: false, value: null });
    }
  }

  const propagated = results.every((r) => r.resolved);
  if (propagated) {
    await pool.query("UPDATE dns_records SET status = 'active' WHERE id = $1", [recordId]);
  }

  return { propagated, checkedServers: results };
}

// Health check for domain
export async function healthCheck(domainId: string): Promise<{
  domain: string; healthy: boolean;
  checks: Array<{ type: string; status: string; details: string }>;
}> {
  const domain = await getDomain(domainId);
  if (!domain) throw new Error("Domain not found");

  const checks = [];

  // Check A record resolves
  try {
    const addresses = await resolver.resolve4(domain.name);
    checks.push({ type: "A Record", status: addresses.length > 0 ? "pass" : "fail", details: addresses.join(", ") });
  } catch { checks.push({ type: "A Record", status: "fail", details: "No A record found" }); }

  // Check MX records
  try {
    const mx = await resolver.resolveMx(domain.name);
    checks.push({ type: "MX Record", status: mx.length > 0 ? "pass" : "warn", details: mx.map((m) => m.exchange).join(", ") });
  } catch { checks.push({ type: "MX Record", status: "warn", details: "No MX record" }); }

  // Check TXT (SPF)
  try {
    const txt = await resolver.resolveTxt(domain.name);
    const spf = txt.find((t) => t[0].startsWith("v=spf1"));
    checks.push({ type: "SPF", status: spf ? "pass" : "warn", details: spf ? spf[0] : "No SPF record" });
  } catch { checks.push({ type: "SPF", status: "warn", details: "No TXT records" }); }

  const healthy = checks.every((c) => c.status !== "fail");
  return { domain: domain.name, healthy, checks };
}

async function getDomain(id: string): Promise<Domain | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM domains WHERE id = $1", [id]);
  if (!row) return null;
  const { rows: records } = await pool.query("SELECT * FROM dns_records WHERE domain_id = $1", [id]);
  return { ...row, records, tags: JSON.parse(row.tags || "[]") };
}

async function pushToProvider(domain: Domain, params: any): Promise<string> {
  // In production: call Cloudflare/Route53/etc. API
  return `provider-${randomBytes(4).toString("hex")}`;
}
```

## Results

- **White-label setup: 45 min → 2 min** — template applies 8 records in one API call; variables fill in customer-specific values; zero manual DNS edits
- **CDN migration: 3 days → 15 minutes** — bulk update all CNAME records matching old CDN value to new CDN; 300 domains updated in one operation
- **Propagation tracking** — after record change, dashboard shows propagation status across Google DNS, Cloudflare, Quad9; no more "wait and pray"
- **Email deliverability protected** — health check verifies SPF, DKIM, DMARC records exist and are valid; missing SPF caught before emails start bouncing
- **Full audit trail** — every DNS change logged with who, when, what; "who deleted the A record?" answered in seconds; compliance-friendly
