---
name: billing-automation
description: >-
  Automate invoice generation, billing workflows, payment tracking, and revenue
  recognition for SaaS and service businesses. Use when building billing pipelines,
  usage-based invoicing, subscription management, payment reminders, or financial
  reporting. Trigger words: invoice, billing, payment, subscription, usage billing,
  revenue recognition, accounts receivable, payment reminder, overdue invoice,
  billing cycle, proration, Stripe billing.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+; PDF generation library required"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["billing", "invoicing", "payments", "automation"]
---

# Billing Automation

## Overview

This skill helps you build automated billing workflows covering invoice generation from usage data, PDF rendering, payment processing integration, dunning (payment failure handling), and financial reporting. It handles the complexity of proration, usage-based billing, multi-currency support, and tax calculation.

## Instructions

### 1. Define the Billing Model

Determine the billing structure:
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
billing_events (
  id, customer_id, event_type, quantity,
  unit, timestamp, metadata_json
)
```

### 3. Build the Invoice Generation Pipeline

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

### 4. Handle Edge Cases

- **Proration**: When a customer upgrades mid-cycle, calculate partial charges
- **Credits**: Apply account credits before charging payment method
- **Disputes**: Mark invoice as disputed, pause dunning
- **Refunds**: Generate credit notes linked to original invoice
- **Currency**: Store amounts in smallest unit (cents), display with proper formatting
- **Tax**: Integrate with tax calculation service for multi-jurisdiction compliance

### 5. Dunning (Payment Failure) Workflow

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

**User prompt:**
```
Generate monthly invoices for our API platform. Customers are billed per API call with tiered pricing: first 10,000 calls free, 10,001-100,000 at $0.001 each, 100,001+ at $0.0005 each. Pull usage from our billing_events table and generate PDF invoices.
```

**Agent output:**

```javascript
// services/InvoiceGenerator.js
class InvoiceGenerator {
  constructor({ db, pdfRenderer, emailService, paymentProcessor }) {
    this.db = db;
    this.pdfRenderer = pdfRenderer;
    this.emailService = emailService;
    this.paymentProcessor = paymentProcessor;
  }

  async generateMonthlyInvoices(billingMonth) {
    const customers = await this.db.getActiveCustomers();
    const results = { generated: 0, skipped: 0, errors: [] };

    for (const customer of customers) {
      try {
        const usage = await this.aggregateUsage(customer.id, billingMonth);
        if (usage.totalCalls === 0) { results.skipped++; continue; }

        const lineItems = this.calculateTieredPricing(usage.totalCalls);
        const tax = await this.calculateTax(customer, lineItems);

        const invoice = await this.db.createInvoice({
          customerId: customer.id,
          invoiceNumber: this.generateInvoiceNumber(billingMonth),
          billingPeriodStart: billingMonth.start,
          billingPeriodEnd: billingMonth.end,
          lineItems,
          subtotal: lineItems.reduce((sum, li) => sum + li.amount, 0),
          taxAmount: tax.amount,
          total: lineItems.reduce((sum, li) => sum + li.amount, 0) + tax.amount,
          currency: 'USD',
          dueDate: addDays(billingMonth.end, 30),
        });

        const pdf = await this.pdfRenderer.render('invoice', { invoice, customer });
        await this.emailService.send(customer.email, 'invoice', { invoice, pdf });
        results.generated++;
      } catch (error) {
        results.errors.push({ customerId: customer.id, error: error.message });
      }
    }
    return results;
  }

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
}
```

### Example 2: Dunning workflow with Stripe

**User prompt:**
```
Implement a dunning workflow for failed subscription payments. Use Stripe for payment processing. Escalate from retry to email to service suspension.
```

**Agent generates** a complete dunning service with webhook handlers for `invoice.payment_failed`, configurable retry schedules, email templates for each escalation stage, and automatic subscription status management.

## Guidelines

- Always use idempotency keys for payment operations to prevent double charges
- Store all monetary amounts as integers in smallest currency unit (cents, pence)
- Generate sequential invoice numbers with no gaps for tax compliance
- Keep an immutable audit log of all billing events
- Send invoices as PDF attachments AND provide a web portal link
- Include legally required fields: company details, tax ID, payment terms, line items
- Test billing logic with edge cases: zero usage, negative amounts (credits), currency rounding
- Implement webhook handlers for payment processor events rather than polling
- Never delete invoices — void them with a credit note instead
