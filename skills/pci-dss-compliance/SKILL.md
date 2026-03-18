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
  version: "1.0.0"
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

PCI DSS (Payment Card Industry Data Security Standard) v4.0 applies to any organization that stores, processes, or transmits cardholder data (CHD). Maintained by the PCI Security Standards Council, it has 12 requirements across 6 goals. Non-compliance can result in fines of $5,000–$100,000/month and loss of card processing privileges.

## Key Terms

- **CHD (Cardholder Data):** PAN, cardholder name, expiration date, service code
- **SAD (Sensitive Authentication Data):** Full magnetic stripe, CVV/CVC, PIN — NEVER store SAD post-authorization
- **CDE (Cardholder Data Environment):** Systems that store, process, or transmit CHD
- **PAN (Primary Account Number):** The 16-digit card number

## Scoping: Minimize the CDE

The most effective compliance strategy is **reducing scope** — minimize the number of systems in the CDE.

### Use Stripe/Braintree to Avoid CDE Entirely

```javascript
// ✅ PCI DSS scope: SAQ A (minimal)
// Card data never touches your server — handled by Stripe.js

import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe('pk_live_...');

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
import stripe

stripe.api_key = "sk_live_..."

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
| **SAQ A** | Card-not-present merchants using fully outsourced payment pages (Stripe Checkout, PayPal hosted) | Minimal — ~22 requirements |
| **SAQ A-EP** | E-commerce with JS-based payment forms (Stripe Elements, Braintree.js) | Medium — ~191 requirements |
| **SAQ B** | Merchants using standalone terminals, no electronic storage | Hardware terminals |
| **SAQ B-IP** | Merchants using IP-connected terminals | IP terminals |
| **SAQ C** | Merchants with payment app connected to internet | ~139 requirements |
| **SAQ D** | All other merchants and service providers | All 12 requirements |

**Rule of thumb:** If you use Stripe Checkout (hosted page), you qualify for SAQ A. If you use Stripe Elements (custom form with Stripe.js), you qualify for SAQ A-EP.

## PCI DSS v4.0 — 12 Requirements

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
- Change all default passwords before deployment
- Remove unnecessary services, protocols, daemons
- Document all system components and their purpose

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
import ssl
import requests

# Always use TLS 1.2+ for any connection involving CHD
session = requests.Session()
session.mount('https://', requests.adapters.HTTPAdapter())

# Verify SSL certificates — never disable in production
response = session.get(
    'https://api.stripe.com/v1/charges',
    verify=True,  # Never set to False in production
    headers={'Authorization': f'Bearer {stripe_key}'}
)
```

### Req 5: Protect Systems from Malicious Software
- Deploy antivirus/EDR on all systems
- Keep antivirus definitions current
- Run periodic scans on all systems

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
- Unique user IDs (no shared accounts)
- MFA required for all CDE access
- Passwords: minimum 12 characters, complexity required
- Session lockout after 15 minutes of inactivity

### Req 9: Restrict Physical Access
- Visitor log for data center
- Badge access control
- Secure destruction of media containing CHD

### Req 10: Log and Monitor All Access
```python
# Log all access to cardholder data
def log_chd_access(user_id, action, last4, amount=None):
    """Compliance log for Req 10 — never log full PAN."""
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
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
# Quarterly vulnerability scanning (approved scanning vendor required)
# Annual penetration testing

# Internal scan with nmap
nmap -sV --script vuln -oX vuln-scan-$(date +%Y%m%d).xml 10.0.1.0/24

# Run OWASP ZAP against payment pages
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://yoursite.com/checkout \
  -r zap-report-$(date +%Y%m%d).html
```

### Req 12: Support Information Security with Policies
- Written information security policy
- Annual risk assessment
- Incident response plan
- Employee security training

## Tokenization Architecture

```
Customer → Stripe.js → Stripe Servers → Token returned to your app
                ↓
         Card data never
         touches your server
                ↓
Your Server → Receives token only → Stores token in DB
                ↓
Payment needed → Send token to Stripe API → Stripe processes → Result
```

## Compliance Checklist

- [ ] SAQ type selected and validated
- [ ] CDE scoped and documented with network diagram
- [ ] Payment processor BAA/agreement signed
- [ ] No SAD stored post-authorization (no CVV, no full stripe)
- [ ] PANs masked or tokenized in storage
- [ ] Card data never appears in logs
- [ ] TLS 1.2+ enforced on all connections
- [ ] MFA enabled for all CDE access
- [ ] Quarterly vulnerability scans scheduled
- [ ] Annual penetration test planned
- [ ] Incident response plan includes card data breach procedure
- [ ] Log retention: 12 months minimum
