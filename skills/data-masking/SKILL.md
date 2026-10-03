---
name: data-masking
description: >-
  Mask, redact, and anonymize sensitive data (PII, PCI, PHI) in databases, logs, and APIs.
  Use when protecting PII in dev/staging environments, redacting sensitive data from logs,
  anonymizing data for analytics, or applying k-anonymity and differential privacy for
  GDPR-compliant data sharing.
license: Apache-2.0
compatibility: "Python 3.10+, Node.js 18+. Libraries: faker, presidio-analyzer, presidio-anonymizer, spaCy en_core_web_lg."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/microsoft/presidio
  tags: ["data-masking", "pii", "privacy", "anonymization", "redaction"]
  use-cases:
    - "Mask production PII before copying to dev/staging environment"
    - "Scrub sensitive data from application logs"
    - "Redact PII from API responses for analytics"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Data Masking

## Overview

Data masking replaces real sensitive data with realistic but fake data, preserving format and structure. Essential for:
- **Dev/staging environments**: Use masked production data without exposing real PII
- **Log sanitization**: Prevent PII from appearing in log aggregation systems
- **Analytics**: Analyze behavioral patterns without raw PII
- **Testing**: Realistic test data that won't trigger real consequences

## Instructions

1. Inventory where PII lives (tables, log fields, API payloads, exports) and classify it as direct identifiers or quasi-identifiers.
2. Pick the technique per use case from the table below; prefer irreversible masking for dev/staging and tokenization only where the real value must be recovered.
3. Mask at the boundary (export job, log formatter, API serializer), never in the consuming app.
4. Verify: scan the masked output with the patterns or Presidio and fail the pipeline on any hit.

## Masking Techniques

| Technique | How | When to Use |
|-----------|-----|-------------|
| **Static masking** | Replace data at rest permanently | Dev DB copy |
| **Dynamic masking** | Mask on-read, original preserved | Role-based views |
| **Tokenization** | Replace with token that maps to real value | Payment cards |
| **Format-preserving** | Keep format, change values (e.g., real-looking SSN) | Testing |
| **Redaction** | Replace with placeholder (`[REDACTED]`) | Logs |
| **Generalization** | Replace specific value with range (age 34 → 30-40) | Analytics |

## PII Pattern Library

```python
import re

PII_PATTERNS = {
    "email": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
    "phone_us": r'\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b',
    "ssn": r'\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b',
    "credit_card": r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b',
    "ip_address": r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b',
    "date_of_birth": r'\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b',
    "passport": r'\b[A-Z]{1,2}[0-9]{6,9}\b',
    "zip_code": r'\b\d{5}(?:-\d{4})?\b',
}
```

These regexes are a fast first pass and over-match: `passport` and `zip_code` hit ordinary numbers and product codes, `phone_us` hits any 10-digit run. Use them for logs; for free text or unknown columns use Presidio below. Validate card candidates with a Luhn check before redacting.

## Email and Credit Card Maskers

```python
import re
from faker import Faker

fake = Faker()
Faker.seed(4471)  # same seed -> same fake values on every run (stable fixtures)

def mask_email(email: str) -> str:
    """Mask email preserving domain structure."""
    local, domain = email.split('@')
    masked_local = local[0] + '*' * (len(local) - 2) + local[-1] if len(local) > 2 else '***'
    return f"{masked_local}@{domain}"

def mask_credit_card(card_number: str) -> str:
    """Mask credit card — show only last 4 digits."""
    cleaned = re.sub(r'[\s-]', '', card_number)
    return '*' * (len(cleaned) - 4) + cleaned[-4:]

def mask_ssn(ssn: str) -> str:
    """Mask SSN — show only last 4."""
    cleaned = ssn.replace('-', '').replace(' ', '')
    return f"***-**-{cleaned[-4:]}"

def mask_phone(phone: str) -> str:
    """Mask phone — show only last 4 digits."""
    digits = re.sub(r'\D', '', phone)
    return f"***-***-{digits[-4:]}"
```

## Log Sanitizer Middleware

```javascript
// Node.js log scrubbing (winston)
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
  ssn: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  phone: /\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  password: /"password"\s*:\s*"[^"]*"/g,
  token: /"(?:token|api_key|secret|authorization)"\s*:\s*"[^"]*"/gi,
};

function sanitizeLog(data) {
  let sanitized = typeof data === 'string' ? data : JSON.stringify(data);
  
  sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL]');
  sanitized = sanitized.replace(PII_PATTERNS.creditCard, '[CREDIT_CARD]');
  sanitized = sanitized.replace(PII_PATTERNS.ssn, '[SSN]');
  sanitized = sanitized.replace(PII_PATTERNS.phone, '[PHONE]');
  sanitized = sanitized.replace(PII_PATTERNS.password, '"password":"[REDACTED]"');
  sanitized = sanitized.replace(PII_PATTERNS.token, (match) => {
    const key = match.split(':')[0];
    return `${key}:"[REDACTED]"`;
  });
  
  return sanitized;
}

// Wrap Winston logger to auto-sanitize
const winston = require('winston');
const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.printf(({ level, message, ...meta }) => {
      return JSON.stringify({
        level,
        message: sanitizeLog(message),
        ...JSON.parse(sanitizeLog(JSON.stringify(meta)))
      });
    })
  )
});
```

## Database Masking (PostgreSQL)

