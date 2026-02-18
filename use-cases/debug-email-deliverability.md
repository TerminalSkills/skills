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

Users report they never received the password reset email. The support ticket says "check your spam folder" — but the email isn't there either. Transactional email deliverability fails silently: no error in your application logs, the API returned 202 Accepted, yet the email vanished into the void. The causes range from misconfigured SPF records that exceed the 10-lookup limit, DKIM signatures that don't match the sending domain, DMARC policies set to `p=none` providing zero protection, to sending IP reputation damaged by a marketing blast last month.

The most frustrating part is that everything looks fine from your side. SendGrid says "Delivered." The customer says they never got it. And without knowing which layer of the email authentication stack is broken, you're stabbing in the dark — is it DNS? Is it content filtering? Is it IP reputation? Each layer has different diagnostic tools, different fixes, and different timelines for resolution.

Meanwhile, the support queue grows. Enterprise customers escalate. And the team's response is still "check your spam folder."

## The Solution

Using the **email-deliverability-debugger** to systematically diagnose authentication, reputation, and content issues, and the **dns-record-analyzer** to audit SPF, DKIM, and DMARC records for correctness, every layer of the email delivery stack gets checked and specific fixes get produced — not "you might have a DNS issue" but "add this exact CNAME record."

## Step-by-Step Walkthrough

Email deliverability debugging works in layers: DNS authentication (SPF, DKIM, DMARC), then per-recipient diagnostics, then IP reputation, then ongoing monitoring. Each layer can independently cause delivery failures, so the audit checks all of them systematically.

### Step 1: Audit DNS Email Authentication Records

Start with the foundation — the DNS records that tell receiving mail servers your emails are legitimate:

```text
Check the email authentication setup for our domain app.example.com. We send transactional email through SendGrid and marketing email through Mailchimp. Verify SPF, DKIM, and DMARC records are correctly configured.
```

The audit checks each authentication layer and flags every misconfiguration:

**SPF Record:**

`v=spf1 include:sendgrid.net include:servers.mcsv.net include:_spf.google.com ~all`

| Check | Status | Detail |
|-------|--------|--------|
| SendGrid authorized | Pass | `include:sendgrid.net` present |
| Mailchimp authorized | Pass | `include:servers.mcsv.net` present |
| Google Workspace authorized | Pass | `include:_spf.google.com` present |
| DNS lookup count | Warning | 8 of 10 maximum — one more `include` will break SPF entirely |
| Fail policy | Fail | Using `~all` (softfail) instead of `-all` (hardfail) |

That lookup count is a ticking time bomb. SPF allows a maximum of 10 DNS lookups total, and nested `include` statements each count. At 8 out of 10, adding one more email provider — or one of the existing providers adding a nested lookup in their SPF record — will silently break SPF validation for every email from this domain.

**DKIM:**

- SendGrid (`s1._domainkey`): valid 2048-bit key
- Mailchimp (`k1._domainkey`): **NXDOMAIN — record missing entirely**
- Google (`google._domainkey`): valid

That missing Mailchimp DKIM record means every marketing email fails DKIM authentication. Receiving servers see an unsigned email claiming to be from your domain — indistinguishable from phishing. The fix is a single DNS record: CNAME `k1._domainkey.app.example.com` pointing to `dkim.mcsv.net`.

**DMARC:**

`v=DMARC1; p=none; rua=mailto:dmarc@app.example.com`

The `p=none` policy means authentication failures are reported but the emails still get delivered. It's the DMARC equivalent of a security camera with no lock on the door — you can see the intruders but you can't stop them. No forensic (`ruf`) reporting is configured either, so when authentication fails, there's no detailed failure data to diagnose why.

**Priority fixes:**
1. Add missing Mailchimp DKIM CNAME (this is causing every Mailchimp email to fail DMARC)
2. Change SPF from `~all` to `-all` for hardfail
3. Add forensic reporting: `ruf=mailto:dmarc-forensic@app.example.com`
4. After 1 week of clean DMARC reports, upgrade to `p=quarantine`
5. After 30 days of clean `p=quarantine`, move to `p=reject`

### Step 2: Diagnose a Specific Delivery Failure

Now trace why a specific customer isn't receiving emails:

```text
A customer at bigcorp.com says they never receive our password reset emails. Our SendGrid dashboard shows the email was delivered. Help me trace what's happening. Their IT team shared this bounce-back header:

X-MS-Exchange-Organization-SCL: 9
Authentication-Results: spf=pass; dkim=fail (body hash mismatch); dmarc=fail
```

The headers tell the full story in four lines:

1. **SPF passes** — SendGrid's IP is in the SPF record, so the sending server is authorized
2. **DKIM fails with "body hash mismatch"** — the DKIM signature was generated for one version of the email body, but the body received by Exchange is different
3. **DMARC fails** — DMARC needs either SPF or DKIM to pass *with domain alignment*. SPF passes but the `Return-Path` domain doesn't match the `From` header domain, so SPF alignment fails. DKIM would save it, but DKIM failed too.
4. **SCL: 9** — Microsoft Exchange's Spam Confidence Level, where 9 means "certain spam." This email is going straight to the junk folder or being silently dropped.

