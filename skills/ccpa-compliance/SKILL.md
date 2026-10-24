---
name: ccpa-compliance
description: >-
  Builds California Consumer Privacy Act (CCPA, as amended by CPRA) compliance features: consumer request handling, opt-out of sale/sharing, Global Privacy Control detection and privacy-notice content. Use when serving California users, building privacy features, implementing
  consumer data rights, or responding to data subject requests.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python and Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["ccpa", "cpra", "privacy", "data-rights", "compliance"]
  use-cases:
    - "Add a 'Do Not Sell My Personal Information' opt-out flow"
    - "Build a Data Subject Request (DSR) API for CCPA compliance"
    - "Implement GPC signal detection to auto-honor opt-out"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# CCPA / CPRA Compliance

## Overview

The California Consumer Privacy Act (CCPA), amended by CPRA (California Privacy Rights Act effective January 1, 2023), gives California residents rights over their personal information. Applies to for-profit businesses that do business in California and:
- Have annual gross revenue above the inflation-adjusted threshold ($26,625,000 since 2025-01-01; the statute says $25M and is re-indexed in odd-numbered years), OR
- Buy, sell or share personal info of 100,000+ California consumers/households, OR
- Derive 50%+ of annual revenue from selling or sharing personal info

Administrative fines (California Privacy Protection Agency or Attorney General): up to $2,663 per violation, $7,988 for intentional violations or those involving minors under 16 (2025 adjustment of $2,500 / $7,500). Consumers cannot sue for ordinary violations; the private right of action covers data breaches only ($107 to $799 per consumer per incident since 2025). Source: cppa.ca.gov/regulations/cpi_adjustment.html. The regulations in force from 2026-01-01 also add risk assessments, cybersecurity audits and automated decision-making technology (ADMT) rules with their own start dates; this skill covers the consumer-request and opt-out core only. This is engineering guidance, not legal advice.

## Instructions

### Consumer Rights Under CCPA/CPRA

| Right | Description | Response Deadline |
|-------|-------------|------------------|
| **Right to Know / Access** (incl. portable copy) | What personal info is collected, used, shared, sold | Confirm receipt in 10 business days; answer in 45 days (+45-day extension with notice) |
| **Right to Delete** | Request deletion of personal info | Same: 10 business days / 45 days |
| **Right to Correct** | Correct inaccurate personal info (CPRA) | Same: 10 business days / 45 days |
| **Right to Opt-Out** | Opt out of sale or sharing of personal info | As soon as feasible, at most 15 business days; no verification may be required |
| **Right to Limit** | Limit use of sensitive personal info (CPRA) | At most 15 business days |
| **Right to Non-Discrimination** | Cannot be denied service for exercising rights | Always |

Source: CPPA regulations, sections 7021 and 7026 (cppa.ca.gov/regulations).

### Sensitive Personal Information (CPRA)

CPRA adds extra protections for sensitive PI:
- SSN, driver's license, passport number
- Financial account credentials
- Precise geolocation (within a radius of 1,850 feet)
- Racial or ethnic origin
- Religious or philosophical beliefs
- Union membership
- Contents of mail, email, text messages
- Genetic data
- Neural data (added by SB 1223, in force since 2025)
- Biometric data used for identification
- Health information
- Sexual orientation or sex life

### Data Inventory and Mapping

Before building request workflows, map your data:

```python
# data_inventory.py — what personal data you collect, where, and who receives it
DATA_INVENTORY = {
    "users.email": {"category": "contact", "sensitive": False, "shared_with": ["SendGrid"]},
    "users.location": {"category": "location", "sensitive": True, "shared_with": []},
    "events.device_id": {"category": "identifier", "sensitive": False, "shared_with": ["Mixpanel"]},
}
```

### Privacy Notice Requirements

Your privacy policy must disclose:
- Categories of personal information collected
- Purposes for collection
- Whether you sell or share personal information
- Categories of third parties data is disclosed to
- Consumer rights and how to exercise them
- Contact info for privacy requests

Also state whether you sold or shared personal information in the preceding 12 months, link to the opt-out page, and give a contact for privacy requests (for example privacy@shopline.dev).

### GPC (Global Privacy Control) Signal Detection

GPC is a browser signal (HTTP header `Sec-GPC: 1`, and `navigator.globalPrivacyControl` in JavaScript) that the regulations treat as a valid opt-out of sale/sharing request (section 7025); businesses must honor it. Apply it to the browser or device that sent it, and to the account too if the user is logged in. It does not cover the right to limit sensitive data use.

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
        sameSite: 'Lax'
      });
    }
  }

  next();
};
```

### Data Subject Request (DSR) API

```python
# FastAPI DSR endpoints
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
from enum import Enum
import uuid
from datetime import datetime, timezone

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
    correction_details: str | None = None  # For CORRECT requests

class DSRResponse(BaseModel):
    request_id: str
    status: str
    deadline: str
    message: str

