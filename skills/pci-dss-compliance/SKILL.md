---
name: pci-dss-compliance
description: >-
  Achieve PCI DSS compliance for handling payment card data — scoping, controls, and SAQ selection.
  Use when storing, processing, or transmitting payment card data, building e-commerce security,
  or achieving payment processing compliance.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python and Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["pci-dss", "payment", "compliance", "security", "ecommerce"]
  use-cases:
    - "Scope and minimize the cardholder data environment for a SaaS payment flow"
    - "Select the right SAQ type and implement required controls"
    - "Use tokenization to reduce PCI DSS scope"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# PCI DSS Compliance

## Overview

PCI DSS (Payment Card Industry Data Security Standard) v4.0.1 applies to any organization that stores, processes, or transmits cardholder data (CHD). It is maintained by the PCI Security Standards Council and has 12 requirements across 6 goals. v4.0 was retired on 31 December 2024, so v4.0.1 is the version to assess against. Penalties are set by card brands and acquirers, not by the Council; non-compliance can lead to fines and loss of card processing.

## Instructions

1. Identify every system that stores, processes, or transmits cardholder data, and draw the CDE boundary.
2. Remove data and systems from the CDE where you can (hosted payment pages, tokenization).
3. Choose the SAQ from your payment flow, then confirm eligibility with your acquirer.
4. Implement the controls for that SAQ, keep the evidence, and schedule scans and tests.

## Key Terms

- **CHD (Cardholder Data):** PAN, cardholder name, expiration date, service code
- **SAD (Sensitive Authentication Data):** Full magnetic stripe, CVV/CVC, PIN — NEVER store SAD post-authorization
- **CDE (Cardholder Data Environment):** Systems that store, process, or transmit CHD
- **PAN (Primary Account Number):** The card number (13-19 digits, usually 16)

## Scoping: Minimize the CDE

The most effective compliance strategy is **reducing scope** — minimize the number of systems in the CDE.

### Use Stripe/Braintree to Avoid CDE Entirely

```javascript
// ✅ Likely SAQ A (confirm with your acquirer)
// Card data never touches your server — handled by Stripe.js

import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Card data goes directly to Stripe — never to your server
    const { paymentMethod, error } = await stripe.createPaymentMethod({
      type: 'card',
      card: elements.getElement(CardElement),
    });
    
    if (!error) {
      // Send only paymentMethod.id to your server
      await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ paymentMethodId: paymentMethod.id, amount: 2999 })
      });
    }
  };
}
```

```python
# ✅ Server-side: receives only token/payment method ID — not card data
import os
import stripe

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

def charge_customer(payment_method_id: str, amount_cents: int, currency: str = "usd"):
    """Process payment using token. CDE never touches card data."""
    intent = stripe.PaymentIntent.create(
        amount=amount_cents,
        currency=currency,
        payment_method=payment_method_id,
        confirm=True,
        automatic_payment_methods={"enabled": True, "allow_redirects": "never"}
    )
    return intent
```

## SAQ Selection Guide

| SAQ Type | Who Uses It | Scope |
|----------|-------------|-------|
| **SAQ A** | Card-not-present merchants using fully outsourced payment pages (Stripe Checkout, PayPal hosted) | Smallest; card data never enters your systems |
| **SAQ A-EP** | E-commerce where your page scripts can affect the payment form (custom JavaScript, Stripe.js v2 on your own form) | Adds script-integrity controls (6.4.3, 11.6.1) |
| **SAQ B** | Merchants using standalone terminals, no electronic storage | Hardware terminals |
| **SAQ B-IP** | Merchants using IP-connected terminals | IP terminals |
| **SAQ C** | Merchants with payment app connected to internet | Payment application connected to the internet |
| **SAQ D** | All other merchants and service providers | Full assessment of all 12 requirements |

**Rule of thumb:** Stripe Checkout (hosted page) or a Payment Element rendered in an iframe, with no custom payment-affecting scripts on your page, usually means SAQ A. Custom JavaScript on the payment page, Stripe.js v2 on your own form, or card fields rendered inline in your DOM points to SAQ A-EP. Stripe's security guide does not name SAQs, so confirm the choice with your acquirer or QSA.

## PCI DSS v4.0.1 — 12 Requirements

### Req 1: Network Security Controls
```nginx
# Firewall rules — only allow necessary traffic to CDE
# Block all traffic by default, allow only what's needed
location /api/payments {
    allow 10.0.0.0/8;      # Internal services
    deny all;
}
```

### Req 2: Secure Configurations
- Change default passwords, remove unneeded services, and document every system component

### Req 3: Protect Stored Account Data
```python
# ❌ NEVER store SAD (CVV, full magnetic stripe, PIN)
# ❌ NEVER store unencrypted PANs

# ✅ Store only masked PAN if needed
def mask_pan(pan: str) -> str:
    """Mask PAN per PCI DSS — show first 6 and last 4 only."""
    if len(pan) < 13:
        raise ValueError("Invalid PAN length")
    return pan[:6] + "*" * (len(pan) - 10) + pan[-4:]

# Example: 4111111111111111 → 411111******1111

# ✅ Or store token from payment processor instead
# token = "tok_1234567890"  — maps to real card in Stripe's vault
```

