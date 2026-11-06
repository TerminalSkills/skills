---
title: "Automate GDPR and Privacy Compliance for Web Apps"
slug: automate-gdpr-compliance
description: "Scan your web app for privacy violations, generate compliant consent flows, and build automated data subject request handling — without hiring a DPO."
skills: [gdpr-compliance, security-audit, code-reviewer]
category: development
tags: [gdpr, privacy, compliance, data-protection, consent-management]
---

# Automate GDPR and Privacy Compliance for Web Apps

> This page shows engineering work. It is not legal advice: which legal basis fits, whether you must appoint a data protection officer ([Article 37](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) lists the cases), and what you owe your own regulator depend on your facts. Have a lawyer review the result.

## The Problem

Sara runs a B2B SaaS tool with 12,000 users across the EU. The app collects emails, tracks page views, stores IP addresses, and uses third-party scripts that set cookies, all without a proper consent mechanism. Last Tuesday, a user in Berlin emailed asking for all their personal data to be deleted. Sara realized she has no idea where that user's data actually lives.

It is in PostgreSQL, obviously. But also in Redis sessions that store the user's last active timestamp. And in application logs where every API request includes the user's IP and auth token. And in the two third-party analytics tools the marketing team integrated last year without telling engineering. And in the payment processor that has the user's full name and billing address.

The exposure is real: infringements of the consent rules and of data subjects' rights can be fined up to EUR 20 million or 4% of total worldwide annual turnover, whichever is higher ([GDPR Article 83(5)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)). The user in Berlin is waiting, and the controller must act on the request without undue delay and at the latest within one month of receipt; that can be extended by two further months for complex or numerous requests, but only if the user is told within the first month ([Article 12(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)).

## The Solution

Using the **gdpr-compliance**, **security-audit**, and **code-reviewer** skills, the agent audits the codebase for personal data flows, generates a consent management system with granular cookie categories, builds API endpoints for data subject requests (access, deletion, portability), and sets up automated retention policies. The **security-audit** skill finds the places where personal data leaks (secrets and tokens in logs, injectable queries around the user tables), and **code-reviewer** reviews the generated endpoints before they ship.

## Step-by-Step Walkthrough

### Step 1: Audit Personal Data Flows

First, map where personal data actually lives. Not where you think it lives, where it actually lives. The gap between these two is where compliance violations hide.

```text
Scan the codebase in src/ and the database schema in prisma/schema.prisma for personal data. Identify every field that stores PII: email, name, IP address, phone, location, device identifiers. Map where each piece of data flows — which services read it, which third-party APIs receive it, where it is logged. Output a data flow inventory as a markdown table.
```

On Sara's app the scan finds 23 PII fields across 7 database models; the inventory looks like this:

| Data Type | DB Table | Field | Shared With | Retention |
|---|---|---|---|---|
| Email | users | email | Transactional email service | Indefinite |
| IP Address | sessions | ip_address | Analytics, CloudWatch logs | Indefinite |
| Full Name | users | full_name | Payment processor | Indefinite |
| Phone | users | phone | SMS provider | Indefinite |
| Location | events | geo_lat/lng | Analytics | Indefinite |
| Device ID | sessions | device_id | Push notification service | Indefinite |

Three issues jump out immediately:

