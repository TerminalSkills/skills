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
  version: "1.1.0"
  category: devops
  tags: "dns, domain, email-authentication, infrastructure"
---

# DNS Record Analyzer

## Overview

This skill queries and analyzes DNS records for domains, checking for correctness, security best practices, and common misconfigurations. It covers standard records (A, CNAME, MX) and email authentication records (SPF, DKIM, DMARC) with specific validation rules for each.

## Instructions

### Step 1: Query All Record Types

```bash
DOMAIN="northwind-labs.dev"

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

# Security and transport
dig +short CAA $DOMAIN
dig +short SOA $DOMAIN
dig +short DS $DOMAIN                  # DNSSEC delegation signer (empty = not signed)
dig +short TXT _mta-sts.$DOMAIN        # MTA-STS policy pointer
dig +short TXT _smtp._tls.$DOMAIN      # TLS-RPT reporting

# Compare resolvers, or ask an authoritative server directly
dig +short TXT $DOMAIN @8.8.8.8
dig +short TXT $DOMAIN @1.1.1.1
dig +nssearch $DOMAIN                  # SOA serial on every authoritative server
```

`nslookup -type=TXT $DOMAIN` works where `dig` is missing (Windows). Long TXT values come back as several quoted chunks; join them before judging the record.

### Step 2: Validate SPF

Check these rules:
- Starts with `v=spf1`
- Ends with `-all` (hardfail) or `~all` (softfail) — recommend `-all`
- Exactly one SPF record per name (two `v=spf1` TXT records = PermError)
- Total DNS lookups ≤ 10 (count `include:`, `a`, `mx`, `ptr`, `exists:` and `redirect=`, including nested ones; `ip4:`, `ip6:` and `all` are free), and no more than 2 void lookups (names that return nothing)
- No `ptr` mechanism (deprecated)
- No duplicate mechanisms
- All referenced includes resolve (no NXDOMAIN)
- No `+all` (this allows anyone to send as your domain)

### Step 3: Validate DKIM

For each sending service, check the expected selector:
- Record exists and is a valid RSA public key
- Key is ≥ 1024 bits (recommend 2048; an empty `p=` means the key was revoked)
- Common selectors: `google` (Google Workspace), `selector1`/`selector2` (Microsoft 365), `s1`/`s2` (SendGrid), `k1` (Mailchimp); many providers use CNAMEs, so ask `dig +short CNAME` as well as TXT
- `t=y` (testing mode) should NOT be present in production

### Step 4: Validate DMARC

```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@northwind-labs.dev; adkim=s; aspf=r
```

Check:
- `p=` is `quarantine` or `reject` (not `none` in production)
- `rua=` is present (aggregate reports); if it points to another domain, that domain must publish `northwind-labs.dev._report._dmarc.reports-vendor.net` (your domain, then the vendor domain) authorising it
- `pct` below 100 only during a staged rollout (`none` → `quarantine` → `reject`); the newer DMARC revision replaces it with `t=`, so do not rely on it long-term
- `ruf=` forensic reports are rarely sent by large providers; do not count on them
- Subdomain policy `sp=` if subdomains send email
- Alignment: DMARC passes only if SPF or DKIM passes *and* the domain matches the From header
- Mailbox providers (Google, Yahoo, and since May 2025 Microsoft Outlook.com) require SPF, DKIM and DMARC from bulk senders (5,000+ messages a day)

### Step 5: Check MX Records

- MX records exist and resolve to valid hostnames
- Priority values are reasonable (lower = higher priority)
- No MX pointing to IP addresses or to a CNAME (must be hostnames with A/AAAA); a domain that sends but never receives mail should publish a null MX (`0 .`)
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
  (Google also accepts the single record "1 smtp.google.com")

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
SPF Lookup Analysis — northwind-labs.dev

Current record:
  v=spf1 include:_spf.google.com include:sendgrid.net include:servers.mcsv.net
         include:mail.zendesk.com include:spf.hubspot.com -all

Lookup breakdown (each include counts itself plus everything nested in it,
as resolved today with dig +short TXT <name>):
  include:_spf.google.com    → 4
  include:sendgrid.net       → 1
  include:servers.mcsv.net   → 2
  include:mail.zendesk.com   → 3
  include:spf.hubspot.com    → 2
  ─────────────────────────────────────
  Total:                      12 lookups ❌ OVER LIMIT (max 10)

Impact: a receiver that counts more than 10 lookups returns PermError, and
SPF fails for ALL mail from this domain, not only for the last services.

Fix options:
  1. Remove services that no longer send mail
  2. Send from a subdomain per service (e.g. help.northwind-labs.dev for Zendesk)
     with its own SPF record
  3. SPF flattening (replace includes with ip4:/ip6: ranges); needs automatic
     refresh because providers change their IPs
```

## Guidelines

- **Always check recursively** — an SPF `include:` may itself include others; count ALL lookups
- **DKIM selectors vary by provider** — check provider documentation for the correct selector name
- **TTL matters for changes** — note the current TTL when recommending DNS changes; high TTL means slow propagation
- **Test from multiple resolvers** — caches differ; compare `@8.8.8.8` and `@1.1.1.1`, and ask the authoritative servers (`dig +short NS`, then `dig @ns-server`) for the truth
- **Do not change records blindly** — SPF/DMARC edits affect real mail delivery; start DMARC at `p=none` with `rua=` and only tighten after reports look clean
- **CAA records are underused** — always recommend them to prevent unauthorized certificate issuance
- **Don't forget subdomains** — `www.northwind-labs.dev` and `mail.northwind-labs.dev` may have different records that need auditing
