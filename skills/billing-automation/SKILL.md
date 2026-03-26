---
name: billing-automation
description: >-
  Automate invoice generation, billing workflows, payment tracking, and revenue
  recognition for SaaS and service businesses. Use when building billing
  pipelines, generating invoice PDFs, usage-based invoicing, subscription
  management, payment reminders, or financial reporting. Trigger words: invoice,
  billing, payment, subscription, usage billing, revenue recognition, accounts
  receivable, dunning, proration, Stripe billing, generate invoice, create bill.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+; PDF generation library required"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["billing", "invoicing", "payments", "automation", "finance"]
---

# Billing Automation

## Overview

Build automated billing workflows covering invoice generation, PDF rendering, payment processing, dunning (payment failure handling), and financial reporting. Handles proration, usage-based billing, multi-currency support, tax calculation, discounts, and professional invoice document generation.

## Instructions

### 1. Define the Billing Model

- **Flat subscription**: Fixed price per period (monthly/annual)
- **Usage-based**: Metered billing (API calls, storage, compute hours)
- **Tiered**: Volume-based pricing with breakpoints
- **Hybrid**: Base subscription + usage overage
- **Per-seat**: Price per active user

### 2. Design the Invoice Data Model

```sql
invoices (
  id, customer_id, invoice_number, status,
  billing_period_start, billing_period_end,
  subtotal, tax_amount, total, currency,
  due_date, paid_at, created_at
)
invoice_line_items (
  id, invoice_id, description, quantity, unit_price,
  amount, metadata_json
)
payments (
  id, invoice_id, amount, currency, method,
  processor_ref, status, paid_at
)
```

### 3. Invoice Generation Pipeline

```
For each billing cycle:
  1. Aggregate usage events for the billing period
  2. Apply pricing rules (tiers, discounts, proration)
  3. Calculate taxes based on customer location
  4. Generate invoice record with line items
  5. Render PDF with company branding
  6. Send via email and store in customer portal
  7. Initiate payment collection (auto-charge or payment link)
  8. Handle payment success/failure with appropriate follow-up
```

### 4. Generate Invoice PDFs

Gather required information and render professional documents:

- **Sender**: Company name, address, email, phone, logo, tax ID
- **Recipient**: Client name, address, contact information
- **Invoice number**: Auto-generate sequential (INV-YYYY-NNN) or use custom scheme
- **Line items**: Description, quantity, unit price, amount
- **Calculations**: Subtotal, discount, tax (VAT/GST/sales tax), total
- **Payment terms**: Net 30/60, accepted methods, bank details

```python
def calculate_invoice(items, tax_rate=0, discount=0):
    subtotal = sum(item['quantity'] * item['unit_price'] for item in items)
    discount_amount = subtotal * (discount / 100)
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * (tax_rate / 100)
    total = taxable_amount + tax_amount
    return {
        "subtotal": round(subtotal, 2),
        "discount": round(discount_amount, 2),
        "tax": round(tax_amount, 2),
        "total": round(total, 2)
    }
```

For PDF rendering, use reportlab (Python) or PDFKit (Node.js) with a clean layout: header with company info, invoice metadata, bill-to section, line items table, totals, and payment terms.

### 5. Handle Edge Cases

- **Proration**: Calculate partial charges for mid-cycle upgrades
- **Credits**: Apply account credits before charging payment method
- **Disputes**: Mark invoice as disputed, pause dunning
- **Refunds**: Generate credit notes linked to original invoice
- **Currency**: Store amounts in smallest unit (cents); display with proper formatting
- **Tax**: Integrate with tax service for multi-jurisdiction compliance

### 6. Dunning (Payment Failure) Workflow

```
Payment failed:
  Day 0: Retry payment, send "payment failed" email
  Day 3: Retry with updated payment method prompt
  Day 7: Final retry, warn about service suspension
  Day 14: Suspend service, send "account suspended" email
  Day 30: Cancel subscription, final notice
```

## Examples

### Example 1: Usage-based invoice generation

**User prompt:** "Generate monthly invoices for our API platform. Tiered pricing: first 10,000 calls free, 10,001-100,000 at $0.001 each, 100,001+ at $0.0005 each."

```javascript
calculateTieredPricing(totalCalls) {
  const items = [];
  if (totalCalls <= 10000) {
    items.push({ description: 'API calls (free tier)', quantity: totalCalls, unitPrice: 0, amount: 0 });
  } else if (totalCalls <= 100000) {
    items.push({ description: 'API calls (free tier)', quantity: 10000, unitPrice: 0, amount: 0 });
    const paid = totalCalls - 10000;
    items.push({ description: 'API calls (standard)', quantity: paid, unitPrice: 0.001, amount: paid * 0.001 });
  } else {
    items.push({ description: 'API calls (free tier)', quantity: 10000, unitPrice: 0, amount: 0 });
    items.push({ description: 'API calls (standard)', quantity: 90000, unitPrice: 0.001, amount: 90 });
    const bulk = totalCalls - 100000;
    items.push({ description: 'API calls (volume)', quantity: bulk, unitPrice: 0.0005, amount: bulk * 0.0005 });
  }
  return items;
}
```

### Example 2: Freelance invoice with tax and discount

**User prompt:** "Invoice TechStart Ltd: website design $3,500, SEO setup $1,200, hosting 12 months at $29/mo. 20% VAT. 10% early payment discount. Currency EUR."

**Output:**
```
Invoice #INV-2025-002 | Currency: EUR

  Website Design          1 x EUR 3,500.00 = EUR 3,500.00
  SEO Setup               1 x EUR 1,200.00 = EUR 1,200.00
  Web Hosting (12 months) 12 x EUR 29.00   = EUR   348.00

  Subtotal:    EUR 5,048.00
  Discount:   -EUR   504.80
  VAT (20%):   EUR   908.64
  Total:       EUR 5,451.84

  Payment Terms: Net 30 — 10% early payment discount applied
```

### Example 3: Dunning workflow with Stripe

**User prompt:** "Implement a dunning workflow for failed subscription payments using Stripe."

The agent generates a dunning service with webhook handlers for `invoice.payment_failed`, configurable retry schedules, email templates for each escalation stage, and automatic subscription status management.

## Guidelines

- Always use idempotency keys for payment operations to prevent double charges
- Store monetary amounts as integers in smallest currency unit (cents, pence)
- Generate sequential invoice numbers with no gaps for tax compliance
- Keep an immutable audit log of all billing events
- Include legally required fields: company details, tax ID, payment terms, line items
- Calculate tax on the post-discount amount, not the subtotal
- Format currency with two decimal places and correct symbol
- Default payment terms to Net 30 unless specified otherwise
- Never delete invoices — void them with a credit note instead
- Implement webhook handlers for payment processor events rather than polling
- Test with edge cases: zero usage, credits, currency rounding, proration
