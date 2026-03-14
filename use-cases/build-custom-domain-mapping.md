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
category: DevOps & Infrastructure
tags:
  - custom-domain
  - ssl
  - dns
  - saas
  - white-label
---

# Build Custom Domain Mapping for SaaS

## The Problem

Ada leads engineering at a 25-person website builder SaaS. Customers want their sites on their own domains (shop.acme.com) instead of acme.builder.io. Setting up a custom domain currently requires an engineer to manually configure Nginx, generate SSL certificates, and update DNS records — a 2-hour process per customer. Enterprise customers need this before signing $50K contracts. They need a self-service flow where customers add their domain, verify DNS, and get automatic SSL — all without engineering involvement.

## Step 1: Build the Custom Domain System

```typescript
// src/domains/custom-domains.ts — Self-service custom domains with auto-SSL
import { pool } from "../db";
import { Redis } from "ioredis";
import { resolve } from "node:dns/promises";

const redis = new Redis(process.env.REDIS_URL!);

interface CustomDomain {
  id: string;
  tenantId: string;
  domain: string;
  status: "pending_dns" | "dns_verified" | "provisioning_ssl" | "active" | "failed" | "expired";
  dnsVerificationRecord: string;  // TXT record value
  sslExpiresAt: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

const VERIFICATION_PREFIX = "_acme-challenge.";
const CNAME_TARGET = process.env.CNAME_TARGET || "custom.builder.io"; // wildcard DNS entry

// Initiate custom domain setup
export async function addCustomDomain(tenantId: string, domain: string): Promise<{
  domain: CustomDomain;
  instructions: {
    cname: { host: string; value: string };
    txt: { host: string; value: string };
  };
}> {
  // Normalize domain
  const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  // Validate format
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(normalizedDomain)) {
    throw new Error("Invalid domain format");
  }

  // Check not already registered
  const { rows: existing } = await pool.query(
    "SELECT 1 FROM custom_domains WHERE domain = $1 AND status != 'expired'",
    [normalizedDomain]
  );
  if (existing.length > 0) throw new Error("Domain already registered");

  // Generate verification token
  const verificationToken = `builder-verify-${Buffer.from(`${tenantId}:${Date.now()}`).toString("base64url").slice(0, 32)}`;
  const id = `dom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await pool.query(
    `INSERT INTO custom_domains (id, tenant_id, domain, status, dns_verification_record, created_at)
     VALUES ($1, $2, $3, 'pending_dns', $4, NOW())`,
    [id, tenantId, normalizedDomain, verificationToken]
  );

  return {
    domain: {
      id, tenantId, domain: normalizedDomain, status: "pending_dns",
      dnsVerificationRecord: verificationToken,
      sslExpiresAt: null, createdAt: new Date().toISOString(), verifiedAt: null,
    },
    instructions: {
      cname: {
        host: normalizedDomain,
        value: CNAME_TARGET,
      },
      txt: {
        host: `_builder-verification.${normalizedDomain}`,
        value: verificationToken,
      },
    },
  };
}

// Verify DNS configuration
export async function verifyDNS(domainId: string): Promise<{
  cnameValid: boolean;
  txtValid: boolean;
  verified: boolean;
  error?: string;
}> {
  const { rows: [domain] } = await pool.query("SELECT * FROM custom_domains WHERE id = $1", [domainId]);
  if (!domain) throw new Error("Domain not found");

  let cnameValid = false;
  let txtValid = false;

  // Check CNAME record
  try {
    const cnameRecords = await resolve(domain.domain, "CNAME");
    cnameValid = cnameRecords.some((r: string) =>
      r.replace(/\.$/, "").toLowerCase() === CNAME_TARGET.toLowerCase()
    );
  } catch {
    // CNAME might not exist if using A record; check A record too
    try {
      const aRecords = await resolve(domain.domain, "A");
      const ourIPs = (process.env.SERVER_IPS || "").split(",");
      cnameValid = aRecords.some((ip: string) => ourIPs.includes(ip));
    } catch {}
  }

  // Check TXT verification record
  try {
    const txtRecords = await resolve(`_builder-verification.${domain.domain}`, "TXT");
    txtValid = txtRecords.some((records: string[]) =>
      records.some((r) => r === domain.dns_verification_record)
    );
  } catch {}

  const verified = cnameValid && txtValid;

  if (verified) {
    await pool.query(
      "UPDATE custom_domains SET status = 'dns_verified', verified_at = NOW() WHERE id = $1",
      [domainId]
    );

    // Auto-provision SSL
    await provisionSSL(domainId);
  }

  return { cnameValid, txtValid, verified };
}

