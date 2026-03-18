---
name: ccpa-compliance
description: >-
  California Consumer Privacy Act (CCPA) / CPRA compliance for businesses handling California
  resident data. Use when serving California users, building privacy features, implementing
  consumer data rights, or responding to data subject requests.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python and Node.js."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: compliance
  tags: ["ccpa", "cpra", "privacy", "california", "compliance", "data-rights"]
  use-cases:
    - "Add a 'Do Not Sell My Personal Information' opt-out flow"
    - "Build a Data Subject Request (DSR) API for CCPA compliance"
    - "Implement GPC signal detection to auto-honor opt-out"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# CCPA / CPRA Compliance

## Overview

The California Consumer Privacy Act (CCPA), amended by CPRA (California Privacy Rights Act effective January 1, 2023), gives California residents rights over their personal information. Applies to for-profit businesses that:
- Have ≥$25M annual gross revenue, OR
- Buy/sell/share personal info of ≥100,000 CA consumers/households, OR
- Derive ≥50% of annual revenue from selling personal info

Fines: up to $2,500 per unintentional violation, $7,500 per intentional violation. California AG and individual consumers can sue.

## Consumer Rights Under CCPA/CPRA

| Right | Description | Response Deadline |
|-------|-------------|------------------|
| **Right to Know** | What personal info is collected, used, shared, sold | 45 days (+ 45-day extension) |
| **Right to Delete** | Request deletion of personal info | 45 days |
| **Right to Opt-Out** | Opt out of sale or sharing of personal info | Immediate effect |
| **Right to Correct** | Correct inaccurate personal info (CPRA) | 45 days |
| **Right to Limit** | Limit use of sensitive personal info (CPRA) | Immediate effect |
| **Right to Non-Discrimination** | Cannot be denied service for exercising rights | N/A — always |
| **Right to Data Portability** | Receive data in portable format | 45 days |

## Sensitive Personal Information (CPRA)

CPRA adds extra protections for sensitive PI:
- SSN, driver's license, passport number
- Financial account credentials
- Precise geolocation (within 1,852 meters)
- Racial or ethnic origin
- Religious or philosophical beliefs
- Union membership
- Contents of mail, email, text messages
- Genetic data
- Biometric data used for identification
- Health information
- Sexual orientation or sex life

## Data Inventory and Mapping

Before building DSR workflows, map your data:

```python
# data_inventory.py — document what personal data you collect

DATA_INVENTORY = {
    "users": {
        "table": "users",
        "fields": {
            "email": {"category": "contact", "sensitive": False, "sold": False},
            "name": {"category": "identifier", "sensitive": False, "sold": False},
            "ip_address": {"category": "usage", "sensitive": False, "sold": False},
            "location": {"category": "location", "sensitive": True, "sold": False},
            "phone": {"category": "contact", "sensitive": False, "sold": False},
        },
        "retention_days": 365 * 3,  # 3 years
        "third_parties": ["Stripe", "SendGrid", "Mixpanel"],
    },
    "analytics_events": {
        "table": "events",
        "fields": {
            "user_id": {"category": "identifier", "sensitive": False, "sold": False},
            "event_name": {"category": "behavior", "sensitive": False, "sold": False},
            "device_id": {"category": "identifier", "sensitive": False, "sold": True},
        },
        "retention_days": 365,
        "third_parties": ["Mixpanel", "Segment"],
    }
}
```

## Privacy Notice Requirements

Your privacy policy must disclose:
- Categories of personal information collected
- Purposes for collection
- Whether you sell or share personal information
- Categories of third parties data is disclosed to
- Consumer rights and how to exercise them
- Contact info for privacy requests

```javascript
// Required sections in privacy policy
const REQUIRED_DISCLOSURES = {
  collected_categories: [
    "Identifiers (name, email, IP address)",
    "Commercial information (purchase history)",
    "Internet or other network activity (browsing history)",
    "Geolocation data",
    "Inferences drawn from above"
  ],
  collection_purposes: [
    "Provide and improve our services",
    "Send transactional and marketing emails",
    "Analytics and product development"
  ],
  sells_data: false,        // Required disclosure
  shares_data: true,        // Sharing = cross-context behavioral advertising
  shared_with: ["Google Analytics", "Facebook Pixel", "Mixpanel"],
  rights_contact: "privacy@yourcompany.com",
  opt_out_url: "https://yourcompany.com/privacy/opt-out"
};
```

## GPC (Global Privacy Control) Signal Detection

GPC is a browser signal that automatically invokes the right to opt-out of sale/sharing. California law (CPRA) requires businesses to honor it as of 2023.

```javascript
// Express.js middleware — detect GPC signal and honor opt-out
const gpcMiddleware = (req, res, next) => {
  const gpcEnabled = req.headers['sec-gpc'] === '1';
  
  if (gpcEnabled) {
    // Auto-apply opt-out for this request
    req.privacyConsent = {
      optedOutOfSale: true,
      optedOutOfSharing: true,
      source: 'gpc_signal',
      detectedAt: new Date().toISOString()
    };
    
    // Record opt-out preference
    if (req.user) {
      recordOptOut(req.user.id, 'gpc_signal');
    } else {
      // Use cookie to persist for anonymous users
      res.cookie('ccpa_optout', '1', { 
        maxAge: 365 * 24 * 60 * 60 * 1000,  // 1 year
        httpOnly: true, 
        secure: true, 
        sameSite: 'Strict'
      });
    }
  }
  
  next();
};
```

