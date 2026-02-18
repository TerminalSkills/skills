---
title: "Build an Automated Data Anonymization Pipeline with AI"
slug: build-automated-data-anonymization-pipeline
description: "Use AI to detect PII in databases and files, apply anonymization rules, and validate that no sensitive data leaks into lower environments."
skills: [coding-agent, data-analysis, sql-optimizer]
category: data-ai
tags: [privacy, anonymization, pii, data-pipeline, compliance]
---

# Build an Automated Data Anonymization Pipeline with AI

## The Problem

A fintech team copies production data into staging every week so developers can test with realistic datasets. The database has 2 million customer records with names, emails, phone numbers, national IDs, and bank account numbers scattered across 45 tables. Someone manually wrote anonymization scripts two years ago, but new columns get added regularly and the scripts silently skip them. Last month a developer noticed real customer emails in staging logs. The compliance team is furious, and the next audit is in six weeks. Nobody knows which tables contain PII anymore, and writing anonymization rules for every new field is a chore that always falls through the cracks.

## The Solution

Use the **coding-agent** skill to scan every table and column for PII patterns — names, emails, phone numbers, IDs, and financial data. Feed the findings into the **data-analysis** skill to classify each column by sensitivity level and generate anonymization rules. Use the **sql-optimizer** skill to produce efficient SQL scripts that apply masking, hashing, and synthetic data replacement without breaking foreign key relationships.

```bash
npx terminal-skills install coding-agent data-analysis sql-optimizer
```

## Step-by-Step Walkthrough

### 1. Scan the database for PII

Tell your AI agent:

```text
Connect to our staging database (PostgreSQL, connection details in .env). Scan all 45 tables — for each column, sample 100 rows and classify whether it contains PII. Check for: email addresses, phone numbers, full names, national ID patterns, bank account numbers, IP addresses, and free-text fields that might contain personal info. Output a report grouped by sensitivity level.
```

The agent uses **data-analysis** to inspect column names, data types, and actual content:

```text
PII Scan Results — 45 tables, 312 columns

HIGH sensitivity (must anonymize):
  users.email — 100% match for email pattern
  users.phone — 98% match for phone pattern
  users.national_id — 100% match for national ID
  payments.bank_account — 100% match for IBAN pattern
  support_tickets.body — free text, 34% of samples contain names/emails

MEDIUM sensitivity (review needed):
  orders.shipping_address — contains street addresses
  users.display_name — may contain real names
  audit_log.actor_name — contains full names

LOW sensitivity:
  ... 280 columns with no PII detected
```

### 2. Generate anonymization rules

```text
For each HIGH and MEDIUM sensitivity column, propose an anonymization strategy. Use deterministic hashing for foreign key columns so relationships are preserved. Use synthetic data for names and addresses. Mask emails to keep the domain but replace the local part. Redact free-text PII with pattern replacement.
```

```text
Anonymization Rules:

| Table.Column | Strategy | Example |
|-------------|----------|---------|
| users.email | hash-local-part | j3k9x@gmail.com |
| users.phone | format-preserving-fake | +1-555-0142 |
| users.national_id | sha256-hash | a8f3e... |
| payments.bank_account | format-preserving-mask | DE89****4321 |
| support_tickets.body | regex-redact names/emails | [REDACTED] filed a complaint... |
| orders.shipping_address | synthetic-address | 742 Evergreen Terrace, Springfield |
| users.display_name | faker-name | Alex Johnson |
```

### 3. Build efficient SQL migration scripts

```text
Generate SQL scripts that apply these anonymization rules. Optimize for batch processing — we have 2 million rows in users and 8 million in orders. Use UPDATE ... FROM with batch commits of 10,000 rows to avoid lock contention. Preserve referential integrity by hashing users.email consistently everywhere it appears.
```

The **sql-optimizer** skill produces batched, transaction-safe scripts:

```sql
-- Anonymize users.email (deterministic so FK references match)
DO $$
DECLARE batch_size INT := 10000; max_id INT;
BEGIN
  SELECT MAX(id) INTO max_id FROM users;
  FOR i IN 0..max_id BY batch_size LOOP
    UPDATE users SET email = encode(digest(email, 'sha256'), 'hex')
      || '@' || split_part(email, '@', 2)
    WHERE id BETWEEN i AND i + batch_size - 1;
    COMMIT;
  END LOOP;
END $$;
```

### 4. Validate anonymization completeness

```text
After running the anonymization scripts, re-scan all HIGH and MEDIUM columns. Verify that no real PII remains. Also check logs tables and any materialized views. Produce a compliance report showing before/after sample data.
```

```text
Validation Report — Post-Anonymization

✅ users.email — 0 real emails detected (was 2,000,000)
✅ users.phone — 0 real phones detected
✅ users.national_id — 0 real IDs detected
✅ payments.bank_account — 0 real IBANs detected
⚠️ email_logs.recipient — MISSED! 45,000 real emails found (table not in original scan)
```

### 5. Fix gaps and automate for next time

```text
Add email_logs.recipient to the anonymization rules. Then create a pre-copy hook script that runs the full anonymization pipeline automatically after every production-to-staging data copy. Include the PII scan as a validation gate that blocks access until it passes.
```

## Real-World Example

Leo is a backend engineer at a fintech team of 18. After a near-miss where customer emails appeared in staging error logs, he asks the agent to scan their 45-table database. The agent finds PII in 22 columns including three that the old manual scripts missed entirely. It generates optimized SQL scripts that anonymize 2 million user records in 4 minutes with batched updates. The validation step catches one table the scan missed — email_logs — which the agent immediately adds. Leo sets up the pipeline as a post-copy hook, and the compliance team gets a clean audit report showing zero PII leakage in staging. The whole setup took an afternoon instead of the two weeks originally estimated.
