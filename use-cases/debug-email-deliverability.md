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

Users report they never received the password reset email. The support ticket says "check your spam folder" — but the email isn't there either. Transactional email deliverability fails silently: no error in your application logs, the API returned 202 Accepted, yet the email vanished into the void. The causes range from misconfigured SPF records that exceed the 10-lookup limit, DKIM signatures that don't align with the sending domain, DMARC policies set to `p=none` providing zero protection, to sending IP reputation damaged by a marketing blast last month.

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

`v=spf1 include:sendgrid.net include:_spf.google.com include:spf.protection.outlook.com ~all`

| Check | Status | Detail |
|-------|--------|--------|
| SendGrid authorized | Pass | `include:sendgrid.net` present |
| Google Workspace authorized | Pass | `include:_spf.google.com` present |
| Microsoft 365 authorized | Pass | `include:spf.protection.outlook.com` present |
| DNS lookup count | Pass | 4 of 10 maximum (the three includes plus SendGrid's nested `include:ab.sendgrid.net`, counted at the time of writing) |
| Fail policy | Info | `~all` (softfail) is fine while DMARC does the enforcing |

The lookup count is worth watching. SPF allows a maximum of 10 DNS lookups total, and nested `include` statements each count. This record has headroom, but each provider you add (Mailchimp, a CRM, a helpdesk) spends some of it, and providers change their nested includes without telling you. Past 10, receivers return a permanent SPF error for every email from the domain.

**DKIM:**

- SendGrid (`s1._domainkey`, `s2._domainkey`): CNAMEs resolve to valid keys
- Mailchimp: **the CNAME records Mailchimp generates for the domain are missing entirely**
- Google (`google._domainkey`): valid

Without Mailchimp's DKIM records, marketing email is signed with Mailchimp's own domain, not yours, so it cannot align with the From domain and fails DMARC. The fix is to publish the two CNAME records that Mailchimp shows under Settings > Domains > Authenticate for this domain, exactly as displayed (Mailchimp generates the names and values per domain).

**DMARC:**

`v=DMARC1; p=none; rua=mailto:dmarc@app.example.com`

The `p=none` policy means authentication failures are reported but the emails still get delivered. It's the DMARC equivalent of a security camera with no lock on the door — you can see the intruders but you can't stop them. It does satisfy the minimum that Gmail, Yahoo and Outlook.com ask of bulk senders, but it gives no protection against spoofing.

**Priority fixes:**
1. Add the missing Mailchimp DKIM CNAMEs (this is causing every Mailchimp email to fail DMARC)
2. Recount SPF lookups before adding each provider (drop unused `include`s; flatten only with a tool that keeps it updated)
3. Read the aggregate (`rua`) reports for a few weeks, then move to `p=quarantine; pct=25` and raise `pct` to 100
4. After clean reports on `p=quarantine`, move to `p=reject`

Note the mailbox-provider rules while you are there. Anyone sending more than 5,000 messages a day to Gmail or Outlook.com needs SPF, DKIM and a published DMARC record (`p=none` is enough), with the From domain aligned to SPF or DKIM; Yahoo asks bulk senders for the same without publishing a number. Gmail and Yahoo also require one-click unsubscribe on marketing mail and a spam rate below 0.30% (Google Postmaster Tools; Google recommends staying under 0.10%). Microsoft does not require one-click unsubscribe. Outlook.com rejects or junks non-compliant bulk mail with `550 5.7.515`. Sources: [Google](https://support.google.com/a/answer/81126), [Yahoo](https://senders.yahooinc.com/best-practices/), [Microsoft](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlooks-new-requirements-for-high%E2%80%90volume-senders/4399730).

### Step 2: Diagnose a Specific Delivery Failure

Now trace why a specific customer isn't receiving emails:

```text
A customer at bigcorp.com says they never receive our password reset emails. Our SendGrid dashboard shows the email was delivered. Help me trace what's happening. Their IT team shared this bounce-back header:

X-MS-Exchange-Organization-SCL: 9
Authentication-Results: spf=pass; dkim=fail (body hash mismatch); dmarc=fail
```

(Run `dig +short TXT _dmarc.app.example.com` and `dig +short CNAME s1._domainkey.app.example.com` first to confirm the DNS side, then read the headers.)

The headers tell the full story in four lines:

1. **SPF passes** — SPF passed for the envelope (`Return-Path`) domain, so the sending server is authorized for that domain
2. **DKIM fails with "body hash mismatch"** — the DKIM signature was generated for one version of the email body, but the body received by Exchange is different
3. **DMARC fails** — DMARC needs either SPF or DKIM to pass *with domain alignment*. SPF passes but the `Return-Path` domain doesn't match the `From` header domain, so SPF alignment fails. DKIM would save it, but DKIM failed too.
4. **SCL: 9** — Microsoft Exchange's Spam Confidence Level, where 9 means "certain spam." This email is going straight to the junk folder or being silently dropped.

The root cause is the DKIM body hash mismatch. Something changed the email body *after* the sender signed it. The signature covers a cryptographic hash of the body — change one character and the hash no longer matches. SendGrid applies click tracking before it signs, so tracking is not the usual culprit. Common ones are:

- **Footer or banner injection** by a gateway or compliance tool on the path (including the recipient's own security gateway, for example an "external sender" banner)
- **Mailing lists and forwarders** that append text
- **A relay you control** between your app and SendGrid that rewrites the message after an earlier signature was added

The diagnostic: send the same message to a Gmail or other test mailbox you control and read its `Authentication-Results`. If DKIM passes there and fails at bigcorp.com, the body is being modified inside bigcorp's mail path, and their IT team needs to exempt your sending domain from banner injection. If it fails everywhere, look at your own relay chain. Either way, make sure the SendGrid authenticated domain is set up so that `d=` in the signature and the `Return-Path` use `app.example.com`, which keeps DMARC alignment even when one of the two methods breaks.

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

Query each list with `dig +short <reversed-ip>.<list-zone>` from your own resolver (Spamhaus refuses large public resolvers such as 8.8.8.8). A listing on a list that has been shut down, such as SORBS (closed in 2024), is not a signal.

The Barracuda listing was probably triggered by the January 27 marketing blast. Barracuda tracks spam trap hits and bounce rates, and a 50K blast to unverified addresses — addresses that haven't been contacted in months or years — is exactly the behavior their system flags. Spam traps are dead email addresses that exist solely to catch senders who don't maintain their lists.

The consequences are specific: every company using Barracuda email security (and that includes a significant portion of mid-market and enterprise companies) is now silently dropping or quarantining your emails. This explains why the enterprise customer escalations started at the end of January.

**Remediation:**
1. Submit a delisting request at `barracudacentral.org/rbl/removal-request` with a valid explanation; Barracuda says requests are typically processed within 12 hours, and repeated requests are ignored
2. Clean the marketing list: remove addresses with no opens in 6+ months, implement double opt-in for new signups
3. **Separate transactional and marketing email** onto different subdomains and IPs

That third point is the real fix. Send transactional email from `mail.app.example.com` with its own dedicated IP. Marketing sends from `marketing.app.example.com` with a separate IP. A bad marketing blast can tank its own reputation without dragging password resets and invoice emails down with it. This separation should have been in place from day one.

### Step 4: Build a Monitoring Checklist

```text
Create a weekly deliverability monitoring checklist and the DNS records I need to update. Give me the exact DNS changes to make right now.
```

The agent returns the exact DNS records to add or modify, a weekly monitoring schedule (blacklist checks on Monday, DMARC aggregate report review on Wednesday, bounce rate trending on Friday, Postmaster Tools spam rate against the 0.10% target), and alert thresholds. Example thresholds: bounce rate above 2% for any sending domain, DMARC failures above 5% in any 24-hour period. Wire them into whatever alerting you already run; the agent can draft the blacklist-check script, but it only alerts if you schedule it.

The goal is simple: never again have a two-week window where enterprise customers silently don't receive emails and nobody on the team notices. Email deliverability should be monitored like application uptime — because for users waiting on a password reset, email *is* uptime.

## Real-World Example

Dani, a full-stack developer at a 20-person SaaS startup, got an escalation: three enterprise customers reported missing invoice emails over two weeks. SendGrid showed all emails as "Delivered," so the team assumed it was a spam filter issue on the recipients' end. The standard response went out: "Please check your spam folder and whitelist our domain."

The domain audit told a different story. A missing DKIM record for Mailchimp meant every marketing email failed authentication. DMARC was set to `p=none`, so these failures were invisible — reported but never acted on. Test email headers from one affected customer revealed a DKIM body hash mismatch: the customer's security gateway was appending an external-sender banner after SendGrid signed the message, invalidating the DKIM signature for every message to that company.

On top of that, the sending IP had been listed on Barracuda's blacklist since January 28 — the day after the marketing team's 50K blast on January 27. Every company using Barracuda email security had been silently dropping the startup's emails for three weeks.

After applying the fixes — asking the customers' IT teams to exempt the sending domain from banner injection, adding the missing Mailchimp DKIM records, submitting a Barracuda delisting request, and moving DMARC to `p=quarantine` — invoice email delivery rate went from 84% to 99.2% within one week. The team also separated transactional and marketing email onto different subdomains, so a bad marketing blast can never poison transactional deliverability again. The three enterprise customers got personal apology emails (delivered successfully this time) and a credit on their next invoice.

## Related Skills

- **email-deliverability-debugger**: runs the layered audit (authentication, headers, blacklists, content) and produces the fix list.
- **dns-record-analyzer**: checks the SPF, DKIM and DMARC records and counts SPF lookups.