The root cause is the DKIM body hash mismatch. Something is modifying the email body *after* SendGrid generates the DKIM signature. The signature covers a cryptographic hash of the body — change one character and the hash no longer matches. Common culprits:

- **Link tracking** that rewrites URLs after signing (most common cause)
- **Footer injection** by an email gateway or compliance tool
- **HTML minification** in the email template pipeline

The diagnostic: send a test email with click tracking disabled in SendGrid. If DKIM passes, click tracking is breaking the signature. The permanent fix is either disabling click tracking for transactional emails (recommended — you don't need click analytics on password resets) or configuring a branded link domain under `app.example.com` so DKIM alignment is maintained even with URL rewriting.

### Step 3: Check Sending IP Reputation

```text
Check the reputation of our SendGrid sending IPs. We're on a dedicated IP 149.72.x.x. Last month our marketing team sent a blast to 50,000 contacts including old, unverified addresses. Could that have damaged our reputation?
```

The reputation scan across major blacklists:

| Blacklist | Status | Impact |
|-----------|--------|--------|
| Spamhaus ZEN | Clean | N/A |
| Barracuda RBL | **LISTED** since Jan 28 | High — widely used by enterprise |
| SpamCop | Clean | N/A |
| SORBS | Clean | N/A |
| Composite | 3 of 80+ lists | Moderate overall risk |

The Barracuda listing was almost certainly triggered by the January 28 marketing blast. Barracuda tracks spam trap hits and bounce rates, and a 50K blast to unverified addresses — addresses that haven't been contacted in months or years — is exactly the behavior their system flags. Spam traps are dead email addresses that exist solely to catch senders who don't maintain their lists.

The consequences are specific: every company using Barracuda email security (and that includes a significant portion of mid-market and enterprise companies) is now silently dropping or quarantining your emails. This explains why the enterprise customer escalations started at the end of January.

**Remediation:**
1. Submit delisting request at `barracudacentral.org/rbl/removal-request` — expect 24-48 hours
2. Clean the marketing list: remove addresses with no opens in 6+ months, implement double opt-in for new signups
3. **Separate transactional and marketing email** onto different subdomains and IPs

That third point is the real fix. Send transactional email from `mail.app.example.com` with its own dedicated IP. Marketing sends from `marketing.app.example.com` with a separate IP. A bad marketing blast can tank its own reputation without dragging password resets and invoice emails down with it. This separation should have been in place from day one.

### Step 4: Build a Monitoring Checklist

```text
Create a weekly deliverability monitoring checklist and the DNS records I need to update. Give me the exact DNS changes to make right now.
```

The exact DNS records to add or modify, a weekly monitoring schedule (blacklist checks on Monday, DMARC aggregate report review on Wednesday, bounce rate trending on Friday), and alert thresholds get documented so deliverability problems surface in hours instead of weeks.

The monitoring script checks all major blacklists automatically and sends a Slack alert if the sending IP appears on any list. Bounce rate alerts fire if the rate exceeds 2% for any sending domain. DMARC failure alerts fire if authentication failures exceed 5% for any 24-hour period.

The goal is simple: never again have a two-week window where enterprise customers silently don't receive emails and nobody on the team notices. Email deliverability should be monitored like application uptime — because for users waiting on a password reset, email *is* uptime.

## Real-World Example

Dani, a full-stack developer at a 20-person SaaS startup, got an escalation: three enterprise customers reported missing invoice emails over two weeks. SendGrid showed all emails as "Delivered," so the team assumed it was a spam filter issue on the recipients' end. The standard response went out: "Please check your spam folder and whitelist our domain."

The domain audit told a different story. A missing DKIM record for Mailchimp meant every marketing email failed authentication. DMARC was set to `p=none`, so these failures were invisible — reported but never acted on. Test email headers from one affected customer revealed a DKIM body hash mismatch: the HTML email template pipeline was minifying the body after SendGrid signed it, invalidating the DKIM signature on every single transactional email sent to any recipient.

On top of that, the sending IP had been listed on Barracuda's blacklist since January 28 — the day after the marketing team's 50K blast. Every company using Barracuda email security had been silently dropping the startup's emails for three weeks.

After applying the fixes — moving HTML minification before the SendGrid API call, adding the missing Mailchimp DKIM record, submitting a Barracuda delisting request, and upgrading DMARC to `p=quarantine` — invoice email delivery rate went from 84% to 99.2% within one week. The team also separated transactional and marketing email onto different subdomains, so a bad marketing blast can never poison transactional deliverability again. The three enterprise customers got personal apology emails (delivered successfully this time) and a credit on their next invoice.
