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

A fintech team copies production data into staging every week so developers can test with realistic datasets. The database has 2 million customer records with names, emails, phone numbers, national IDs, and bank account numbers scattered across 45 tables. Someone manually wrote anonymization scripts two years ago, but new columns get added regularly and the scripts silently skip them. The original script author left the company eight months ago.

Last month a developer noticed real customer emails in staging error logs: a Sentry alert showed a customer's full name, email, and the last four digits of their bank account. The compliance team is furious, and the next SOC 2 audit is in six weeks. Nobody knows which tables contain PII anymore. The documentation says "see the anonymization scripts" but those scripts only cover the columns that existed two years ago.

The gap between "we think staging is anonymized" and "we can prove it to an auditor" is getting wider with every deploy.

## The Solution

Three skills split the work. **data-analysis** profiles what is actually stored: a pandas script samples every text column and counts PII-shaped values. **sql-optimizer** turns the masking rules into batched, index-friendly `UPDATE` statements and checks their plans before they touch millions of rows. **coding-agent** drafts and reviews the scripts in the background while you read the scan. A final full scan checks the result and gates access to staging. Everything runs against the staging copy, never against production.

## Step-by-Step Walkthrough

### Step 1: Scan the Staging Copy for PII

Start from what is in the data, not from the documentation. Restore the latest production dump into a staging database whose name contains `staging`, then profile every text, `varchar` and `jsonb` column by content (a column called `metadata` can hold emails, and `reference_code` can hold national IDs). With the **data-analysis** skill the agent writes a small pandas profiler (`pip install pandas "psycopg[binary]"`; pandas 3 needs Python 3.11+):

```text
Write scan_pii.py. It connects to $STAGING_URL, reads 100 rows from every text, varchar, json and jsonb column, and counts values matching email, phone, US SSN, IBAN and IPv4 patterns. Print a table of column, pattern, hits and rows read. If FULL_SCAN=1, read every row instead of 100, and exit with status 1 when any email, SSN or IBAN pattern matches.
```

The result is a script like this one (tested against PostgreSQL 16 with pandas 3.1 and psycopg 3.3):

```python
import os, sys
import pandas as pd
import psycopg

PATTERNS = {
    "email": r"[\w.+-]+@(?!example\.com\b)[\w-]+\.[\w.-]+",
    "phone": r"\+?\d[\d\s().-]{8,}\d",
    "us_ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "iban": r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b",
    "ipv4": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
}

def scan(url, sample=100):  # sample=None reads every row (use for validation)
    rows = []
    with psycopg.connect(url) as conn:
        cols = conn.execute(
            """SELECT table_schema, table_name, column_name FROM information_schema.columns
               WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                 AND data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')"""
        ).fetchall()
        for schema, table, col in cols:
            q = f'SELECT "{col}"::text FROM "{schema}"."{table}" WHERE "{col}" IS NOT NULL' + (f' LIMIT {sample}' if sample else '')
            s = pd.Series([r[0] for r in conn.execute(q).fetchall()], dtype="str")
            if s.empty:
                continue
            for name, rx in PATTERNS.items():
                hits = int(s.str.contains(rx, regex=True).sum())
                if hits:
                    rows.append((f"{schema}.{table}.{col}", name, hits, len(s)))
    return pd.DataFrame(rows, columns=["column", "pattern", "hits", "rows_read"]).sort_values("hits", ascending=False)

if __name__ == "__main__":
    full = os.environ.get("FULL_SCAN") == "1"
    report = scan(os.environ["STAGING_URL"], None if full else 100)
    print(report.to_string(index=False))
    # phone and ipv4 patterns also match hex tokens and version strings, so only the strict ones gate
    sys.exit(1 if report["pattern"].isin(["email", "us_ssn", "iban"]).any() else 0)
```

Sampling finds free-text leaks that column names hide, such as `support_tickets.body` holding "Customer jane.doe@gmail.com reported that...". The phone and IPv4 patterns are loose and will flag some hex tokens and version strings; treat them as leads to review, which is why only the strict patterns decide the exit status. The first 100 rows are not a random sample, so a clean sample proves little; the validation step reads every row.

A typical report groups findings by sensitivity:

**HIGH (must anonymize):** `users.email`, `users.phone`, `users.national_id`, `payments.bank_account`, `support_tickets.body` (free text with names and emails).

**MEDIUM (review):** `orders.shipping_address`, `users.display_name`, `audit_log.actor_name`.

### Step 2: Generate Anonymization Rules

Blanking everything would break the application: foreign keys would fail, email validation would reject empty strings, and developers could not test realistic flows.