```sql
-- Create masked view for dev access
CREATE OR REPLACE VIEW users_masked AS
SELECT
  id,
  -- Mask name: keep first letter + *** 
  LEFT(first_name, 1) || '***' AS first_name,
  LEFT(last_name, 1) || '***' AS last_name,
  -- Mask email: preserve domain
  REGEXP_REPLACE(email, '^([^@])([^@]*)(@.+)$', '\1***\3') AS email,
  -- Mask phone: show only last 4
  '***-***-' || RIGHT(phone, 4) AS phone,
  -- Mask SSN: show only last 4
  '***-**-' || RIGHT(ssn, 4) AS ssn,
  -- Keep non-sensitive fields as-is
  created_at,
  status,
  country
FROM users;

-- Grant dev team access to masked view only (not base table)
GRANT SELECT ON users_masked TO dev_team;
REVOKE SELECT ON users FROM dev_team;

-- Dynamic, role-aware masking: use a SECURITY DEFINER function or the
-- PostgreSQL Anonymizer extension (anon.start_dynamic_masking) instead of ad-hoc views.
```

## Microsoft Presidio — Auto-Detection

```python
# pip install presidio-analyzer presidio-anonymizer && python -m spacy download en_core_web_lg
# (Python 3.10+; the default NLP engine needs the spaCy model)
import os
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def mask_text_presidio(text: str, masking_style: str = "replace") -> str:
    """Auto-detect and mask PII using Presidio NLP."""
    results = analyzer.analyze(text=text, language="en")
    
    if masking_style == "replace":
        # Replace with type label: [EMAIL_ADDRESS]
        operators = {
            "DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"}),
            "EMAIL_ADDRESS": OperatorConfig("replace", {"new_value": "[EMAIL]"}),
            "PHONE_NUMBER": OperatorConfig("replace", {"new_value": "[PHONE]"}),
            "PERSON": OperatorConfig("replace", {"new_value": "[NAME]"}),
            "US_SSN": OperatorConfig("replace", {"new_value": "[SSN]"}),
        }
    elif masking_style == "hash":
        # Since 2.2.361 hashes use a random salt; pass a fixed salt (from a secret)
        # if the same input must map to the same output across rows
        operators = {"DEFAULT": OperatorConfig("hash", {"hash_type": "sha256", "salt": os.environ["MASKING_SALT"]})}
    
    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=operators
    )
    return anonymized.text

# Example
text = "Contact Dana Whitfield at dana.whitfield@northwind-mail.org or 555-123-4567"
print(mask_text_presidio(text))
# → "Contact [NAME] at [EMAIL] or [PHONE]"  (exact labels depend on detected entities)
```

## Production DB → Dev DB Pipeline

```bash
#!/bin/bash
# mask-db-for-dev.sh — Safe production → dev data pipeline

set -e
PROD_DB="${PROD_DATABASE_URL:?set PROD_DATABASE_URL}"   # read-only replica credentials
DEV_DB="${DEV_DATABASE_URL:?set DEV_DATABASE_URL}"

echo "Dumping production schema..."
pg_dump --schema-only "$PROD_DB" > schema.sql

echo "Applying schema to dev..."
psql "$DEV_DB" < schema.sql

echo "Copying and masking data..."
psql "$PROD_DB" -c "\COPY (
  SELECT 
    id,
    LEFT(first_name, 1) || 'XXXX' AS first_name,
    'User' AS last_name,
    'user_' || id || '@masked.invalid' AS email,
    '555-000-' || LPAD((ROW_NUMBER() OVER())::TEXT, 4, '0') AS phone,
    created_at,
    status
  FROM users
) TO STDOUT WITH CSV" | psql "$DEV_DB" -c "\COPY users FROM STDIN WITH CSV"

echo "Done. Dev database ready with masked data."
```

## Statistical Anonymization (GDPR)

**Anonymization vs Pseudonymization (GDPR Article 4):**
- **Anonymization**: Irreversible -- data can never be linked to an individual. Falls outside GDPR scope.
- **Pseudonymization**: Reversible -- data can be re-linked with additional info. Still personal data under GDPR.

**Key techniques for true anonymization:**
- **k-Anonymity**: Each record is indistinguishable from at least k-1 others on quasi-identifiers (age, ZIP, gender). Generalize values into ranges and suppress groups smaller than k.
- **l-Diversity**: Each equivalence class has at least l distinct sensitive attribute values, preventing attribute disclosure.
- **Differential Privacy**: Mathematical privacy guarantee controlled by epsilon -- add calibrated noise to query results. Use `diffprivlib` (Python) or Google DP libraries.

k-anonymity alone is often insufficient for GDPR -- combine with l-diversity and/or differential privacy.

## Examples

### Example 1: Safe staging copy

**User request:** "Refresh staging from production but nobody on the dev team may see real emails or phone numbers."

Run the pipeline script above with `PROD_DATABASE_URL` and `DEV_DATABASE_URL` set, then verify:

```bash
psql "$DEV_DATABASE_URL" -tAc "SELECT count(*) FROM users WHERE email NOT LIKE '%@masked.invalid'"
```

Expected output: `0`. Any other number means unmasked rows leaked and the refresh must be discarded.

### Example 2: Scrub PII from application logs

**User request:** "Our request logs contain customer emails and card numbers; clean them before they reach Datadog."

Wrap the logger with `sanitizeLog` from the middleware section. A line such as `{"msg":"refund for dana.whitfield@northwind-mail.org card 4111111111111111"}` is emitted as `{"msg":"refund for [EMAIL] card [CREDIT_CARD]"}`. Add a unit test that feeds sample PII through the logger and asserts none survives.

## Guidelines

- Mask irreversibly by default; a reversible mapping or key stored beside the data is pseudonymization, still personal data under GDPR.
- Regex finds formats, not names or addresses; use Presidio (and review its misses) for free text.
- Salts and encryption keys come from a secret manager or environment variable, never from the repository.
- Keep referential integrity: the same real value must map to the same fake value in every table (seeded Faker or salted hash).
- Test on a copy first, and scan the output before anyone gets access.
- Do not treat k-anonymity alone as GDPR-grade anonymization.