## Data Subject Request (DSR) API

```python
# FastAPI DSR endpoints
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
from enum import Enum
import uuid
from datetime import datetime

app = FastAPI()

class DSRType(str, Enum):
    KNOW = "know"
    DELETE = "delete"
    CORRECT = "correct"
    OPT_OUT = "opt_out"
    LIMIT_SPI = "limit_sensitive"
    PORTABILITY = "portability"

class DSRRequest(BaseModel):
    request_type: DSRType
    email: EmailStr
    name: str
    correction_details: str = None  # For CORRECT requests

class DSRResponse(BaseModel):
    request_id: str
    status: str
    deadline: str
    message: str

@app.post("/api/privacy/dsr", response_model=DSRResponse)
async def submit_dsr(request: DSRRequest, background_tasks: BackgroundTasks):
    """Submit a Data Subject Request."""
    request_id = str(uuid.uuid4())
    deadline_days = 1 if request.request_type == DSRType.OPT_OUT else 45
    
    # Store request
    dsr_record = {
        "id": request_id,
        "type": request.request_type,
        "email": request.email,
        "name": request.name,
        "status": "pending",
        "submitted_at": datetime.utcnow().isoformat(),
        "deadline_days": deadline_days,
        "verified": False
    }
    await db.dsr_requests.insert(dsr_record)
    
    # Send verification email
    background_tasks.add_task(send_verification_email, request.email, request_id)
    
    return DSRResponse(
        request_id=request_id,
        status="pending_verification",
        deadline=f"{deadline_days} days after identity verification",
        message="We've sent a verification email. Please verify your identity to proceed."
    )

@app.post("/api/privacy/dsr/{request_id}/verify")
async def verify_dsr(request_id: str, token: str, background_tasks: BackgroundTasks):
    """Verify identity and begin DSR processing."""
    dsr = await db.dsr_requests.find_one({"id": request_id, "token": token})
    if not dsr:
        raise HTTPException(status_code=404, detail="Request not found")
    
    await db.dsr_requests.update({"id": request_id}, {"verified": True, "verified_at": datetime.utcnow().isoformat()})
    background_tasks.add_task(process_dsr, request_id, dsr["type"], dsr["email"])
    
    return {"status": "processing", "message": "Identity verified. Processing your request."}

async def process_dsr(request_id: str, dsr_type: DSRType, email: str):
    """Process DSR by type."""
    user = await db.users.find_one({"email": email})
    if not user:
        await complete_dsr(request_id, "no_data_found")
        return
    
    if dsr_type == DSRType.DELETE:
        await delete_user_data(user["id"])
    elif dsr_type == DSRType.KNOW:
        data_export = await export_user_data(user["id"])
        await send_data_export(email, data_export)
    elif dsr_type == DSRType.OPT_OUT:
        await opt_out_user(user["id"])
    elif dsr_type == DSRType.PORTABILITY:
        portable_data = await export_portable_data(user["id"])
        await send_data_export(email, portable_data, format="json")
    
    await complete_dsr(request_id, "completed")
```

## Data Export Pipeline (Right to Know / Portability)

```python
async def export_user_data(user_id: str) -> dict:
    """Export all personal data for a user — CCPA Right to Know."""
    user = await db.users.find_one({"id": user_id})
    orders = await db.orders.find({"user_id": user_id})
    events = await db.analytics_events.find({"user_id": user_id})
    
    return {
        "export_date": datetime.utcnow().isoformat(),
        "profile": {
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone"),
            "created_at": user["created_at"]
        },
        "purchase_history": [
            {"order_id": o["id"], "date": o["date"], "amount": o["amount"]}
            for o in orders
        ],
        "analytics_events": [
            {"event": e["name"], "date": e["timestamp"]}
            for e in events
        ],
        "third_party_sharing": [
            {"vendor": "Stripe", "data": "Payment processing"},
            {"vendor": "SendGrid", "data": "Email delivery"},
        ]
    }
```

## Opt-Out of Sale/Sharing

```javascript
// Track and honor opt-out preference
async function recordOptOut(userId, source) {
  await db.privacyPreferences.upsert({
    userId,
    optedOutOfSale: true,
    optedOutOfSharing: true,
    source,  // 'user_request' | 'gpc_signal' | 'cookie_banner'
    timestamp: new Date().toISOString()
  });
  
  // Propagate opt-out to third parties
  await Promise.all([
    mixpanel.optOut(userId),
    segment.suppress(userId),
    // Don't forget to stop sharing with ad networks
  ]);
}
```

## Compliance Checklist

- [ ] Privacy policy updated with all required CCPA/CPRA disclosures
- [ ] "Do Not Sell or Share My Personal Information" link in footer
- [ ] DSR submission form available (web + toll-free phone option)
- [ ] Identity verification before processing DSRs
- [ ] DSR response within 45 days (document timeline)
- [ ] GPC signal detection implemented and honored
- [ ] Data inventory and mapping completed
- [ ] Sensitive personal information identified and limited
- [ ] Third-party contracts updated with data sharing restrictions
- [ ] Opt-out preference stored and honored across systems
- [ ] Annual privacy policy review scheduled
- [ ] Training for staff who handle privacy requests