```text
For each HIGH and MEDIUM column, propose an anonymization strategy. Use a keyed hash for any value that appears in more than one table so joins still work. Pick synthetic names and addresses deterministically from lists, so the same input always gives the same output. Replace email domains with example.com. Redact free-text PII with pattern replacement.
```

| Table.Column | Strategy | Before | After |
|-------------|----------|--------|-------|
| users.email | Keyed hash plus reserved domain | jane.doe@gmail.com | 8c9286e893becfcb@example.com |
| users.phone | Fake number in the 555-01xx range | +1-415-555-0198 | +1-555-0151 |
| users.national_id | Keyed hash (HMAC-SHA256) | 123-45-6789 | 77e68e16f0400952 |
| payments.bank_account | Keep first 4 and last 4 characters | DE89370400440532013000 | DE89****3000 |
| support_tickets.body | Regex-redact emails and names | Customer jane.doe@gmail.com reported... | Customer [EMAIL] reported... |
| orders.shipping_address | Synthetic address from lists | 123 Main St, SF | 699 Maple Ave, Springfield |
| users.display_name | Synthetic name from lists | Jane Doe | Casey Rossi |

Two details matter. First, use a keyed hash (HMAC with a secret that never leaves the pipeline), not a plain `sha256`. A national ID has a tiny value space, so an unkeyed hash can be reversed by hashing every candidate. Second, the output must be deterministic: if the same email appears in `users.email`, `audit_log.actor_email` and `notifications.recipient`, every table must map it to the same token, otherwise joins return nothing and notification logs cannot be traced to users. Replacing the domain with `example.com` (reserved for documentation) also guarantees staging can never send mail to a real customer.

### Step 3: Build Batched SQL Scripts

With 2 million rows in `users` and 8 million in `orders`, a single `UPDATE` holds locks and bloats the table for its whole run. Ask the **sql-optimizer** skill for batched updates, and have it check the plan before the real run:

```text
Generate SQL that applies these rules in PostgreSQL. Update in id ranges of 10,000 rows with a commit per batch. Use pgcrypto hmac() with the key read from a session setting. Refuse to run if the database name does not contain "staging". Then show the EXPLAIN plan of one batch.
```

The script below ran against PostgreSQL 16 on a seeded test database (about 43,000 users plus audit rows). Run it with `psql "$STAGING_URL" -v ON_ERROR_STOP=1 -v key="$ANON_KEY" -f anonymize.sql`; do not add `--single-transaction`, because `COMMIT` inside a `DO` block needs PostgreSQL 11 or later and no surrounding transaction.

```sql
-- Run: psql "$STAGING_URL" -v ON_ERROR_STOP=1 -v key="$ANON_KEY" -f anonymize.sql
-- Do not wrap in --single-transaction: COMMIT inside DO needs PostgreSQL 11+ and no outer transaction.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Safety gate: refuse to run anywhere that is not staging.
DO $$ BEGIN
  IF current_database() NOT LIKE '%staging%' THEN
    RAISE EXCEPTION 'refusing to anonymize %: not a staging database', current_database();
  END IF;
END $$;

-- The key lives only for this session; it never enters the script or the repo.
SELECT count(set_config('app.anon_key', :'key', false)) AS key_loaded;

-- One function for every column, so the same input gives the same output everywhere.
CREATE OR REPLACE FUNCTION anon_token(val text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT left(encode(hmac(lower(btrim(val)), current_setting('app.anon_key'), 'sha256'), 'hex'), 16)
$$;

DO $$
DECLARE
  batch_size int := 10000;
  max_id int;
BEGIN
  SELECT coalesce(max(id), 0) INTO max_id FROM users;
  FOR i IN 0..max_id BY batch_size LOOP
    UPDATE users
       SET email       = anon_token(email) || '@example.com',
           national_id = anon_token(national_id),
           phone       = '+1-555-01' || lpad((abs(hashtext(phone)) % 100)::text, 2, '0'),
           metadata    = metadata - 'contact'
     WHERE id >= i AND id < i + batch_size;
    COMMIT;
  END LOOP;
END $$;

DO $$
DECLARE
  batch_size int := 10000;
  max_id int;
BEGIN
  SELECT coalesce(max(id), 0) INTO max_id FROM audit_log;
  FOR i IN 0..max_id BY batch_size LOOP
    UPDATE audit_log SET actor_email = anon_token(actor_email) || '@example.com'
     WHERE id >= i AND id < i + batch_size;
    COMMIT;
  END LOOP;
END $$;

-- Other rules, tested on PostgreSQL 16: mask the IBAN, pick a name and an address from lists.
-- Add each to a batched loop like the ones above. hashtext() is stable within one major
-- version, which is enough for staging; use anon_token() if you need stability across upgrades.
UPDATE payments SET bank_account = left(bank_account, 4) || '****' || right(bank_account, 4);
UPDATE users SET display_name =
    (ARRAY['Alex','Sam','Robin','Casey','Jordan','Morgan'])[1 + abs(hashtext(display_name)) % 6] || ' ' ||
    (ARRAY['Johnson','Lee','Garcia','Novak','Rossi','Kim'])[1 + abs(hashtext(display_name || 'x')) % 6];
UPDATE orders SET shipping_address = (100 + abs(hashtext(shipping_address)) % 900) || ' ' ||
    (ARRAY['Evergreen Terrace','Maple Ave','Oak Street','Cedar Lane'])[1 + abs(hashtext(shipping_address || 's')) % 4] || ', Springfield';

-- Free text: replace anything shaped like an email address.
UPDATE support_tickets
   SET body = regexp_replace(body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[EMAIL]', 'g')
 WHERE body ~ '@';
```

