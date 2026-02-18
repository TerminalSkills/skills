---
title: "Automate GDPR and Privacy Compliance for Web Apps"
slug: automate-gdpr-compliance
description: "Scan your web app for privacy violations, generate compliant consent flows, and build automated data subject request handling — without hiring a DPO."
skills: [gdpr-compliance, security-audit, code-reviewer]
category: development
tags: [gdpr, privacy, compliance, data-protection, consent-management]
---

# Automate GDPR and Privacy Compliance for Web Apps

## The Problem

Sara runs a B2B SaaS tool with 12,000 users across the EU. The app collects emails, tracks page views, stores IP addresses, and uses third-party scripts that set cookies — all without a proper consent mechanism. Last Tuesday, a user in Berlin emailed asking for all their personal data to be deleted. Sara realized she has no idea where that user's data actually lives.

It is in PostgreSQL, obviously. But also in Redis sessions that store the user's last active timestamp. And in application logs where every API request includes the user's IP and auth token. And in the two third-party analytics tools the marketing team integrated last year without telling engineering. And in the payment processor that has the user's full name and billing address.

The GDPR fines are real — up to 4% of global revenue — but hiring a Data Protection Officer and a compliance consultant costs more than Sara's entire engineering team. She needs to find every piece of personal data in her system, build proper consent flows, and create a process for handling deletion requests. The user in Berlin is waiting for a response, and GDPR gives Sara 30 days.

## The Solution

Using the **gdpr-compliance**, **security-audit**, and **code-reviewer** skills, the agent audits the codebase for personal data flows, generates a consent management system with granular cookie categories, builds API endpoints for data subject requests (access, deletion, portability), and sets up automated retention policies. Three skills cover the full compliance stack without the six-figure consultant bill.

## Step-by-Step Walkthrough

### Step 1: Audit Personal Data Flows

First, map where personal data actually lives. Not where you think it lives — where it actually lives. The gap between these two is where compliance violations hide.

```text
Scan the codebase in src/ and the database schema in prisma/schema.prisma for personal data. Identify every field that stores PII: email, name, IP address, phone, location, device identifiers. Map where each piece of data flows — which services read it, which third-party APIs receive it, where it is logged. Output a data flow inventory as a markdown table.
```

The scan finds 23 PII fields across 7 database models:

| Data Type | DB Table | Field | Shared With | Retention |
|---|---|---|---|---|
| Email | users | email | Transactional email service | Indefinite |
| IP Address | sessions | ip_address | Analytics, CloudWatch logs | Indefinite |
| Full Name | users | full_name | Payment processor | Indefinite |
| Phone | users | phone | SMS provider | Indefinite |
| Location | events | geo_lat/lng | Analytics | Indefinite |
| Device ID | sessions | device_id | Push notification service | Indefinite |

Three issues jump out immediately:

1. **No retention policy on any table** — data lives forever by default. A user who signed up three years ago and never logged in again still has their IP address, device ID, and location data sitting in the database.
2. **IP addresses logged in plaintext in CloudWatch** with no log expiration policy. These logs are accessible to every developer with AWS console access.
3. **The payment processor receives full names** without a documented Data Processing Agreement, which GDPR requires for every third-party processor handling EU personal data.

Every field marked "Indefinite" is a compliance risk. GDPR requires a legal basis and a defined retention period for each category of personal data. "We keep it forever because we never thought about it" is not a legal basis.

### Step 2: Generate a Consent Management System

Cookie banners are the visible tip of the iceberg. The real work is blocking third-party scripts until consent is given and recording that consent with enough detail to prove compliance if someone asks.

```text
Build a cookie consent banner and preference center for the app. Categories: strictly_necessary (no consent needed), analytics, marketing, functional. Create a React component that blocks third-party scripts until consent is given. Store consent records in the database with timestamp, version, and granular choices. Generate the Prisma migration for the consent_records table.
```

The consent system has four layers:

- **Banner component** — appears on first visit, blocks all non-essential scripts until the user makes an active choice. No pre-checked boxes, no "continue browsing means you agree" tricks — both are GDPR violations.
- **Preference center** — accessible from the footer at any time, lets users change their choices with one click
- **Script blocker** — wraps third-party script tags (analytics, marketing pixels, chat widgets) and only injects them into the DOM after the relevant consent category is granted
- **Consent record table** — stores `user_id`, `timestamp`, `consent_version`, and a JSONB column with granular choices like `{ analytics: true, marketing: false, functional: true }`

The consent version is critical for ongoing compliance. When the privacy policy changes — a new analytics tool, a new data processor, a change in retention periods — a new version number invalidates existing consent and the banner reappears. Every consent record is immutable: updates create new rows, preserving the full history for audit. If a regulator asks "did this user consent to analytics on March 15?", the answer is in the database.

### Step 3: Build Data Subject Request Handlers

When a user asks "show me my data" or "delete everything you have on me," the response needs to be automated, thorough, and auditable.

