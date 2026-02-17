---
title: "Automate Invoice Generation and Billing Workflows with AI"
slug: automate-invoice-generation-and-billing
description: "Build automated billing pipelines with usage-based invoicing, PDF generation, payment tracking, and dunning workflows."
skills: [billing-automation, invoice-generator, template-engine]
category: business
tags: [billing, invoicing, payments, automation, saas]
---

# Automate Invoice Generation and Billing Workflows with AI

## The Problem

Your finance team spends the first week of every month manually generating invoices. They pull usage data from your admin dashboard, open a spreadsheet template, fill in line items, export to PDF, email each customer individually, then track who has paid in another spreadsheet. With 200 customers and usage-based pricing, this means 200 invoices with tiered calculations, proration for mid-month signups, tax adjustments by jurisdiction, and manual follow-up on 30+ overdue payments. One wrong formula, one missed email, and revenue leaks or a customer gets double-charged.

## The Solution

Use the **billing-automation** skill to build the invoicing pipeline and dunning workflows, the **invoice-generator** skill to render professional PDF invoices, and the **template-engine** skill to create email templates for invoice delivery and payment reminders.

```bash
npx terminal-skills install billing-automation invoice-generator template-engine
```

## Step-by-Step Walkthrough

### 1. Design the billing data model

Start by structuring how billing data flows through your system:

```
Design a billing system database schema for our API platform. We have usage-based pricing with three tiers (free up to 10,000 API calls, standard at $0.001/call up to 100,000, volume at $0.0005/call above that). Customers can also have flat add-ons (premium support at $99/month, dedicated IP at $49/month). We bill monthly and need to support proration for mid-cycle changes. Use PostgreSQL.
```

The agent designs a normalized schema:

```
Schema created:
  customers — account details, billing email, tax info, currency
  pricing_plans — tier definitions with usage breakpoints
  subscriptions — active plans per customer with start/end dates
  billing_events — raw usage events (API calls with timestamps)
  invoices — generated invoices with status tracking
  invoice_line_items — itemized charges per invoice
  payments — payment records linked to invoices
  credit_notes — refunds and credits linked to original invoices

Indexes optimized for:
  - Aggregating usage events by customer and billing period
  - Finding overdue invoices for dunning
  - Revenue reporting by period and customer segment
```

### 2. Build the invoice generation pipeline

```
Implement a monthly invoice generation service in Node.js. It should: query all active customers, aggregate their API usage for the billing period, apply tiered pricing, add any flat subscription charges with proration for mid-cycle signups, calculate tax based on customer country (EU VAT, US sales tax — use a tax rates lookup table for now), generate an invoice record with line items, and render a PDF. Process all 200 customers in parallel with concurrency limit of 10.
```

The agent generates a complete pipeline with usage aggregation, tiered pricing calculation, proration logic, tax handling, and PDF rendering:

```
Invoice generation complete for February 2026:
  Processed: 200 customers
  Invoices generated: 187 (13 skipped — zero usage, no active subscriptions)
  Total revenue: $47,829.14
  Processing time: 34 seconds

  Breakdown:
    Usage charges: $31,204.50
    Flat subscriptions: $14,892.00
    Proration adjustments: -$412.36
    Tax collected: $2,145.00

  Sample invoice #INV-2026-02-0047:
    Customer: Acct #1047 (EU, Germany)
    API calls: 247,891
    Free tier (10,000): $0.00
    Standard (90,000 × $0.001): $90.00
    Volume (147,891 × $0.0005): $73.95
    Premium support: $99.00
    Subtotal: $262.95
    VAT (19%): $49.96
    Total: $312.91
```

### 3. Create professional invoice PDFs

```
Design a PDF invoice template with our branding. Include: company logo area, invoice number, date, and due date in the header. Customer billing details on the left, our company details on the right. A line items table with description, quantity, unit price, and amount. Subtotal, tax breakdown, and total in bold. Payment instructions at the bottom with bank transfer details and a link to pay online. Footer with payment terms (Net 30) and our tax registration number.
```

The agent generates a PDF template using a headless rendering approach that produces clean, professional invoices matching the layout specification.

### 4. Automate payment collection and dunning

```
Implement a payment collection workflow. For customers with a card on file, automatically charge via Stripe when the invoice is created. For bank transfer customers, send the invoice with payment instructions and track incoming payments. Build a dunning workflow for failed payments: retry on day 0, send a reminder email on day 3, send an urgent notice on day 7 with a direct payment link, and flag for manual review on day 14. Track all state transitions in an audit log.
```

The agent creates webhook handlers, email templates for each dunning stage, and a state machine for invoice lifecycle:

```
Payment collection flow:
  Auto-charge customers (card on file): 142 customers
    ✓ Successful: 136
    ✗ Failed (entered dunning): 6
      - 3 expired cards → "update payment method" email sent
      - 2 insufficient funds → retry scheduled for day 3
      - 1 card declined → retry scheduled for day 3

  Bank transfer customers: 45 customers
    Invoices sent with payment instructions
    Matching engine watches for incoming transfers by reference number
```

### 5. Build financial reporting

```
Create a billing dashboard API with these endpoints: GET /api/billing/mrr (monthly recurring revenue with trend), GET /api/billing/outstanding (total unpaid invoices by aging bucket: current, 1-30 days, 31-60 days, 60+ days), GET /api/billing/revenue-by-customer (top 20 customers by revenue with month-over-month change), and GET /api/billing/churn-risk (customers with declining usage or payment failures). Include CSV export for the finance team.
```

## Real-World Example

The finance manager at a growing API platform company spends 5 days each month on billing. She exports usage logs, manually calculates tiered pricing in a spreadsheet for 200 customers, generates invoices one at a time in their accounting software, and chases overdue payments via individual emails. Last month, a formula error resulted in 12 customers being undercharged by a total of $3,400, discovered only during quarterly reconciliation.

1. She asks the agent to design the billing schema — it models the tiered pricing, proration, and tax rules in a clean database structure
2. The agent builds an invoice generation pipeline that processes all 200 customers in 34 seconds with correct tiered calculations
3. Professional PDF invoices are generated with proper line items, tax breakdowns, and payment instructions
4. Auto-charging handles 142 card-on-file customers instantly, with dunning for the 6 failures. Bank transfer invoices go out with reference numbers for automatic matching
5. A dashboard shows real-time MRR, outstanding receivables by aging, and flags 3 customers at churn risk based on declining usage

Monthly billing goes from 5 days of manual work to a single button press, with zero calculation errors and 15% faster payment collection thanks to automated reminders.

## Related Skills

- [invoice-generator](../skills/invoice-generator/) — PDF invoice rendering with customizable templates
- [template-engine](../skills/template-engine/) — Email templates for invoice delivery and payment reminders
- [excel-processor](../skills/excel-processor/) — Export billing data for finance team reconciliation
