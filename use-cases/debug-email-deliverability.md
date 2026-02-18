---
title: "Debug Email Deliverability Issues with AI"
slug: debug-email-deliverability
description: "Diagnose why transactional emails land in spam, verify DNS authentication records, and fix deliverability problems systematically."
skills: [email-deliverability-debugger, dns-record-analyzer]
category: devops
tags: [email, deliverability, dns, spf, dkim, dmarc, transactional-email]
---

# Debug Email Deliverability Issues with AI

## The Problem

Users report they never received the password reset email. The support ticket says "check your spam folder" — but the email isn't there either. Transactional email deliverability fails silently: no error in your application logs, the API returned 202 Accepted, yet the email vanished. The causes range from misconfigured SPF records that exceed the 10-lookup limit, DKIM signatures that don't match the sending domain, DMARC policies set to `p=none` providing zero protection, to sending IP reputation damaged by a marketing blast last month.

## The Solution

Use `email-deliverability-debugger` to systematically diagnose authentication, reputation, and content issues, and `dns-record-analyzer` to audit SPF, DKIM, and DMARC records for correctness. The agent checks each layer of the email delivery stack and produces specific fixes.

## Step-by-Step Walkthrough

### 1. Audit DNS email authentication records

```text
Check the email authentication setup for our domain app.example.com.
We send transactional email through SendGrid and marketing email through
Mailchimp. Verify SPF, DKIM, and DMARC records are correctly configured.
```

```text
Email Authentication Audit — app.example.com
─────────────────────────────────────────────

SPF Record:
  v=spf1 include:sendgrid.net include:servers.mcsv.net include:_spf.google.com ~all
  ✅ SendGrid authorized
  ✅ Mailchimp authorized
  ✅ Google Workspace authorized
  ⚠ Lookup count: 8 of 10 maximum (adding another provider will break SPF)
  ❌ Using ~all (softfail) instead of -all (hardfail)
     → Change to -all for stronger authentication

DKIM:
  ✅ SendGrid: s1._domainkey.app.example.com → valid 2048-bit key
  ❌ Mailchimp: k1._domainkey.app.example.com → NXDOMAIN (missing!)
     → Add CNAME: k1._domainkey.app.example.com → dkim.mcsv.net
  ✅ Google: google._domainkey.app.example.com → valid

DMARC:
  v=DMARC1; p=none; rua=mailto:dmarc@app.example.com
  ❌ Policy is p=none — emails failing authentication are still delivered
     → Move to p=quarantine after fixing DKIM, then p=reject in 30 days
  ⚠ No ruf (forensic) reporting configured
     → Add ruf=mailto:dmarc-forensic@app.example.com for failure details

Priority fixes:
  1. Add missing Mailchimp DKIM record (causing Mailchimp emails to fail DMARC)
  2. Change SPF from ~all to -all
  3. Upgrade DMARC to p=quarantine after 1 week of clean reports
```

### 2. Diagnose a specific delivery failure

```text
A customer at bigcorp.com says they never receive our password reset emails.
Our SendGrid dashboard shows the email was delivered. Help me trace what's
happening. Their IT team shared this bounce-back header:

X-MS-Exchange-Organization-SCL: 9
Authentication-Results: spf=pass; dkim=fail (body hash mismatch); dmarc=fail
```

```text
Delivery Failure Analysis — emails to bigcorp.com
──────────────────────────────────────────────────

Root cause identified: DKIM body hash mismatch

What's happening:
1. SPF passes ✅ (SendGrid IP is in your SPF record)
2. DKIM fails ❌ (body hash doesn't match the d= signature)
3. DMARC fails ❌ (needs EITHER SPF or DKIM alignment to pass; SPF passes
   but the domain in Return-Path doesn't align with From header)
4. SCL: 9 = Microsoft Exchange marks this as "certain spam"

Most likely cause: Your application or an email middleware is modifying the
email body AFTER SendGrid signs it with DKIM. Common culprits:
  - Link tracking that rewrites URLs after signing
  - Footer injection by an email gateway
  - HTML minification in your email template pipeline

Diagnostic steps:
1. Send a test email with link tracking disabled in SendGrid
2. Check if DKIM passes → if yes, link tracking is breaking the signature
3. In SendGrid dashboard: Settings → Tracking → disable click tracking
   OR configure a custom tracking domain that preserves DKIM alignment

Fix:
  Option A: Disable click tracking for transactional emails (recommended)
  Option B: Set up a branded link tracking domain under app.example.com
            so DKIM alignment is maintained
```

### 3. Check sending IP reputation

```text
Check the reputation of our SendGrid sending IPs. We're on a dedicated IP
149.72.x.x. Last month our marketing team sent a blast to 50,000 contacts
including old, unverified addresses. Could that have damaged our reputation?
```

```text
IP Reputation Check — 149.72.x.x
─────────────────────────────────

Blacklist status:
  Spamhaus ZEN:     Not listed ✅
  Barracuda RBL:    LISTED ❌ (since 2026-01-28)
  SpamCop:          Not listed ✅
  SORBS:            Not listed ✅
  Composite score:  3 of 80+ blacklists → moderate risk

Barracuda listing details:
  Likely triggered by the Jan 28 marketing blast — Barracuda tracks
  spam trap hits and bounce rates. A 50k blast to unverified addresses
  commonly triggers this.

Remediation:
  1. Submit removal request at barracudacentral.org/rbl/removal-request
  2. Expected delisting: 24-48 hours after request if no further spam detected
  3. Prevent recurrence: clean your marketing list before sending
     - Remove addresses that haven't opened in 6+ months
     - Verify new signups with double opt-in
     - Separate marketing and transactional email on different IPs/subdomains

Immediate mitigation:
  Send transactional email from a separate subdomain (e.g., mail.app.example.com)
  with its own dedicated IP to isolate reputation from marketing activity.
```

### 4. Create a deliverability monitoring checklist

```text
Create a weekly deliverability monitoring checklist and the DNS records I need
to update. Give me the exact DNS changes to make right now.
```

## Real-World Example

Dani, a full-stack developer at a 20-person SaaS startup, got an escalation: three enterprise customers reported missing invoice emails over two weeks. SendGrid showed all emails as "Delivered," so the team assumed it was a spam filter issue on the recipients' end.

1. Dani asked the agent to audit their domain's email authentication setup
2. The audit revealed a missing DKIM record for their secondary sending service and DMARC set to `p=none` — meaning authentication failures were invisible
3. Checking headers from a test email to one affected customer showed DKIM body hash mismatch — their HTML email template pipeline was minifying the body after SendGrid signed it
4. The agent identified that disabling HTML minification in the email pipeline (or moving it before the SendGrid API call) would fix DKIM alignment
5. Additionally, the agent found their sending IP was listed on Barracuda's blacklist from a marketing blast the previous month, affecting delivery to companies using Barracuda email security

After applying the fixes (DKIM alignment, Barracuda delisting request, DMARC upgraded to `p=quarantine`), invoice email delivery rate went from 84% to 99.2% within one week.