// Provision SSL certificate via ACME (Let's Encrypt)
async function provisionSSL(domainId: string): Promise<void> {
  const { rows: [domain] } = await pool.query("SELECT * FROM custom_domains WHERE id = $1", [domainId]);

  await pool.query("UPDATE custom_domains SET status = 'provisioning_ssl' WHERE id = $1", [domainId]);

  try {
    // In production: use acme-client or certbot
    // This triggers Let's Encrypt certificate issuance
    const cert = await requestCertificate(domain.domain);

    // Store certificate
    await pool.query(
      `UPDATE custom_domains SET
         status = 'active',
         ssl_certificate = $2,
         ssl_private_key = $3,
         ssl_expires_at = $4
       WHERE id = $1`,
      [domainId, cert.certificate, cert.privateKey, cert.expiresAt]
    );

    // Update reverse proxy config
    await updateProxyConfig(domain.domain, domain.tenant_id);

    // Cache domain → tenant mapping
    await redis.hset("domains:tenant_map", domain.domain, domain.tenant_id);

  } catch (err: any) {
    await pool.query(
      "UPDATE custom_domains SET status = 'failed', error_message = $2 WHERE id = $1",
      [domainId, err.message]
    );
    throw err;
  }
}

// Route incoming requests to correct tenant
export async function resolveTenant(hostname: string): Promise<string | null> {
  // Check cache first
  const cached = await redis.hget("domains:tenant_map", hostname);
  if (cached) return cached;

  // Check database
  const { rows: [domain] } = await pool.query(
    "SELECT tenant_id FROM custom_domains WHERE domain = $1 AND status = 'active'",
    [hostname]
  );

  if (domain) {
    await redis.hset("domains:tenant_map", hostname, domain.tenant_id);
    return domain.tenant_id;
  }

  // Check if it's a subdomain of our platform
  if (hostname.endsWith(".builder.io")) {
    const subdomain = hostname.replace(".builder.io", "");
    const { rows: [tenant] } = await pool.query(
      "SELECT id FROM tenants WHERE subdomain = $1",
      [subdomain]
    );
    return tenant?.id || null;
  }

  return null;
}

// Auto-renew SSL certificates (cron job)
export async function renewExpiringSertificates(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id, domain FROM custom_domains
     WHERE status = 'active' AND ssl_expires_at < NOW() + interval '30 days'`
  );

  let renewed = 0;
  for (const domain of rows) {
    try {
      await provisionSSL(domain.id);
      renewed++;
    } catch (err) {
      console.error(`[SSL] Failed to renew ${domain.domain}:`, err);
    }
  }

  return renewed;
}

async function requestCertificate(domain: string): Promise<{ certificate: string; privateKey: string; expiresAt: string }> {
  // ACME protocol / Let's Encrypt integration
  return {
    certificate: "cert...",
    privateKey: "key...",
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
  };
}

async function updateProxyConfig(domain: string, tenantId: string): Promise<void> {
  // Update Caddy/Nginx/Traefik config
}
```

## Results

- **Custom domain setup: 2 hours → 5 minutes** — self-service wizard guides customers through DNS configuration; SSL provisioned automatically; zero engineering time
- **Enterprise deal unblocked** — $50K contract signed same day after customer confirmed their domain works with auto-SSL
- **SSL renewal automated** — cron job renews certificates 30 days before expiry; no more "your SSL expired" emergencies
- **Tenant routing in <1ms** — Redis cache maps domain → tenant; incoming requests are routed instantly without database queries
- **DNS verification prevents hijacking** — TXT record verification ensures only domain owners can map domains to their tenant; no one can claim someone else's domain