```text
Create API endpoints for GDPR data subject requests:
- GET /api/privacy/export — generates a JSON export of all personal data for the authenticated user
- DELETE /api/privacy/delete — anonymizes or deletes all personal data, cascading across related tables
- GET /api/privacy/consent-history — returns the user's consent history
Add a 30-day verification flow for deletion requests. Log every DSR in an audit_log table.
```

The export endpoint collects data from every table that references the user: profile information, session records, event logs, consent history, and any third-party data that can be retrieved via API. It packages everything into a downloadable JSON file — the user's complete data portrait.

The deletion endpoint is more nuanced. GDPR does not require deleting everything — it requires deleting personal data that is no longer necessary for the purpose it was collected. Order records need to exist for tax and accounting purposes (legal obligation), but the personal details within them get replaced with hashed values: the order total stays, but the name and address become `[REDACTED]`. Session data gets purged entirely. Event logs get their PII fields zeroed out while preserving the anonymous event data for analytics.

The 30-day verification window gives users time to change their mind and protects against accidental or malicious deletion requests. Someone gaining temporary access to an account should not be able to permanently destroy years of data with one API call. During the verification period, the user receives an email confirming their request with a link to cancel it.

Every data subject request, regardless of type, gets logged to an `audit_log` table with the request type, timestamp, each processing step, and the final completion status. This audit trail is what proves compliance if a regulator asks "what did you do with this user's deletion request?"

### Step 4: Add Retention Policies and Auto-Cleanup

Data that is no longer needed should not exist. The simplest way to comply with data minimization requirements is to delete data automatically when it has served its purpose.

```text
Based on the data flow inventory, add retention policies: anonymize IP addresses after 30 days, delete inactive sessions after 90 days, purge soft-deleted user data after 30 days. Create a scheduled job in src/jobs/data-retention.ts that runs daily and enforces these policies. Add dry-run mode that reports what would be deleted without actually deleting.
```

The retention job runs at 3 AM daily. In dry-run mode (the default for the first two weeks), it reports what would be affected without changing anything:

- **IP addresses older than 30 days:** anonymized by replacing the last two octets with zeros (preserves country-level analytics without identifying individuals)
- **Sessions inactive for 90+ days:** deleted entirely
- **Soft-deleted user records past 30 days:** purged from all tables, with a final audit log entry recording the purge

Dry-run mode builds confidence. Sara reviews two weeks of reports, verifies nothing critical would be lost, and then flips it to live mode. The first real run anonymizes 47,000 IP addresses and clears 3,200 stale sessions. The database shrinks by 8%.

### Step 5: Generate the Privacy Policy

A privacy policy should describe what the app actually does, not what a generic template downloaded from the internet says it might do. Generic templates include clauses about data types the app does not collect and omit the specific third-party processors that actually receive user data. This creates a false sense of compliance.

```text
Based on the data flow inventory and consent categories, generate a privacy policy page in markdown. Include: what data is collected, legal basis for each type, retention periods, third-party processors, user rights (access, deletion, portability, rectification), and contact information placeholder. Keep language clear and non-legalistic.
```

The generated policy is built directly from the data flow inventory. Every data type listed is one the app actually collects. Every third-party processor named is one that actually receives user data. Every retention period matches the actual retention job configuration. No boilerplate claims about data the app does not collect, and no missing disclosures about data it does.

Each data type has a specific legal basis:
- **Consent** for analytics and marketing data (revocable at any time through the preference center)
- **Legitimate interest** for essential functionality like session management and rate limiting
- **Contractual necessity** for billing and payment processing

User rights are not just listed — they include direct links to the export and deletion endpoints, so a user reading the policy can exercise their rights immediately without contacting support.

## Real-World Example

Sara responds to the deletion request from the Berlin user within 48 hours — well within the GDPR's 30-day window. The export endpoint generates a complete data package showing the user exactly what was stored: their profile, 14 session records, 847 event log entries, and their consent history. The deletion endpoint anonymizes their records across all 7 database models (replacing names with hashed values, zeroing out IP addresses, clearing session data), purges their Redis sessions, and logs the completed request to the audit trail. Sara sends the user a confirmation email summarizing what was deleted and what was anonymized, along with an explanation of why some records (billing history) were anonymized rather than deleted (legal requirement for tax records).

The consent banner goes live the same week. Analytics scripts that were firing on every page load without consent are now blocked by default — about 40% of EU users decline analytics cookies, which reduces the marketing team's analytics coverage but eliminates the legal exposure. The daily retention job quietly cleans up stale data every night: 30-day-old IP addresses anonymized, 90-day inactive sessions purged, soft-deleted user data permanently removed after 30 days. The database shrinks by 8% in the first month just from clearing stale sessions that had been accumulating since the app launched.

Total effort: one week of engineering time to go from "we have no process and a deletion request sitting in the inbox" to fully automated GDPR compliance. The first enterprise prospect who asks about data handling gets a clear, accurate privacy policy backed by real technical controls — data subject request endpoints, automated retention policies, granular consent management — instead of a scramble and a vague promise that "we take privacy seriously."
