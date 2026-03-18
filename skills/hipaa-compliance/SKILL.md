---
name: hipaa-compliance
description: >-
  Implement HIPAA compliance for healthcare applications — PHI handling, encryption, audit logging,
  access controls, and Business Associate Agreements. Use when building healthtech apps, handling
  patient data, preparing for a HIPAA audit, or signing hospital/payer contracts.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python and Node.js."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["hipaa", "healthcare", "compliance", "phi", "encryption"]
  use-cases:
    - "Implement PHI encryption at rest and in transit for a patient portal"
    - "Set up HIPAA-compliant audit logging for EHR access"
    - "Prepare a healthtech SaaS for hospital contract security review"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# HIPAA Compliance

## Overview

HIPAA (Health Insurance Portability and Accountability Act) mandates how covered entities and business associates protect Protected Health Information (PHI). The Security Rule requires administrative, physical, and technical safeguards. Non-compliance fines range from $100 to $50,000 per violation, up to $1.9M/year per category.

## PHI Identification and Classification

PHI is any individually identifiable health information. The 18 HIPAA identifiers:

1. Names
2. Geographic data smaller than state (ZIP, address)
3. Dates (except year) related to an individual
4. Phone numbers
5. Fax numbers
6. Email addresses
7. SSNs
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers and serial numbers
13. Device identifiers
14. Web URLs
15. IP addresses
16. Biometric identifiers (finger/voice prints)
17. Full-face photos
18. Any other unique identifying number or code

### PHI Detection (Python with Presidio)

```python
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

PHI_ENTITIES = [
    "PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS",
    "US_SSN", "US_DRIVER_LICENSE", "MEDICAL_LICENSE",
    "IP_ADDRESS", "URL", "LOCATION", "DATE_TIME"
]

def detect_phi(text: str) -> list:
    """Detect PHI in text and return findings."""
    results = analyzer.analyze(
        text=text,
        entities=PHI_ENTITIES,
        language="en"
    )
    return results

def redact_phi(text: str) -> str:
    """Redact all PHI from text."""
    results = detect_phi(text)
    anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text

# Example
note = "Patient John Smith (DOB 1985-03-15, SSN 123-45-6789) presented with chest pain."
print(redact_phi(note))
# → "Patient <PERSON> (DOB <DATE_TIME>, SSN <US_SSN>) presented with chest pain."
```

## Technical Safeguards

### Encryption at Rest (AES-256)

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

def encrypt_phi(plaintext: str, key: bytes = None) -> dict:
    """Encrypt PHI with AES-256-GCM. Returns ciphertext + nonce."""
    if key is None:
        key = os.urandom(32)  # 256-bit key
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return {
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        "key": base64.b64encode(key).decode()  # store in HSM/KMS, not DB!
    }

def decrypt_phi(ciphertext_b64: str, nonce_b64: str, key_b64: str) -> str:
    """Decrypt PHI."""
    key = base64.b64decode(key_b64)
    nonce = base64.b64decode(nonce_b64)
    ciphertext = base64.b64decode(ciphertext_b64)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

**Key management:** Store encryption keys in AWS KMS, GCP Cloud KMS, or HashiCorp Vault — never in the same database as the encrypted data.

### TLS Configuration (nginx)

```nginx
# Enforce TLS 1.2+ — no SSLv3, TLS 1.0, or TLS 1.1
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
```

## Audit Logging

Every access to PHI must be logged. Required fields:

```python
import json, hashlib, time
from datetime import datetime, timezone

def create_phi_audit_log(
    user_id: str,
    action: str,           # "read" | "write" | "delete" | "export"
    resource_type: str,    # "patient_record" | "lab_result" | "prescription"
    resource_id: str,
    patient_id: str,
    ip_address: str,
    success: bool,
    reason: str = None     # clinical justification
) -> dict:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "patient_id": patient_id,
        "ip_address": ip_address,
        "success": success,
        "reason": reason,
        "log_version": "1.0"
    }
    # Hash for tamper evidence
    entry["hash"] = hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()
    return entry
```

**Retention:** HIPAA requires audit logs be retained for **6 years** from creation or last effective date.

## Access Controls (RBAC + Minimum Necessary)