1. **No retention policy on any table.** The storage-limitation principle ([Article 5(1)(e)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)) says personal data is kept no longer than necessary for its purpose. A user who signed up three years ago and never came back still has an IP address, device ID and location in the database.
2. **IP addresses in plaintext logs** with no expiry, readable by every developer with console access. This is where the security-audit skill earns its place: it also flags auth tokens written to the same logs.
3. **The payment processor receives full names** with no documented contract. Whenever a processor handles personal data on your behalf, [Article 28(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) requires a binding contract (a data processing agreement) covering the subject matter, duration, data types and the processor's obligations. Most large vendors publish a standard one to sign.

Every field marked "Indefinite" is a risk: each category of personal data needs a legal basis and a defined retention period.

### Step 2: Generate a Consent Management System

Cookie banners are the visible tip of the iceberg. The real work is blocking third-party scripts until consent is given and recording that consent so you can prove it later.

```text
Build a cookie consent banner and preference center for the app. Categories: strictly_necessary (no consent needed), analytics, marketing, functional. Create a React component that blocks third-party scripts until consent is given. Store consent records in the database with timestamp, version, and granular choices. Generate the Prisma migration for the consent_records table.
```

The consent system has four layers:

- **Banner component.** Appears on first visit and blocks all non-essential scripts until the user makes an active choice. Pre-ticked boxes and "continue browsing means you agree" do not count: [Recital 32](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) says "silence, pre-ticked boxes or inactivity should not therefore constitute consent".
- **Preference center.** Reachable from the footer at any time. Withdrawing must be as easy as giving consent ([Article 7(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)), so one click.
- **Script blocker.** Wraps third-party script tags (analytics, marketing pixels, chat widgets) and injects them only after the relevant category is granted. The exemption for `strictly_necessary` comes from the ePrivacy Directive, not the GDPR: storing or reading information on a user's device needs consent, except where it is strictly necessary for a service the user explicitly requested ([Directive 2002/58/EC Article 5(3), as amended by Directive 2009/136/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009L0136)). Be strict about what you put in that category: login sessions and CSRF tokens qualify, analytics does not.
- **Consent record table.** Stores a user or visitor ID, timestamp, consent version, one boolean per category and a hashed IP, matching the schema in the gdpr-compliance skill.

The consent version matters for ongoing compliance. When the privacy policy changes (a new analytics tool, a new processor), a new version number invalidates old consent and the banner reappears. Records are append-only: a change creates a new row. The controller must be able to demonstrate that the data subject consented ([Article 7(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)), and the history is that proof.

### Step 3: Build Data Subject Request Handlers

When a user asks "show me my data" or "delete everything you have on me", the response needs to be automated, thorough, and auditable.

```text
Create API endpoints for GDPR data subject requests, all requiring a freshly authenticated session:
- GET /api/privacy/export — generates a JSON export of all personal data for the authenticated user
- DELETE /api/privacy/delete — queues erasure and emails the user a link to cancel it
- GET /api/privacy/consent-history — returns the user's consent history
Run due erasures from a daily job. Log every request in an audit_log table without storing the personal data itself.
```

The export endpoint collects data from every table that references the user: profile, session records, event logs, consent history, and third-party data that can be retrieved via API. The right of access is [Article 15](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679). Portability ([Article 20](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)) covers data the user provided, processed on consent or contract, in a structured, commonly used, machine-readable format, which JSON satisfies.

The deletion path is more nuanced. The right to erasure ([Article 17](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)) applies "without undue delay" where, for example, the data is no longer necessary or consent is withdrawn, and has exceptions (for instance a legal obligation to keep records, Article 17(3)(b)). So order records that tax or accounting law requires you to keep are retained, but the personal details in them are cleared where the law allows. Replace values with random tombstones or null, not a hash: pseudonymised data is still personal data ([Recital 26](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)). Sessions are deleted outright, and the controller must tell each recipient the data was disclosed to (analytics, email, SMS providers) about the erasure ([Article 19](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)), unless that is impossible or disproportionate.

A short cancel window (the gdpr-compliance skill's example uses 30 days, which is a product choice, not a legal requirement) protects against someone using a hijacked session to destroy an account. Keep it short: the erasure must still be done within the one-month deadline, so a 7-day window is easier to defend than 30. The confirmation email carries a one-time cancel link whose token is stored only as a hash.

Every request gets a row in `audit_log` with type, timestamps, steps and final status. That is your evidence if a regulator asks what happened to a request.

### Step 4: Add Retention Policies and Auto-Cleanup

Data that is no longer needed should not exist. The simplest way to meet the storage-limitation principle is to delete data automatically when it has served its purpose.

```text
Based on the data flow inventory, add retention policies: anonymize IP addresses after 30 days, delete inactive sessions after 90 days, purge soft-deleted user data after 30 days. Create a scheduled job in src/jobs/data-retention.ts that runs daily and enforces these policies. Add dry-run mode that reports what would be deleted without actually deleting.
```

The periods are Sara's design choices, based on purpose; the GDPR sets none of them. In dry-run mode (the default for the first two weeks) the job reports what would change:

- **IP addresses older than 30 days:** the last octet is zeroed, which keeps coarse location for analytics. Treat truncated addresses as still potentially personal data unless you can show they cannot be linked back.
- **Sessions inactive for 90+ days:** deleted.
- **Soft-deleted user records past 30 days:** purged from all tables, with a final audit entry.

Sara reviews two weeks of reports, confirms nothing needed would be lost, and switches to live mode. For logs, set an expiry on the log group itself (CloudWatch retention is a per-log-group setting) instead of cleaning it in the job.

### Step 5: Generate the Privacy Policy

A privacy policy should describe what the app actually does, not what a downloaded template says it might do.

```text
Based on the data flow inventory and consent categories, generate a privacy policy page in markdown. Include: what data is collected, legal basis for each type, retention periods, third-party processors, user rights (access, deletion, portability, rectification), and contact information placeholder. Keep language clear and non-legalistic.
```

The policy is built from the inventory, so each data type, processor and retention period it names matches what the app and the retention job do. The information to give users is listed in [Articles 13 and 14](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) (identity of the controller, purposes and legal basis, recipients, retention period or the criteria for it, the rights, and the right to complain to a supervisory authority). The legal bases come from [Article 6(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679):

- **Consent** (6(1)(a)) for analytics and marketing data, revocable in the preference center.
- **Contract** (6(1)(b)) for billing and for running the account the user signed up for.
- **Legitimate interests** (6(1)(f)) for things like rate limiting and abuse prevention, which needs a documented balancing test.

The skill leaves the company name, DPO contact (if you have one) and supervisory authority as placeholders; fill them in and have counsel read the page.

## Real-World Example

Sara answers the Berlin user within two days, well inside the one-month limit. The export endpoint produces a package showing the profile, 14 session records, 847 event log entries and the consent history. The user confirms the deletion, the cancel window passes, and the job clears or tombstones their records across all 7 models, deletes their Redis sessions, asks the analytics and email providers to erase the user, and writes the completed request to the audit log. Sara sends a confirmation noting that billing records were kept, with personal fields cleared where the law allows, because of a legal retention duty.

The banner goes live the same week, and analytics scripts that used to fire on every page load are now blocked until a visitor opts in. Marketing sees lower analytics coverage, which is the price of lawful tracking; the exact drop depends on your audience and your banner. The first real retention run on Sara's database anonymizes 47,000 IP addresses and removes 3,200 stale sessions. Those figures are Sara's; your own dry-run report will give yours.

The first enterprise prospect to ask about data handling gets an accurate privacy policy, a signed processor agreement from each vendor and the request logs, instead of a scramble.

## Related Skills

- **gdpr-compliance**: PII inventory, consent records, data subject request endpoints, retention job, privacy policy draft
- **security-audit**: finds secrets, tokens and personal data in logs, and injectable queries around the user tables
- **code-reviewer**: reviews the generated consent, export and deletion code before it ships