@app.post("/api/privacy/dsr", response_model=DSRResponse)
async def submit_dsr(request: DSRRequest, background_tasks: BackgroundTasks):
    """Submit a Data Subject Request."""
    request_id = str(uuid.uuid4())
    deadline_days = 15 if request.request_type in (DSRType.OPT_OUT, DSRType.LIMIT_SPI) else 45  # 15 business days vs 45 calendar days
  
    # Store request
    dsr_record = {
        "id": request_id,
        "type": request.request_type,
        "email": request.email,
        "name": request.name,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "deadline_days": deadline_days,
        "verified": False
    }
    await db.dsr_requests.insert(dsr_record)
  
    # Opt-out and limit requests must NOT require verification: process them now.
    if request.request_type in (DSRType.OPT_OUT, DSRType.LIMIT_SPI):
        background_tasks.add_task(process_dsr, request_id, request.request_type, request.email)
        return DSRResponse(request_id=request_id, status="processing",
                           deadline="15 business days at most",
                           message="Your request is being applied.")

    # Others: confirm receipt within 10 business days and verify identity.
    # send_verification_email must create and store a one-time token on the record.
    background_tasks.add_task(send_verification_email, request.email, request_id)
    return DSRResponse(
        request_id=request_id,
        status="pending_verification",
        deadline="45 days from receipt (verification time counts)",
        message="We've sent a verification email. Please verify your identity to proceed."
    )

@app.post("/api/privacy/dsr/{request_id}/verify")
async def verify_dsr(request_id: str, token: str, background_tasks: BackgroundTasks):
    """Verify identity and begin DSR processing."""
    dsr = await db.dsr_requests.find_one({"id": request_id, "token": token})
    if not dsr:
        raise HTTPException(status_code=404, detail="Request not found")
  
    await db.dsr_requests.update({"id": request_id}, {"verified": True, "verified_at": datetime.now(timezone.utc).isoformat()})
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
    elif dsr_type in (DSRType.OPT_OUT, DSRType.LIMIT_SPI):
        await opt_out_user(user["id"])  # LIMIT_SPI also needs its own flag for sensitive data
    elif dsr_type == DSRType.CORRECT:
        await queue_correction_review(request_id, user["id"])  # applies correction_details after review
        return  # not complete until the correction is applied
    elif dsr_type == DSRType.PORTABILITY:
        portable_data = await export_portable_data(user["id"])
        await send_data_export(email, portable_data, format="json")
  
    await complete_dsr(request_id, "completed")
```

### Data Export Pipeline (Right to Know / Portability)

Return the categories and specific pieces of personal information (covering at least the preceding 12 months), plus the sources, purposes and third parties, in a portable machine-readable format such as JSON. Build it from the data inventory so every table that holds the user's data is covered:

```python
async def export_user_data(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id})
    orders = await db.orders.find({"user_id": user_id})
    return {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "profile": {"name": user["name"], "email": user["email"], "created_at": user["created_at"]},
        "purchase_history": [{"order_id": o["id"], "date": o["date"], "amount": o["amount"]} for o in orders],
        "third_party_sharing": [{"vendor": "Stripe", "purpose": "Payment processing"}],
    }
```

### Opt-Out of Sale/Sharing

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

  // Propagate to every vendor that receives data for advertising or analytics.
  // Use each vendor's own suppression/opt-out API and also stop loading their tags
  // for this visitor; check the vendor docs, the calls differ per product.
  await stopSharingWithVendors(userId);
}
```

### Compliance Checklist

- [ ] Privacy policy updated with all required CCPA/CPRA disclosures
- [ ] "Do Not Sell or Share My Personal Information" link in footer (or the single alternative link "Your Privacy Choices" with the opt-out icon, section 7015)
- [ ] Two or more request methods, including a toll-free number unless you operate only online with a direct relationship to consumers (then an email address is enough)
- [ ] Identity verification for know, delete and correct requests (never for opt-out)
- [ ] Receipt confirmed within 10 business days; response within 45 days; opt-out and limit within 15 business days
- [ ] GPC signal detection implemented and honored
- [ ] Data inventory and mapping completed
- [ ] Sensitive personal information identified and limited
- [ ] Third-party contracts updated with data sharing restrictions
- [ ] Opt-out preference stored and honored across systems
- [ ] Privacy policy updated at least every 12 months
- [ ] Training for staff who handle privacy requests

## Examples

### Example 1: Add a Do Not Sell or Share link with GPC support

**User request:** "We run a Node.js store with Mixpanel and Meta Pixel. Make us compliant with the CCPA opt-out rules."

The agent adds the `gpcMiddleware` above, a footer link to `/privacy/opt-out`, and a function that stops loading the Mixpanel and Meta tags for opted-out visitors. A request sent with `Sec-GPC: 1` returns a response that sets the `ccpa_optout` cookie, and the analytics scripts are absent from the page. It then updates the privacy policy sections listed above.

### Example 2: Build the request API

**User request:** "Customers email us to delete their data. Build an endpoint for it."

The agent adds the FastAPI `/api/privacy/dsr` endpoints: a delete request returns `pending_verification` and sends a one-time link; after verification `process_dsr` deletes the user's rows listed in the data inventory, and the deadline (45 days) is stored on the record. An opt-out through the same endpoint skips verification and is applied immediately.

## Guidelines

- Treat the inventory as the source of truth: every new table or vendor must be added before launch.
- Never require an account, ID or verification for an opt-out of sale/sharing or a limit request.
- Honor GPC without asking for confirmation, and do not re-prompt a user who opted out for at least 12 months.
- Keep deletion and export logs without the deleted data itself; remember to pass deletion to service providers.
- Check the CPI thresholds and penalty figures every odd-numbered year, and consult a lawyer for edge cases (employees, B2B contacts, minors under 16).
