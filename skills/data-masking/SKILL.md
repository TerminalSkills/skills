---
name: data-masking
description: >-
  Mask and redact sensitive data (PII, PCI, PHI) in databases, logs, and APIs. Use when
  protecting PII in dev/staging environments, redacting sensitive data from logs, or
  anonymizing data for analytics while preserving data structure.
license: Apache-2.0
compatibility: "Python 3.9+, Node.js 18+. Libraries: faker, presidio, anonymize-it."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
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
    "email": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "phone_us": r'\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b',
    "ssn": r'\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b',
    "credit_card": r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b',
    "ip_address": r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b',
    "date_of_birth": r'\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b',
    "passport": r'\b[A-Z]{1,2}[0-9]{6,9}\b',
    "zip_code": r'\b\d{5}(?:-\d{4})?\b',
}
```

## Email and Credit Card Maskers

```python
import random
import string
from faker import Faker

fake = Faker()

def mask_email(email: str) -> str:
    """Mask email preserving domain structure."""
    local, domain = email.split('@')
    masked_local = local[0] + '*' * (len(local) - 2) + local[-1] if len(local) > 2 else '***'
    return f"{masked_local}@{domain}"

def mask_email_fake(email: str) -> str:
    """Replace email with realistic fake."""
    return fake.email()

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

def generate_fake_pii() -> dict:
    """Generate a complete set of realistic fake PII for testing."""
    return {
        "name": fake.name(),
        "email": fake.email(),
        "phone": fake.phone_number(),
        "address": fake.address(),
        "ssn": fake.ssn(),
        "dob": fake.date_of_birth(minimum_age=18, maximum_age=90).isoformat(),
        "credit_card": fake.credit_card_number(card_type='visa'),
        "company": fake.company(),
    }
```

## Log Sanitizer Middleware

```python
# Express.js log scrubbing middleware
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
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

-- Column-level masking function using pgcrypto for format-preserving
CREATE OR REPLACE FUNCTION mask_pan(pan TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN RPAD(LEFT(pan, 6), LENGTH(pan) - 4, '*') || RIGHT(pan, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Dynamic masking based on current user role
CREATE OR REPLACE FUNCTION get_user_data(p_user_id UUID)
RETURNS TABLE (name TEXT, email TEXT, phone TEXT) AS $$
BEGIN
  IF current_user = 'admin_role' THEN
    RETURN QUERY SELECT u.name, u.email, u.phone FROM users u WHERE u.id = p_user_id;
  ELSE
    RETURN QUERY SELECT 
      LEFT(u.name, 1) || '***',
      REGEXP_REPLACE(u.email, '^([^@])([^@]*)(@.+)$', '\1***\3'),
      '***-***-' || RIGHT(u.phone, 4)
    FROM users u WHERE u.id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Microsoft Presidio — Auto-Detection

```python
# Presidio automatically detects and masks PII using NLP
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine, AnonymizerConfig
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
        # Hash for consistent pseudonymization (same input → same output)
        operators = {"DEFAULT": OperatorConfig("hash", {"hash_type": "sha256"})}
    
    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=operators
    )
    return anonymized.text

# Example
text = "Contact John Smith at john.smith@email.com or 555-123-4567"
print(mask_text_presidio(text))
# → "Contact [NAME] at [EMAIL] or [PHONE]"
```

## Production DB → Dev DB Pipeline

```bash
#!/bin/bash
# mask-db-for-dev.sh — Safe production → dev data pipeline

set -e
PROD_DB="postgresql://prod-server/app"
DEV_DB="postgresql://dev-server/app_dev"

echo "Dumping production schema..."
pg_dump --schema-only $PROD_DB > schema.sql

echo "Applying schema to dev..."
psql $DEV_DB < schema.sql

echo "Copying and masking data..."
psql $PROD_DB -c "\COPY (
  SELECT 
    id,
    LEFT(first_name, 1) || 'XXXX' AS first_name,
    'User' AS last_name,
    'user_' || id || '@example.com' AS email,
    '555-000-' || LPAD((ROW_NUMBER() OVER())::TEXT, 4, '0') AS phone,
    created_at,
    status
  FROM users
) TO STDOUT WITH CSV" | psql $DEV_DB -c "\COPY users_masked FROM STDIN WITH CSV"

echo "Done. Dev database ready with masked data."
```

## Compliance Checklist

- [ ] PII inventory completed (what data, where it lives)
- [ ] Log scrubbing middleware deployed in all services
- [ ] Dev/staging environments use masked data only
- [ ] Database views/roles restrict raw PII access
- [ ] API responses mask PII for non-privileged callers
- [ ] CI pipeline scans for hardcoded PII/secrets
- [ ] Masked data pipeline documented and tested
- [ ] Masking solution reviewed annually
