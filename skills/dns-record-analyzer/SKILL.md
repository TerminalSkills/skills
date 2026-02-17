---
name: dns-record-analyzer
description: >-
  Audits and troubleshoots DNS records for domains including A, AAAA, CNAME,
  MX, TXT, SPF, DKIM, DMARC, CAA, and NS records. Use when someone needs
  to verify DNS configuration, debug DNS propagation issues, check email
  authentication records, or audit domain security. Trigger words: DNS records,
  dig, nslookup, SPF, DKIM, DMARC, MX records, DNS propagation, nameservers,
  CAA, domain configuration.
license: Apache-2.0
compatibility: "Requires dig or nslookup (available on most systems)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["dns", "domain", "email-authentication", "infrastructure"]
---

# DNS Record Analyzer

## Overview

This skill queries and analyzes DNS records for domains, checking for correctness, security best practices, and common misconfigurations. It covers standard records (A, CNAME, MX) and email authentication records (SPF, DKIM, DMARC) with specific validation rules for each.

## Instructions

### Step 1: Query All Record Types

```bash
DOMAIN="example.com"

# Core records
dig +short A $DOMAIN
dig +short AAAA $DOMAIN
dig +short CNAME $DOMAIN
dig +short MX $DOMAIN
dig +short NS $DOMAIN
dig +short TXT $DOMAIN

# Email authentication
dig +short TXT $DOMAIN | grep "v=spf1"
dig +short TXT _dmarc.$DOMAIN
dig +short TXT default._domainkey.$DOMAIN

# Security
dig +short CAA $DOMAIN
dig +short SOA $DOMAIN
```

### Step 2: Validate SPF

Check these rules:
- Starts with `v=spf1`
- Ends with `-all` (hardfail) or `~all` (softfail) — recommend `-all`
- Total DNS lookups ≤ 10 (count `include:`, `a:`, `mx:`, `redirect=`, `exists:`)
- No duplicate mechanisms
- All referenced includes resolve (no NXDOMAIN)
- No `+all` (this allows anyone to send as your domain)

### Step 3: Validate DKIM

For each sending service, check the expected selector:
- Record exists and is a valid RSA public key
- Key is ≥ 1024 bits (recommend 2048)
- `t=y` (testing mode) should NOT be present in production

### Step 4: Validate DMARC

```
v=DMARC1; p=reject; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; pct=100
```

Check:
- `p=` is `quarantine` or `reject` (not `none` in production)
- `rua=` is present (aggregate reports)
- `pct=100` (applies to all emails, not a percentage)
- Subdomain policy `sp=` if subdomains send email

### Step 5: Check MX Records

- MX records exist and resolve to valid hostnames
- Priority values are reasonable (lower = higher priority)
- No MX pointing to IP addresses (must be hostnames)
- Hostnames have valid A/AAAA records

### Step 6: Produce Audit Report

Categorize findings as:
- ✅ Correct and secure
- ⚠ Works but suboptimal (with recommendation)
- ❌ Broken or insecure (with exact fix)

## Examples

### Example 1: Full Domain Audit

**User prompt:**
```
Audit all DNS records for myapp.io
```

**Agent output:**
```
DNS Audit — myapp.io
────────────────────

A Records:
  ✅ 104.21.45.12 (Cloudflare)
  ✅ 172.67.182.88 (Cloudflare)

AAAA Records:
  ✅ 2606:4700:3030::6815:2d0c
  ✅ 2606:4700:3037::ac43:b658

MX Records:
  ✅ 1  aspmx.l.google.com
  ✅ 5  alt1.aspmx.l.google.com
  ✅ 10 alt2.aspmx.l.google.com

NS Records:
  ✅ cody.ns.cloudflare.com
  ✅ krystal.ns.cloudflare.com

SPF:
  v=spf1 include:_spf.google.com include:sendgrid.net ~all
  ✅ Google Workspace authorized
  ✅ SendGrid authorized
  ⚠  Using ~all (softfail) — recommend changing to -all
  ✅ Lookup count: 5 of 10

DKIM:
  ✅ google._domainkey → valid 2048-bit RSA
  ❌ s1._domainkey → NXDOMAIN (SendGrid DKIM not configured!)
     Fix: Add CNAME s1._domainkey.myapp.io → s1.domainkey.u1234.wl.sendgrid.net

DMARC:
  v=DMARC1; p=none; rua=mailto:admin@myapp.io
  ❌ p=none provides no protection
     Fix: Change to p=quarantine (after fixing DKIM above)

CAA:
  ❌ No CAA records — any CA can issue certificates for your domain
     Fix: Add CAA 0 issue "letsencrypt.org" (and any other CAs you use)

Summary: 2 critical fixes, 2 recommendations
```

### Example 2: SPF Lookup Count

**User prompt:**
```
Are we over the SPF lookup limit? We use Google, SendGrid, Mailchimp, Zendesk, and HubSpot.
```

**Agent output:**
```
SPF Lookup Analysis — example.com

Current record:
  v=spf1 include:_spf.google.com include:sendgrid.net include:servers.mcsv.net
         include:mail.zendesk.com include:spf.hubspot.com -all

Lookup breakdown:
  include:_spf.google.com    → 3 lookups (nested includes)
  include:sendgrid.net       → 1 lookup
  include:servers.mcsv.net   → 2 lookups (nested)
  include:mail.zendesk.com   → 2 lookups (nested)
  include:spf.hubspot.com    → 1 lookup
  Top-level includes:          5 lookups
  ─────────────────────────────────────
  Total:                      14 lookups ❌ OVER LIMIT (max 10)

Impact: Receiving servers stop evaluating SPF after 10 lookups.
HubSpot and some Zendesk lookups are never checked → those emails fail SPF.

Fix options:
  1. SPF flattening: Replace includes with direct IP ranges (needs maintenance)
  2. Remove unused services from SPF
  3. Use a subdomain for some services (e.g., mail.example.com for Zendesk)
```

## Guidelines

- **Always check recursively** — an SPF `include:` may itself include others; count ALL lookups
- **DKIM selectors vary by provider** — check provider documentation for the correct selector name
- **TTL matters for changes** — note the current TTL when recommending DNS changes; high TTL means slow propagation
- **Test from multiple resolvers** — DNS can vary by location; check from 8.8.8.8 and 1.1.1.1
- **CAA records are underused** — always recommend them to prevent unauthorized certificate issuance
- **Don't forget subdomains** — `www.example.com` and `mail.example.com` may have different records that need auditing
