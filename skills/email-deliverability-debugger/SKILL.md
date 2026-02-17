---
name: email-deliverability-debugger
description: >-
  Diagnoses email deliverability problems for transactional and marketing
  emails. Checks SPF/DKIM/DMARC alignment, sending IP reputation, email
  content spam triggers, and bounce patterns. Use when emails land in spam,
  go missing, or bounce unexpectedly. Trigger words: email spam, deliverability,
  emails not arriving, bounce rate, spam folder, email reputation, SPF fail,
  DKIM fail, DMARC, transactional email, SendGrid, Postmark, SES.
license: Apache-2.0
compatibility: "Requires dig/nslookup for DNS checks; works with any email provider"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["email", "deliverability", "spam", "authentication", "dns"]
---

# Email Deliverability Debugger

## Overview

This skill systematically diagnoses why emails fail to reach inboxes by checking the entire delivery chain: DNS authentication (SPF, DKIM, DMARC), sending IP reputation, email content, headers, and provider-specific configuration. It produces actionable fixes ranked by impact.

## Instructions

### Step 1: Check DNS Authentication Records

```bash
# SPF record
dig +short TXT example.com | grep "v=spf1"

# DKIM (check common selectors)
for sel in s1 s2 k1 google default sendgrid; do
  dig +short TXT ${sel}._domainkey.example.com
done

# DMARC
dig +short TXT _dmarc.example.com
```

Validate each:
- **SPF**: Must include all sending services, ≤10 DNS lookups, end with `-all` (hardfail)
- **DKIM**: Each sending service needs its own selector with valid key
- **DMARC**: Should have `p=quarantine` or `p=reject`; `p=none` provides no protection

### Step 2: Count SPF Lookups

SPF has a hard limit of 10 DNS lookups. Count each `include:`, `a:`, `mx:`, and `redirect=` as 1 lookup. Nested includes count too.

```bash
# Check SPF record and count includes
dig +short TXT example.com | grep spf
# Then recursively check each include
dig +short TXT _spf.google.com
dig +short TXT sendgrid.net
```

If at or near 10, recommend SPF flattening or removing unused services.

### Step 3: Analyze Email Headers (if provided)

Key headers to check:
- `Authentication-Results`: Shows SPF, DKIM, DMARC pass/fail
- `X-MS-Exchange-Organization-SCL`: Microsoft spam confidence (0-9, >5 = spam)
- `X-Spam-Score`: Generic spam score
- `Received-SPF`: SPF result with detail
- `DKIM-Signature`: Which domain signed and which selector used
- `Return-Path`: Must align with `From` domain for SPF alignment

### Step 4: Check IP Reputation

Query major blacklists:
```bash
# Reverse IP for DNSBL queries (e.g., 1.2.3.4 becomes 4.3.2.1)
REVERSED="4.3.2.1"
for bl in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net; do
  dig +short ${REVERSED}.${bl}
done
# Non-empty result = listed on that blacklist
```

Common blacklists to check: Spamhaus, Barracuda, SpamCop, SORBS, CBL, URIBL.

### Step 5: Check Content Issues

Flag common spam triggers:
- Subject line with ALL CAPS or excessive punctuation (!!!)
- HTML-only email without text/plain alternative
- High image-to-text ratio
- URL shorteners (bit.ly, etc.) in email body
- Missing unsubscribe header (required for bulk, good practice for all)
- Missing `List-Unsubscribe` header

### Step 6: Produce Fix Report

Organize by priority:
1. **Critical**: Authentication failures (SPF/DKIM/DMARC fail)
2. **High**: IP blacklisting
3. **Medium**: Content issues, missing headers
4. **Low**: Best practice improvements

Include exact DNS records to add/modify and provider-specific configuration steps.

## Examples

### Example 1: Full Deliverability Audit

**User prompt:**
```
Our emails to Gmail users are going to spam. Domain: notifications.myapp.com
```

**Agent output:**
```
Deliverability Audit — notifications.myapp.com

❌ CRITICAL: DMARC alignment failure
   From: notifications.myapp.com
   Return-Path: bounces.sendgrid.net (different domain)
   → SPF passes for sendgrid.net but doesn't align with From domain
   Fix: Configure SendGrid authenticated domain so Return-Path uses your domain

⚠  HIGH: DMARC policy too weak
   Current: v=DMARC1; p=none
   → Gmail honors DMARC but p=none means failures aren't acted on
   Fix: v=DMARC1; p=quarantine; rua=mailto:dmarc@myapp.com; pct=100

✅ SPF: Valid (7 lookups)
✅ DKIM: Valid (s1 selector, 2048-bit)
✅ IP reputation: Clean on all major blacklists

Priority fix order:
1. Configure SendGrid domain authentication (fixes Return-Path alignment)
2. Update DMARC to p=quarantine
3. Monitor DMARC reports for 2 weeks before moving to p=reject
```

### Example 2: Specific Bounce Diagnosis

**User prompt:**
```
Getting 550 5.7.1 rejections from outlook.com. What's wrong?
```

**Agent output:**
```
550 5.7.1 from Outlook = message rejected due to content or policy

Diagnosis checklist:
1. ✅ SPF passes for your domain
2. ❌ DKIM signature uses d=sendgrid.net, not your domain
   → Microsoft strict mode rejects misaligned DKIM
3. ❌ Your sending IP 149.72.x.x is on Spamhaus PBL
   → This is a policy listing, not spam — means IP is flagged as dynamic/cloud

Fixes:
1. Set up DKIM custom domain in SendGrid (Settings → Sender Authentication)
   Add CNAMEs: s1._domainkey.yourdomain.com → s1.domainkey.u1234.wl.sendgrid.net
2. Request Spamhaus PBL removal at spamhaus.org/pbl/query/
3. After fixes, use mail-tester.com to verify score >8/10 before bulk sending
```

## Guidelines

- **Check authentication FIRST** — 80% of deliverability issues are DNS authentication failures
- **Alignment matters more than pass/fail** — SPF can pass but still fail DMARC if domains don't align
- **Separate transactional from marketing** — different subdomains and IPs protect transactional reputation
- **DMARC reports are gold** — always recommend setting up `rua` aggregate reports
- **Don't recommend p=reject immediately** — go none → quarantine → reject over 4-6 weeks while monitoring
- **IP reputation recovers slowly** — blacklist removal is quick, but reputation rebuilding takes 2-4 weeks of clean sending
- **Test with real recipients** — mail-tester.com, Gmail postmaster tools, and Microsoft SNDS are free and essential
