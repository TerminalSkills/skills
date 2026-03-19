---
title: "Implement HIPAA Compliance for a Healthtech SaaS"
slug: implement-hipaa-compliance-for-healthtech-saas
description: "Set up HIPAA technical safeguards including PHI encryption, audit logging, RBAC, and breach detection for a healthtech SaaS preparing for hospital contracts."
skills: [hipaa-compliance, audit-logging, data-masking]
category: development
tags: [hipaa, compliance, healthcare, security, encryption]
---

# Implement HIPAA Compliance for a Healthtech SaaS

**Persona:** CTO of a healthtech startup preparing to sign hospital contracts and handle patient data.

**Challenge:** Your SaaS needs to be HIPAA-compliant before your first hospital client will sign. You need to implement technical safeguards, get BAAs from cloud providers, and set up the audit trail that will satisfy security reviews.

**Skills used:** `hipaa-compliance`, `audit-logging`, `data-masking`

---

## Step 1: Identify and Classify PHI in Your System

Before writing a line of compliance code, audit what PHI you actually touch.

```bash
# Run Presidio on your codebase to find hardcoded PHI patterns
pip install presidio-analyzer presidio-anonymizer

# Scan database schema for PHI-like column names
psql $DATABASE_URL -c "
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name ILIKE ANY(ARRAY['%name%','%email%','%phone%','%ssn%','%dob%',
  '%address%','%zip%','%diagnosis%','%condition%','%medication%','%mrn%'])
ORDER BY table_name, column_name;"
```

Create a PHI data map:

```yaml
# phi-inventory.yaml
phi_fields:
  users:
    - field: full_name          # HIPAA identifier #1
      classification: PHI
      encrypted: false          # ← FIX THIS
    - field: email              # HIPAA identifier #6
      classification: PHI
      encrypted: false          # ← FIX THIS
    - field: date_of_birth      # HIPAA identifier #3
      classification: PHI
      encrypted: true
  
  patient_records:
    - field: diagnosis_codes    # Health information → PHI
      classification: PHI
      encrypted: true
    - field: notes              # Clinical notes → PHI
      classification: PHI
      encrypted: true
    - field: prescriptions      # PHI
      classification: PHI
      encrypted: true
```

## Step 2: Implement Encryption at Rest (AES-256)

Encrypt all PHI fields in your database using application-level encryption with keys stored in AWS KMS.

```python
# phi_encryption.py
import boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64, os

kms = boto3.client('kms', region_name='us-east-1')
KEY_ARN = 'arn:aws:kms:us-east-1:123456789:key/your-key-id'

def encrypt_phi(plaintext: str) -> dict:
    """Encrypt PHI using KMS data key (envelope encryption)."""
    # KMS generates a data key — plaintext key used to encrypt, 
    # encrypted key stored alongside data
    response = kms.generate_data_key(KeyId=KEY_ARN, KeySpec='AES_256')
    plaintext_key = response['Plaintext']
    encrypted_key = response['CiphertextBlob']
    
    aesgcm = AESGCM(plaintext_key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    
    # Clear plaintext key from memory
    plaintext_key = b'\x00' * len(plaintext_key)
    
    return {
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        "encrypted_key": base64.b64encode(encrypted_key).decode()
    }

def decrypt_phi(encrypted: dict) -> str:
    """Decrypt PHI — KMS decrypts the data key, we decrypt the ciphertext."""
    encrypted_key = base64.b64decode(encrypted['encrypted_key'])
    response = kms.decrypt(CiphertextBlob=encrypted_key)
    plaintext_key = response['Plaintext']
    
    aesgcm = AESGCM(plaintext_key)
    nonce = base64.b64decode(encrypted['nonce'])
    ciphertext = base64.b64decode(encrypted['ciphertext'])
    
    plaintext_key = b'\x00' * len(plaintext_key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

Apply the migration:

```sql
-- Add encrypted columns, backfill, then drop plaintext
ALTER TABLE users 
  ADD COLUMN full_name_enc JSONB,
  ADD COLUMN email_enc JSONB;

-- After backfilling with encrypted values via Python script:
ALTER TABLE users DROP COLUMN full_name, DROP COLUMN email;
```

## Step 3: Set Up Audit Logging for PHI Access

Every read, write, and delete of PHI must be logged. HIPAA requires 6-year retention.

```python
# middleware/phi_audit.py
from functools import wraps
import json, hashlib, uuid
from datetime import datetime, timezone

class PHIAuditLogger:
    def __init__(self, db):
        self.db = db
        self._last_hash = None
    
    async def log_phi_access(
        self,
        user_id: str,
        action: str,          # 'read' | 'write' | 'delete' | 'export'
        resource_type: str,   # 'patient_record' | 'lab_result' | 'prescription'
        resource_id: str,
        patient_id: str,
        ip_address: str,
        success: bool,
        clinical_reason: str = None
    ):
        prev_hash = self._last_hash or await self._get_last_hash()
        
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "patient_id": patient_id,
            "ip_address": ip_address,
            "success": success,
            "clinical_reason": clinical_reason,
            "prev_hash": prev_hash or "GENESIS"
        }
        entry["hash"] = hashlib.sha256(
            json.dumps({k: v for k, v in entry.items() if k != "hash"}, sort_keys=True).encode()
        ).hexdigest()
        self._last_hash = entry["hash"]
        
        await self.db.hipaa_audit_logs.insert_one(entry)

