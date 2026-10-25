---
name: hipaa-compliance
description: >-
  HIPAA compliance for software that handles protected health information (PHI): which data counts as PHI, what the Security Rule requires of encryption, access control, audit controls and logoff, how business associate agreements work, and the Breach Notification Rule deadlines. Use when someone asks to "make this app HIPAA compliant", "encrypt PHI", "add audit logging for patient records", "check what a BAA needs", or "prepare for a hospital security review". Not legal advice.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python 3 (cryptography package)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "hipaa, healthcare, compliance, phi, encryption"
---

# HIPAA Compliance

## Overview

HIPAA's rules are in 45 CFR Parts 160 and 164. The Security Rule (45 CFR 164.302-318) applies to covered entities (providers, health plans, clearinghouses) and to business associates (vendors that create, receive, maintain or transmit PHI for them). Rule text was read from eCFR, current to 2026-10-22; HHS web pages were not reachable for this check, so everything below comes from the regulation itself.

Key points that are often misstated:

- The Security Rule is flexible. Standards are mandatory; many implementation specifications are "addressable", meaning you must implement them or document why an equivalent measure is reasonable (164.306(d)). Encryption at rest and in transit and automatic logoff are addressable, not mandatory, in the rule text as of this date. Unique user IDs, emergency access, audit controls and risk analysis are required.
- The rule names no cipher, key length, TLS version or idle-timeout number. AES-256 and TLS 1.2+ are good practice and the usual way to treat PHI as "secured", not a regulatory number.
- Civil money penalties depend on culpability tier (did not know; reasonable cause; willful neglect corrected within 30 days; willful neglect not corrected) in 45 CFR 160.404. The dollar amounts are inflation-adjusted every year in 45 CFR 102.3; look them up there rather than quoting a fixed range.

## Instructions

### 1. Identify PHI

PHI is individually identifiable health information held by a covered entity or business associate. De-identification by the Safe Harbor method (164.514(b)(2)) means removing all 18 identifier types for the individual and relatives, employers and household members, and having no actual knowledge the rest could identify the person:

1. Names
2. Geographic subdivisions smaller than a state (street, city, county, ZIP; the first three ZIP digits are allowed only where that area holds more than 20,000 people)
3. All elements of dates except year directly related to the person (birth, admission, discharge, death), and all ages over 89
4. Telephone numbers
5. Fax numbers
6. Email addresses
7. Social security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers and serial numbers, including license plates
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers, including finger and voice prints
17. Full-face photographs and comparable images
18. Any other unique identifying number, characteristic or code

An automatic detector (regex or NER) can help find candidates in logs and free text, but it cannot prove data is de-identified. Treat its output as a review aid.

### 2. Encrypt PHI

Encryption is addressable (164.312(a)(2)(iv) at rest, 164.312(e)(2)(ii) in transit), and PHI encrypted per the Secretary's guidance counts as not "unsecured" for breach purposes (164.402), which usually removes the notification duty if the key was not exposed. In practice, encrypt both.

```python
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt_field(plaintext: str, key: bytes, context: bytes) -> dict:
    nonce = os.urandom(12)  # unique per encryption, 96 bits for GCM
    ct = AESGCM(key).encrypt(nonce, plaintext.encode(), context)
    return {"nonce": base64.b64encode(nonce).decode(), "ciphertext": base64.b64encode(ct).decode()}

def decrypt_field(blob: dict, key: bytes, context: bytes) -> str:
    return AESGCM(key).decrypt(
        base64.b64decode(blob["nonce"]), base64.b64decode(blob["ciphertext"]), context
    ).decode()

key = AESGCM.generate_key(bit_length=256)  # in production: fetched from a KMS, never stored with the data
blob = encrypt_field("Hypertension, stage 2", key, b"patient:48213:diagnosis")
print(decrypt_field(blob, key, b"patient:48213:diagnosis"))   # Hypertension, stage 2
# decrypt_field(blob, key, b"patient:99999:diagnosis") raises InvalidTag: the context binds the field to its record
```

Keep keys in a managed KMS or vault (AWS KMS, Google Cloud KMS, HashiCorp Vault), separate from the database that holds the ciphertext. For data in transit, terminate TLS 1.2 or newer (disable SSLv3, TLS 1.0 and 1.1), and use disk or database encryption from your cloud provider for the storage layer.

### 3. Audit controls and access control

164.312(b) requires mechanisms that record and examine activity in systems with ePHI; 164.308(a)(1)(ii)(D) requires regular review of those records. Log who did what to which patient record, never the PHI itself.

```python
import hashlib, json
from datetime import datetime, timezone

def audit_entry(prev_hash: str, user_id: str, action: str, patient_id: str,
                resource: str, ip: str, success: bool) -> dict:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id, "action": action, "patient_id": patient_id,
        "resource": resource, "ip_address": ip, "success": success,
        "prev_hash": prev_hash,  # chains entries so deletion or edits are detectable
    }
    entry["hash"] = hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()
    return entry

e1 = audit_entry("0" * 64, "dr-chen", "read", "48213", "lab_result/771", "10.4.2.17", True)
e2 = audit_entry(e1["hash"], "nurse-ortiz", "export", "48213", "lab_result/771", "10.4.2.18", True)
```

