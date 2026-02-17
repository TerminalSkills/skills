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

Your web app collects user emails, tracks page views, stores IP addresses, and uses third-party scripts that set cookies — all without a proper consent mechanism. A privacy-aware user files a data deletion request and you have no idea where their data lives across your database, logs, analytics, and third-party integrations. The GDPR fines are real (up to 4 % of global revenue), but hiring a Data Protection Officer and a compliance consultant costs more than your entire engineering team.

## The Solution

Audit your codebase and infrastructure for personal data flows, generate a compliant consent management system, and build automated handlers for data subject requests (access, deletion, portability). Three skills cover the full compliance stack.

```bash
npx terminal-skills install gdpr-compliance
npx terminal-skills install security-audit
npx terminal-skills install code-reviewer
```

## Step-by-Step Walkthrough

### 1. Audit personal data flows

```
Scan the codebase in src/ and the database schema in prisma/schema.prisma for personal data. Identify every field that stores PII: email, name, IP address, phone, location, device identifiers. Map where each piece of data flows — which services read it, which third-party APIs receive it, where it is logged. Output a data flow inventory as a markdown table.
```

The agent produces:

```
Personal Data Inventory — 23 PII fields found across 7 models:

| Data Type      | DB Table    | Field          | Shared With          | Retention  |
|---------------|-------------|----------------|----------------------|------------|
| Email          | users       | email          | Transactional email  | Indefinite |
| IP Address     | sessions    | ip_address     | Analytics, Logs      | Indefinite |
| Full Name      | users       | full_name      | Payment processor    | Indefinite |
| Phone          | users       | phone          | SMS provider         | Indefinite |
| Location       | events      | geo_lat/lng    | Analytics            | Indefinite |
| Device ID      | sessions    | device_id      | Push notifications   | Indefinite |

⚠️  Issues: No retention policy on any table. IP addresses logged in plaintext
    in CloudWatch. Payment processor receives full name without documented DPA.
```

### 2. Generate a consent management system

```
Build a cookie consent banner and preference center for the app. Categories: strictly_necessary (no consent needed), analytics, marketing, functional. Create a React component that blocks third-party scripts until consent is given. Store consent records in the database with timestamp, version, and granular choices. Generate the Prisma migration for the consent_records table.
```

### 3. Build data subject request handlers

```
Create API endpoints for GDPR data subject requests:
- GET /api/privacy/export — generates a JSON export of all personal data for the authenticated user
- DELETE /api/privacy/delete — anonymizes or deletes all personal data, cascading across related tables
- GET /api/privacy/consent-history — returns the user's consent history
Add a 30-day verification flow for deletion requests. Log every DSR in an audit_log table.
```

### 4. Add retention policies and auto-cleanup

```
Based on the data flow inventory, add retention policies: anonymize IP addresses after 30 days, delete inactive sessions after 90 days, purge soft-deleted user data after 30 days. Create a scheduled job in src/jobs/data-retention.ts that runs daily and enforces these policies. Add dry-run mode that reports what would be deleted without actually deleting.
```

### 5. Generate the privacy policy

```
Based on the data flow inventory and consent categories, generate a privacy policy page in markdown. Include: what data is collected, legal basis for each type, retention periods, third-party processors, user rights (access, deletion, portability, rectification), and contact information placeholder. Keep language clear and non-legalistic.
```

## Real-World Example

A solo developer runs a B2B SaaS tool with 12,000 users across the EU. She receives her first data deletion request via email and realizes she has no process — user data is scattered across PostgreSQL, Redis sessions, application logs, and two third-party analytics tools.

1. She asks the agent to audit personal data flows — it finds 23 PII fields across 7 database models, plus IP addresses in log files
2. The consent management component goes live with four categories, blocking analytics and marketing scripts by default
3. Data subject request endpoints are built with a 30-day deletion queue and full audit logging
4. A daily retention job anonymizes IP addresses older than 30 days and purges stale sessions
5. A clear privacy policy is generated from the actual data inventory, not a generic template
6. She responds to the deletion request with a verified process, and the user's data is fully purged in 48 hours

## Related Skills

- [gdpr-compliance](../skills/gdpr-compliance/) -- Data flow auditing, consent management, DSR handling
- [security-audit](../skills/security-audit/) -- Vulnerability scanning that complements privacy checks
- [code-reviewer](../skills/code-reviewer/) -- Reviews code changes for privacy regressions