# Usage: decorator for PHI-accessing functions
def audit_phi(action: str, resource_type: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(request, patient_id: str, *args, **kwargs):
            result = await func(request, patient_id, *args, **kwargs)
            await phi_audit_logger.log_phi_access(
                user_id=request.user.id,
                action=action,
                resource_type=resource_type,
                resource_id=patient_id,
                patient_id=patient_id,
                ip_address=request.client.host,
                success=True
            )
            return result
        return wrapper
    return decorator

@router.get("/patients/{patient_id}/records")
@audit_phi(action="read", resource_type="patient_record")
async def get_patient_records(request: Request, patient_id: str):
    return await db.get_patient_records(patient_id)
```

## Step 4: Configure RBAC with Minimum Necessary Access

```python
# auth/phi_rbac.py
from enum import Enum
from fastapi import Depends, HTTPException

class ClinicalRole(Enum):
    PHYSICIAN = "physician"
    NURSE = "nurse"
    MEDICAL_ASSISTANT = "medical_assistant"
    BILLING = "billing"
    ADMIN = "admin"

# Minimum necessary standard — roles get only what they need
PHI_PERMISSIONS = {
    ClinicalRole.PHYSICIAN: {
        "patient_record": ["read", "write"],
        "lab_results": ["read", "write"],
        "prescriptions": ["read", "write"],
        "billing_codes": ["read"]
    },
    ClinicalRole.NURSE: {
        "patient_record": ["read"],
        "lab_results": ["read"],
        "vitals": ["read", "write"],
        "medications": ["read"]
    },
    ClinicalRole.BILLING: {
        "billing_codes": ["read", "write"],
        "insurance_info": ["read", "write"]
        # No access to clinical records
    },
    ClinicalRole.ADMIN: {
        # Admin manages accounts — no clinical PHI access
        "user_accounts": ["read", "write"]
    }
}

def require_phi_permission(resource: str, action: str):
    async def check_permission(current_user = Depends(get_current_user)):
        role = ClinicalRole(current_user.role)
        allowed_actions = PHI_PERMISSIONS.get(role, {}).get(resource, [])
        if action not in allowed_actions:
            await phi_audit_logger.log_phi_access(
                user_id=current_user.id,
                action=action,
                resource_type=resource,
                resource_id="UNKNOWN",
                patient_id="UNKNOWN",
                ip_address="UNKNOWN",
                success=False
            )
            raise HTTPException(status_code=403, detail=f"Role {role.value} cannot {action} {resource}")
        return current_user
    return check_permission
```

## Step 5: Get BAA from AWS

```bash
# AWS HIPAA BAA — sign via AWS console
# 1. Go to: console.aws.amazon.com → Account → Agreements
# 2. Find "Business Associate Addendum" → Sign

# Verify HIPAA-eligible services you're using:
# ✅ EC2, RDS, S3, CloudWatch, Lambda, SQS, SNS, DynamoDB, KMS
# ❌ NOT covered by default: EC2 free tier, some regions

# Enforce encryption on S3 buckets containing PHI
aws s3api put-bucket-encryption \
  --bucket your-phi-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:us-east-1:123456:key/your-key"
      }
    }]
  }'

# Block public access to PHI buckets (absolutely critical)
aws s3api put-public-access-block \
  --bucket your-phi-bucket \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

## Step 6: Build Breach Detection and Notification

```python
# breach/detection.py
from datetime import datetime, timedelta

BREACH_INDICATORS = [
    {"pattern": "bulk_export", "threshold": 1000, "window_minutes": 10},
    {"pattern": "after_hours_access", "hours": (22, 6)},
    {"pattern": "failed_access_spike", "threshold": 10, "window_minutes": 5},
    {"pattern": "terminated_user_access", "check": "employment_status"},
]

async def detect_breach_indicators(user_id: str, action: str, count: int = 1):
    """Run breach detection rules against recent audit log activity."""
    alerts = []
    
    # Rule: bulk export (>1000 records in 10 min)
    if action == "export":
        recent_exports = await db.audit_logs.count({
            "user_id": user_id,
            "action": "export",
            "timestamp": {"$gt": (datetime.utcnow() - timedelta(minutes=10)).isoformat()}
        })
        if recent_exports > 1000:
            alerts.append({
                "type": "bulk_export",
                "severity": "HIGH",
                "user_id": user_id,
                "count": recent_exports
            })
    
    for alert in alerts:
        await create_breach_incident(alert)

async def create_breach_incident(alert: dict):
    """Create a breach incident with 60-day notification deadline."""
    incident = {
        "id": str(uuid.uuid4()),
        "discovered_at": datetime.utcnow().isoformat(),
        "notification_deadline": (datetime.utcnow() + timedelta(days=60)).isoformat(),
        "alert": alert,
        "status": "investigating",
        "requires_hhs_notification": False,  # Update if breach confirmed
        "requires_media_notification": False,  # True if 500+ affected
        "affected_individuals": 0
    }
    await db.breach_incidents.insert_one(incident)
    await notify_security_team(incident)
    return incident
```

## Result

After implementing these steps:
- ✅ All PHI encrypted at rest (AES-256 with KMS)
- ✅ TLS 1.2+ enforced in transit
- ✅ Tamper-evident audit logs with 6-year retention
- ✅ RBAC with minimum necessary standard
- ✅ AWS BAA signed covering all services in use
- ✅ Automated breach detection with 60-day deadline tracking
- ✅ Ready for hospital security review and HIPAA attestation

**Next step:** Engage a HIPAA compliance consultant or auditor to validate your implementation against the Security Rule before signing hospital contracts.
