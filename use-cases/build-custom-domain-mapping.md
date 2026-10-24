---
title: Build Custom Domain Mapping for SaaS
slug: build-custom-domain-mapping
description: Build a custom domain system that lets SaaS customers use their own domain — with automated SSL via Let's Encrypt, DNS verification, tenant routing, and a self-service setup wizard.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - custom-domain
  - ssl
  - dns
  - saas
  - white-label
---

# Build Custom Domain Mapping for SaaS

## The Problem

Ada leads engineering at a 25-person website builder SaaS. Customers want their sites on their own domains (shop.acme.com) instead of acme.builder.io. Setting up a custom domain currently requires an engineer to manually configure the reverse proxy, generate SSL certificates, and update DNS records — about two hours per customer. Enterprise customers need this before signing. They need a self-service flow where customers add their domain, verify DNS, and get automatic SSL — all without engineering involvement.

## The Solution

Do not write an ACME client. Put [Caddy](https://caddyserver.com) in front of the app with On-Demand TLS: when a browser connects to a hostname Caddy has no certificate for, Caddy asks your app whether that name is allowed, obtains a certificate from Let's Encrypt during the handshake, stores it, and renews it in the background. The app only has to do three things: store domain claims in PostgreSQL, verify DNS ownership, and answer "is this host one of ours?" quickly (Redis in front of PostgreSQL). Hono serves the API, Caddy's ask endpoint and the tenant site; Zod validates the domain names.

Caddy's docs require that On-Demand TLS is restricted by an ask endpoint (otherwise anyone can make your server request certificates for any name), and recommend that the endpoint answers in milliseconds from an indexed lookup without DNS queries. Both shape the code below.

## Step 1: Store domain claims

```sql
CREATE TABLE custom_domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text NOT NULL,
  domain             text NOT NULL,
  status             text NOT NULL DEFAULT 'pending_dns' CHECK (status IN ('pending_dns', 'active')),
  verification_token text NOT NULL,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- Several tenants may claim a domain, but only one can have it active.
CREATE UNIQUE INDEX custom_domains_active_domain ON custom_domains (domain) WHERE status = 'active';
CREATE INDEX custom_domains_tenant ON custom_domains (tenant_id);
```

A claim stays `pending_dns` until the customer proves control. Several tenants can have a pending claim on the same name, but the partial unique index lets only one of them become `active`.

## Step 2: Add, verify and look up domains

Two DNS records are needed. A CNAME (or, for an apex domain, A records pointing at your servers) routes traffic to you. A TXT record containing a random token proves the customer controls the domain; without it, anyone could claim a domain that merely points at you. The token comes from `crypto.randomBytes`, not from tenant ids or timestamps.

```typescript
// src/domains.ts — domain claims, DNS verification and host -> tenant lookup
import { randomBytes } from "node:crypto";
import { resolveCname, resolve4, resolveTxt } from "node:dns/promises";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { z } from "zod";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "builder.io";
const CNAME_TARGET = process.env.CNAME_TARGET ?? `custom.${PLATFORM_DOMAIN}`;
const SERVER_IPS = (process.env.SERVER_IPS ?? "").split(",").filter(Boolean);

// Lowercase hostname with at least one dot; no scheme, port, path, IP literal or platform subdomain.
export const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Invalid domain")
  .refine((d) => d !== PLATFORM_DOMAIN && !d.endsWith(`.${PLATFORM_DOMAIN}`), "Reserved domain");

export async function addCustomDomain(tenantId: string, input: string) {
  const domain = DomainSchema.parse(input);
  const token = `builder-verify-${randomBytes(24).toString("base64url")}`;
  const { rows } = await pool.query(
    `INSERT INTO custom_domains (tenant_id, domain, verification_token)
     VALUES ($1, $2, $3) RETURNING id`,
    [tenantId, domain, token],
  );
  return {
    id: rows[0].id as string,
    domain,
    dns: [
      { type: "CNAME", host: domain, value: CNAME_TARGET },   // apex domains: use A/ALIAS records instead
      { type: "TXT", host: `_builder-verification.${domain}`, value: token },
    ],
  };
}

export async function verifyDomain(tenantId: string, id: string) {
  const { rows } = await pool.query(
    "SELECT domain, verification_token FROM custom_domains WHERE id = $1 AND tenant_id = $2",
    [id, tenantId],
  );
  if (!rows[0]) throw new Error("Domain not found");
  const { domain, verification_token: token } = rows[0];

  const routed = await pointsAtUs(domain);
  const owned = await resolveTxt(`_builder-verification.${domain}`)
    .then((records) => records.some((chunks) => chunks.join("") === token))
    .catch(() => false);
  if (!routed || !owned) return { routed, owned, active: false };

  // The partial unique index allows only one active claim per domain; the loser gets an error here.
  await pool.query(
    "UPDATE custom_domains SET status = 'active', verified_at = now() WHERE id = $1",
    [id],
  );
  await redis.set(`domain:${domain}`, tenantId, "EX", 300);
  return { routed, owned, active: true };
}

async function pointsAtUs(domain: string) {
  const cname = await resolveCname(domain).catch(() => []);
  if (cname.some((r) => r.replace(/\.$/, "").toLowerCase() === CNAME_TARGET)) return true;
  const a = await resolve4(domain).catch(() => []);
  return a.some((ip) => SERVER_IPS.includes(ip));
}

// Called on every request (and by Caddy's ask endpoint), so keep it to one cache hit or one indexed query.
export async function resolveTenant(rawHost: string): Promise<string | null> {
  const host = rawHost.toLowerCase().replace(/:\d+$/, "");
  const cached = await redis.get(`domain:${host}`);
  if (cached) return cached;

  const { rows } = await pool.query(
    "SELECT tenant_id FROM custom_domains WHERE domain = $1 AND status = 'active'",
    [host],
  );
  if (!rows[0]) return null;
  await redis.set(`domain:${host}`, rows[0].tenant_id, "EX", 300);
  return rows[0].tenant_id;
}

export async function removeDomain(tenantId: string, id: string) {
  const { rows } = await pool.query(
    "DELETE FROM custom_domains WHERE id = $1 AND tenant_id = $2 RETURNING domain",
    [id, tenantId],
  );
  if (rows[0]) await redis.del(`domain:${rows[0].domain}`);
}
```

## Step 3: Serve the API, the ask endpoint and the sites

Three small Hono apps run in one process, all on `127.0.0.1`. The ask endpoint must never be reachable from the internet, and Caddy is the only thing that talks to the tenant site.

```typescript
// src/server.ts — three Hono apps: customer API, Caddy's "ask" endpoint, and the tenant site
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ZodError } from "zod";
import { addCustomDomain, verifyDomain, resolveTenant, DomainSchema } from "./domains";

// 1. Customer-facing API (put your real auth middleware in front; tenantId must come from the session)
const api = new Hono<{ Variables: { tenantId: string } }>();
api.use("*", async (c, next) => {
  c.set("tenantId", "tenant-123"); // placeholder for your session lookup
  await next();
});
api.onError((err, c) =>
  err instanceof ZodError
    ? c.json({ error: err.issues[0].message }, 400)
    : c.json({ error: err.message }, 500),
);
api.post("/domains", async (c) => {
  const { domain } = await c.req.json();
  return c.json(await addCustomDomain(c.get("tenantId"), domain), 201);
});
api.post("/domains/:id/verify", async (c) =>
  c.json(await verifyDomain(c.get("tenantId"), c.req.param("id"))),
);

// 2. Caddy asks here before it requests a certificate. Internal only: bound to 127.0.0.1 below.
const internal = new Hono();
internal.get("/ask", async (c) => {
  const parsed = DomainSchema.safeParse(c.req.query("domain"));
  const tenant = parsed.success ? await resolveTenant(parsed.data) : null;
  return c.body(null, tenant ? 200 : 404);
});

// 3. The tenant site: Caddy forwards the customer's Host header unchanged
const site = new Hono<{ Variables: { tenant: string } }>();
site.use("*", async (c, next) => {
  const tenant = await resolveTenant(c.req.header("host") ?? "");
  if (!tenant) return c.text("Unknown domain", 404);
  c.set("tenant", tenant);
  await next();
});
site.get("/", (c) => c.text(`Site for ${c.get("tenant")}`));

const bind = { hostname: "127.0.0.1" };
serve({ fetch: api.fetch, port: 3001, ...bind });
serve({ fetch: internal.fetch, port: 3002, ...bind });
serve({ fetch: site.fetch, port: 3003, ...bind });
```

## Step 4: Configure Caddy

```caddy
{
	email ops@builder.io
	on_demand_tls {
		ask http://127.0.0.1:3002/ask
	}
}

# Any hostname that the ask endpoint approves gets a certificate on its first TLS handshake
https:// {
	tls {
		on_demand
	}
	reverse_proxy 127.0.0.1:3003
}
```

Open ports 80 and 443 on the server and keep Caddy's data directory on persistent storage, since that is where the issued certificates and account keys live. Customers' CNAME/A records must point at this server before the first handshake, because Let's Encrypt validates the domain over the public internet. For your own `*.builder.io` subdomains use a normal site block with a wildcard certificate (DNS challenge), not On-Demand TLS.

After `verifyDomain` succeeds the wizard can request `https://<domain>` once to warm the certificate; the first handshake is slower (seconds) while the certificate is issued, and later ones are fast.

## Verification

Run against local PostgreSQL 18 and Redis 8 with Caddy 2.11 (using Caddy's `internal` issuer instead of Let's Encrypt, so no public CA was contacted): adding a domain returns the DNS instructions; `/ask` returned 404 while pending and 200 once `active`; a TLS request for the approved name got a certificate and reached the tenant site, while an unapproved name failed the handshake and caused no issuance; reserved (`evil.builder.io`) and malformed names were rejected with 400. Real Let's Encrypt issuance and real DNS lookups were not exercised.

## Real-World Example

Ada's team ships this behind their dashboard's "Connect a domain" wizard. A customer enters `shop.acme.com`, the wizard shows the CNAME and TXT records, and a "Check now" button calls the verify endpoint. Once both records resolve, the domain turns active and the next visit gets a certificate. Setup that used to take an engineer two hours now takes the customer the time it takes to edit DNS, and renewals need no cron job because Caddy handles them. Removing a domain deletes the row and the Redis key, so the ask endpoint stops approving it immediately.

## Related Skills

- [typescript](/skills/typescript) — Typed domain, DNS and API code
- [redis](/skills/redis) — Caches the host to tenant mapping
- [postgresql](/skills/postgresql) — Stores domain claims with a partial unique index
- [hono](/skills/hono) — Serves the API, the ask endpoint and the tenant site
- [zod](/skills/zod) — Validates and normalizes domain names