### Req 4: Protect Cardholder Data in Transit
```python
import os
import ssl
import requests
from requests.adapters import HTTPAdapter

class TLS12Adapter(HTTPAdapter):
    """Refuse anything older than TLS 1.2 for connections involving CHD."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

session = requests.Session()
session.mount('https://', TLS12Adapter())

# Verify SSL certificates — never disable in production
response = session.get(
    'https://api.stripe.com/v1/charges',
    verify=True,  # Never set to False in production
    headers={'Authorization': f'Bearer {os.environ["STRIPE_SECRET_KEY"]}'}
)
```

### Req 5: Protect Systems from Malicious Software
- Deploy and maintain anti-malware/EDR on all systems in scope

### Req 6: Develop and Maintain Secure Systems

```python
# Secure coding — prevent injection in payment contexts

# ❌ Never log card data
import logging

def process_payment(card_number: str, amount: int):
    # WRONG: logging.info(f"Processing card {card_number}")
    logging.info(f"Processing payment for amount {amount}")  # ✅ No CHD in logs

# Validate PAN format (Luhn algorithm)
def luhn_check(pan: str) -> bool:
    """Validate PAN with Luhn algorithm — use for format validation only."""
    digits = [int(d) for d in pan.replace(" ", "").replace("-", "")]
    odd_digits = digits[-1::-2]
    even_digits = digits[-2::-2]
    total = sum(odd_digits)
    for d in even_digits:
        total += sum(divmod(d * 2, 10))
    return total % 10 == 0
```

### Req 7: Restrict Access by Business Need
```python
# Role-based access — only billing/finance roles access payment records
PAYMENT_ACCESS_ROLES = {"billing_admin", "finance_manager", "cfo"}

def require_payment_access(func):
    def wrapper(request, *args, **kwargs):
        if request.user.role not in PAYMENT_ACCESS_ROLES:
            raise PermissionError("Payment data access denied")
        return func(request, *args, **kwargs)
    return wrapper
```

### Req 8: Identify Users and Authenticate Access
- Unique user IDs, MFA for all CDE access, passwords of at least 12 characters
- Re-authenticate a session after 15 minutes of inactivity

### Req 9: Restrict Physical Access
- Visitor logs, badge access, and secure destruction of media containing CHD

### Req 10: Log and Monitor All Access
```python
# Log all access to cardholder data
import json
import logging
from datetime import datetime, timezone

audit_logger = logging.getLogger("chd_audit")

def log_chd_access(user_id, action, last4, amount=None):
    """Compliance log for Req 10 — never log full PAN."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "action": action,          # "view" | "charge" | "refund"
        "card_last4": last4,       # ✅ Only last 4 digits
        "amount": amount,
        "event_type": "chd_access"
    }
    audit_logger.info(json.dumps(entry))
```

**Log retention:** Minimum 12 months, with 3 months immediately available for analysis.

### Req 11: Test Security Systems
```bash
# Quarterly external scans must be run by an Approved Scanning Vendor (ASV).
# Quarterly internal scans by qualified staff; annual penetration test.

# Internal scan with nmap (only ranges you own and have authorized)
nmap -sV --script vuln -oX vuln-scan-$(date +%Y%m%d).xml 10.0.1.0/24

# Passive baseline scan of a staging checkout with OWASP ZAP.
# owasp/zap2docker-stable is retired; use the GHCR image.
docker run --rm -t -v "$PWD":/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://staging.shop.northwind-labs.io/checkout \
  -r zap-report-$(date +%Y%m%d).html
```

### Req 12: Support Information Security with Policies
- Written security policy, annual risk assessment, incident response plan (with a card data breach procedure), and staff training

## Compliance Checklist

- [ ] SAQ type selected and validated
- [ ] CDE scoped and documented with network diagram
- [ ] Payment processor agreement signed, with its PCI DSS responsibility matrix (Req 12.8, 12.9)
- [ ] No SAD stored post-authorization (no CVV, no full magnetic stripe)
- [ ] PANs masked or tokenized in storage
- [ ] Card data never appears in logs
- [ ] TLS 1.2+ enforced on all connections
- [ ] MFA enabled for all CDE access
- [ ] Quarterly vulnerability scans scheduled
- [ ] Annual penetration test planned
- [ ] Log retention: 12 months minimum

## Examples

### Which SAQ for a hosted checkout

> We use Stripe Checkout on our site, and our servers never see card numbers. Which SAQ do we fill in?

Likely SAQ A, because card data is entered on Stripe's hosted page and never reaches your systems. Confirm with your acquirer, then complete the SAQ A questionnaire and attest annually. If you later add custom JavaScript to the checkout page, re-check for SAQ A-EP.

### Find PANs in application logs before a release

> Check our Node logs in ./logs for card numbers before we ship.

```bash
grep -rEn '[0-9]{13,19}' logs/ | head -50
```

Result: a list of `file:line` hits. Each hit must be reviewed by hand, because order IDs and timestamps also match. Keep only candidates that pass the Luhn check in Req 6. Any real PAN found means the logging code is wrong: fix it, purge the logs, and treat it as a security incident under Req 12.

## Guidelines

- Keep scope small: the cheapest control is never having card data in your systems.
- Never store SAD (CVV/CVC, full track data, PIN) after authorization, even encrypted.
- Use the current standard in your paperwork: v4.0.1, not v4.0.
- These notes are engineering guidance, not an assessment. Your acquirer or a QSA decides SAQ eligibility and compliance status.
- Read the PCI SSC "SAQ Instructions and Guidelines" document before filling in any SAQ.