```python
from enum import Enum
from functools import wraps

class Role(Enum):
    PHYSICIAN = "physician"
    NURSE = "nurse"
    BILLING = "billing"
    ADMIN = "admin"
    PATIENT = "patient"

# Minimum necessary: only grant access to PHI fields needed for role
PHI_ACCESS_MATRIX = {
    Role.PHYSICIAN:  {"diagnosis", "medications", "lab_results", "notes", "demographics"},
    Role.NURSE:      {"medications", "vitals", "allergies", "demographics"},
    Role.BILLING:    {"insurance_id", "diagnosis_codes", "demographics"},
    Role.ADMIN:      {"demographics"},  # no clinical data
    Role.PATIENT:    {"own_records_only"},
}

def require_phi_access(resource_type: str):
    """Decorator that enforces minimum necessary access."""
    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            user_role = Role(request.user.role)
            allowed = PHI_ACCESS_MATRIX.get(user_role, set())
            if resource_type not in allowed and "own_records_only" not in allowed:
                log_unauthorized_access(request.user.id, resource_type)
                raise PermissionError(f"Role {user_role.value} cannot access {resource_type}")
            return func(request, *args, **kwargs)
        return wrapper
    return decorator
```

## Business Associate Agreements (BAA)

A BAA is required before sharing PHI with any vendor. Major cloud provider BAA sources:

| Provider | BAA Location |
|----------|-------------|
| AWS | console.aws.amazon.com → Account → Agreements → Business Associate Addendum |
| Google Cloud | console.cloud.google.com → IAM → Settings → HIPAA BAA |
| Azure | Sign through Microsoft's online process; covered under Azure Healthcare APIs |
| Twilio | Twilio HIPAA Eligible Products list + BAA via sales |

**Services commonly NOT covered by BAA:** Standard S3 buckets (use HealthLake or encrypted S3), Gmail (use Google Workspace HIPAA), Slack free tier.

BAA checklist:
- [ ] Signed BAA before any PHI touches the vendor's systems
- [ ] BAA covers all services used (e.g., AWS RDS, S3, CloudWatch)
- [ ] Retention clause in BAA (6-year minimum)
- [ ] Breach notification clause (vendor must notify you within 60 days)

## Breach Notification (60-Day Rule)

Under the Breach Notification Rule:
- Notify affected individuals **within 60 days** of discovering a breach
- Notify HHS (U.S. Department of Health & Human Services) within 60 days
- If breach affects 500+ individuals in a state, notify prominent media

```python
from datetime import datetime, timedelta

def create_breach_incident(
    discovered_at: datetime,
    affected_count: int,
    phi_types: list,
    description: str
) -> dict:
    deadline = discovered_at + timedelta(days=60)
    return {
        "discovered_at": discovered_at.isoformat(),
        "notification_deadline": deadline.isoformat(),
        "affected_individuals": affected_count,
        "phi_types_exposed": phi_types,
        "description": description,
        "requires_media_notification": affected_count >= 500,
        "status": "open",
        "notifications_sent": []
    }
```

## Compliance Checklist

### Administrative Safeguards
- [ ] Security Officer designated
- [ ] Risk analysis completed (annual)
- [ ] Workforce training completed
- [ ] Sanction policy in place
- [ ] Contingency plan (backup, DR)

### Physical Safeguards
- [ ] Data center access controls
- [ ] Workstation use policy
- [ ] Device encryption (laptops, phones)

### Technical Safeguards
- [ ] Unique user IDs (no shared accounts)
- [ ] Automatic session timeout (≤15 min idle)
- [ ] Encryption at rest (AES-256)
- [ ] Encryption in transit (TLS 1.2+)
- [ ] Audit controls enabled
- [ ] Integrity controls (checksums, hashing)
- [ ] PHI access logs retained 6 years
- [ ] BAA signed with all vendors

## Tools and Resources

- **Microsoft Presidio** — PHI detection and anonymization
- **AWS HealthLake** — HIPAA-eligible FHIR datastore
- **Aptible** — HIPAA-compliant deployment platform
- **Datica** — compliance automation for cloud deployments
- **HHS HIPAA Guidance** — hhs.gov/hipaa/for-professionals