Retention: 164.316(b)(2) requires keeping security policies and required documentation for 6 years from creation or last effective date, whichever is later. The rule does not set a separate retention period for raw system logs; many organizations apply 6 years to audit records too, which is a policy choice. Write the log to append-only storage that application users cannot modify.

Access control (164.312(a), 164.308(a)(4)): give each person a unique ID (required, no shared accounts), grant access by role, and apply the minimum necessary standard (164.502(b), 164.514(d)) to uses and disclosures other than treatment. Check the role on the server for each request and log denials. Implement an automatic logoff after a period you set and document (addressable; the rule gives no number).

### 4. Business associate agreements

Before a vendor creates, receives, maintains or transmits PHI for you, you need a written business associate agreement (164.308(b), 164.502(e), 164.504(e), 164.314(a)). Under 164.314(a)(2) the BA contract must make the BA comply with the Security Rule, bind its subcontractors to the same requirements, and report any security incident, including breaches of unsecured PHI. Checklist:

- [ ] Signed before any PHI reaches the vendor, covering every service you use (storage, database, logging, email, support tools)
- [ ] Subcontractor flow-down and incident/breach reporting terms are present, with a reporting time shorter than your own 60-day clock
- [ ] Return or destruction of PHI at termination
- [ ] Vendor's own list of covered services checked: a BAA covers only the services the vendor names, so confirm each service you use is in scope with the vendor's current documentation
- [ ] No PHI in tools that are not covered (analytics, error trackers, chat, email marketing)

### 5. Breach notification (45 CFR 164.400-414)

A breach of unsecured PHI must be reported. The clock starts on the first day the breach is known, or would have been known with reasonable diligence, to the entity or to any workforce member or agent other than the person who committed the breach (164.404(a)(2); a business associate's clock is the same under 164.410(a)(2)).

| Who | Deadline | Rule |
|---|---|---|
| Affected individuals | without unreasonable delay, no later than 60 calendar days after discovery | 164.404 |
| HHS Secretary, 500 or more individuals | at the same time as the individual notice | 164.408(b) |
| HHS Secretary, fewer than 500 | within 60 days after the end of the calendar year of discovery | 164.408(c) |
| Prominent media, more than 500 residents of one state or jurisdiction | without unreasonable delay, no later than 60 days | 164.406 |
| Covered entity, from a business associate | without unreasonable delay, no later than 60 days (your BAA may require less) | 164.410 |

```python
from datetime import datetime, timedelta

def breach_deadlines(discovered: datetime, affected: int, per_state: dict[str, int]) -> dict:
    individuals = discovered + timedelta(days=60)
    year_end_plus_60 = datetime(discovered.year + 1, 1, 1) + timedelta(days=59)
    return {
        "individuals_by": individuals,
        "hhs_by": individuals if affected >= 500 else year_end_plus_60,
        "media_required": any(n > 500 for n in per_state.values()),
    }

print(breach_deadlines(datetime(2026, 10, 1), 1200, {"TX": 800, "OK": 400}))
# individuals_by 2026-11-30, hhs_by 2026-11-30, media_required True
```

The notice must be plain language and include what happened, the types of information, steps individuals should take, what you are doing, and contact procedures including a toll-free number, email, website or postal address (164.404(c)). Law-enforcement delay is possible under 164.412.

## Examples

### Example 1: "We're a lab-results SaaS and a hospital asked for our HIPAA posture"

Produce a table mapping each Security Rule standard to the control you have: risk analysis (164.308(a)(1)(ii)(A), required, accurate and thorough, with dated documentation), unique IDs (164.312(a)(2)(i)), audit controls (164.312(b)), integrity (164.312(c)), person authentication (164.312(d)), transmission security (164.312(e)), and the BAA you will sign with the hospital plus your subcontractor BAAs. For addressable items you did not implement, write the documented reason.

### Example 2: "A support engineer exported 1,200 patient records to a personal drive on October 1"

Assuming the incident is a breach of unsecured PHI after your risk assessment, and that you are the covered entity, run `breach_deadlines(datetime(2026, 10, 1), 1200, {"TX": 800, "OK": 400})`. Individuals and HHS are due by 2026-11-30, and Texas media must be notified because more than 500 residents of that state are involved; Oklahoma is under the threshold. Preserve the audit entries for the export and notify your counsel. If you are instead a business associate (the SaaS in Example 1), your duty is to notify each affected covered entity under 164.410, within 60 days of discovery and sooner if the BAA says so; the covered entity then notifies individuals, HHS and media.

## Guidelines

- Do a documented risk analysis and risk management plan; both are required (164.308(a)(1)(ii)(A)-(B)). The rule says "accurate and thorough" but does not fix an annual cycle; review whenever systems or risks change.
- Policies, procedures and required records are kept 6 years (164.316(b)(2), 164.530(j)).
- Never put PHI in URLs, logs, error messages, analytics events or test data. Use synthetic patients in development.
- Required workforce items include a sanction policy (164.308(a)(1)(ii)(C)), a security official (164.308(a)(2)) and contingency planning with data backup and disaster recovery (164.308(a)(7)).
- State laws can be stricter than HIPAA, and 42 CFR Part 2 covers substance-use treatment records. This skill covers HIPAA only and is not legal advice.
- Rules can change: check eCFR for 45 CFR Part 164 before relying on an "addressable" label.