The range predicate `id >= i AND id < i + batch_size` uses the primary-key index, so each batch touches only its own rows. To confirm, wrap one batch in a transaction that you roll back, because `EXPLAIN ANALYZE` really executes the statement:

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
UPDATE users SET email = anon_token(email) || '@example.com' WHERE id >= 0 AND id < 10000;
ROLLBACK;
```

On the test database the plan was a `Bitmap Index Scan on users_pkey` with an execution time of 38 ms for one batch; a `Seq Scan` per batch means the key is not indexed. Because `anon_token` depends only on the value and the key, the tables can be processed in any order and the same email gets the same token everywhere. Keep the key in a secret store and use the same key every week, otherwise tokens change between refreshes and developers lose their saved test data. Add one block like the two above for each remaining HIGH and MEDIUM column, with a batch size chosen for the table.

### Step 4: Validate the Result

Running the scripts is half the job. Proving they worked is what the audit needs. Run the scan from Step 1 again, this time reading every row and every schema, including log tables:

```console
$ FULL_SCAN=1 python scan_pii.py
               column pattern  hits  rows_read
public.users.metadata   email     2      42858
   public.users.email   email     1      42858
$ echo $?
1
```

The synthetic `@example.com` addresses are excluded from the email pattern, so any remaining match is a real address. In this test run (rows planted after the rules ran) the scan caught an email in `users.email` and two in the `metadata` JSON column. This is why validation is a separate pass that looks at content and not at a list of known columns: every anonymization pipeline misses something on its first run, such as a table in another schema that the scripts never knew about.

### Step 5: Fix Gaps and Automate

Add the missed columns to `anonymize.sql`, rerun the pipeline, and wrap the sequence in a script that runs after every production-to-staging copy. Let the **coding-agent** skill draft and review the wrapper in the background while you check the report; do not give the agent the database URL or the HMAC key, only the script files:

```bash
claude -p "Review anonymize.sql and scan_pii.py for columns the rules miss and for SQL that would lock tables. Report findings only; do not edit files." \
  --permission-mode plan --allowedTools "Read" --max-budget-usd 2 \
  --output-format text > "$(mktemp /tmp/anon-review.XXXXXX)" 2>&1 &
```

The wrapper does the following, in order:

```bash
set -euo pipefail
psql "$ADMIN_URL" -c "REVOKE CONNECT ON DATABASE app_staging FROM devs"   # lock staging first
# ... your existing restore of the production dump into app_staging ...
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -v key="$ANON_KEY" -f anonymize.sql
FULL_SCAN=1 python scan_pii.py                                           # exits 1 on any real email, SSN or IBAN
psql "$ADMIN_URL" -c "GRANT CONNECT ON DATABASE app_staging TO devs"     # unlock only after the scan passes
```

Because of `set -e`, a failed scan stops the script before the `GRANT`, so staging stays locked; add an alert to your engineering channel in the failure path. When a developer adds `users.backup_email` next month, the scan matches on email patterns, not column names, and blocks the unlock until a rule exists for it.

## Real-World Example

Leo is a backend engineer at a fintech team of 18. After the incident with customer emails in staging Sentry alerts, he asks the agent to profile the 45-table staging copy. The scan finds PII in 22 columns, including three that the old manual scripts missed and the free-text support ticket field.

The agent generates batched SQL, and on the team's data the 2 million user records anonymize in about 4 minutes. The full-row validation scan flags `email_logs.recipient`, a table in a separate schema, and it is added to the rules. Leo wires the sequence into the post-copy job with the access gate, and the compliance team gets a validation report with before and after samples to show the SOC 2 auditor. The setup took him an afternoon, and new columns are caught automatically because the check runs on the data, not on a column list that goes stale with the next migration.
