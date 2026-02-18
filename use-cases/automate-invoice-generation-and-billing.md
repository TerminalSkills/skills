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

Kenji is the finance manager at a growing API platform company. He spends the first five days of every month generating invoices. The process: export usage logs from the admin dashboard, open a spreadsheet template, manually calculate tiered pricing for each of 200 customers, export each invoice to PDF, email them one by one, then track who has paid in a separate spreadsheet. With usage-based pricing, tiered rates, proration for mid-month signups, and tax adjustments by jurisdiction, one wrong formula means revenue leaks or a customer gets double-charged.

Last month, a formula error resulted in 12 customers being undercharged by a total of $3,400. Nobody caught it until quarterly reconciliation — three months of lost revenue that is now awkward to collect retroactively. And every month, 30+ overdue payments need individual follow-up emails that Kenji writes by hand. Some customers are 3 days late and need a gentle nudge. Others are 30 days late and need a firm escalation. Each email is slightly different, and Kenji spends two full days just on collections.

The company is growing, and 200 customers will be 400 by year-end. The manual process does not scale.

## The Solution

Using the **billing-automation** skill to build the invoicing pipeline and dunning workflows, the **invoice-generator** skill to render professional PDF invoices, and the **template-engine** skill to create email templates for delivery and payment reminders, the agent replaces five days of manual spreadsheet work with a single automated pipeline that runs in 34 seconds.

## Step-by-Step Walkthrough

### Step 1: Design the Billing Data Model

The foundation of any billing system is the data model. Usage-based pricing with tiers and add-ons requires more tables than most people expect — and getting the schema wrong means every downstream process (invoicing, reporting, dunning) fights the data model.

```text
Design a billing system database schema for our API platform. We have usage-based pricing with three tiers (free up to 10,000 API calls, standard at $0.001/call up to 100,000, volume at $0.0005/call above that). Customers can also have flat add-ons (premium support at $99/month, dedicated IP at $49/month). We bill monthly and need to support proration for mid-cycle changes. Use PostgreSQL.
```

The schema has eight tables:

| Table | Purpose |
|---|---|
| `customers` | Account details, billing email, tax info, preferred currency |
| `pricing_plans` | Tier definitions with usage breakpoints and per-unit rates |
| `subscriptions` | Active plans per customer with start/end dates for proration |
| `billing_events` | Raw usage events (API calls with timestamps, partitioned by month) |
| `invoices` | Generated invoices with status tracking (draft, issued, paid, overdue) |
| `invoice_line_items` | Itemized charges per invoice |
| `payments` | Payment records linked to invoices (supports partial payments) |
| `credit_notes` | Refunds and credits linked to original invoices |

Indexes are tuned for three access patterns: aggregating usage events by customer and billing period (the hot path during invoice generation — this query runs 200 times during a billing cycle), finding overdue invoices for the dunning workflow (filtered by status and due date), and revenue reporting by period and customer segment.

The `billing_events` table is partitioned by month so that usage aggregation queries only scan the current billing period, not the entire history. At scale, this is the difference between a 30-second billing run and a 30-minute one.

### Step 2: Build the Invoice Generation Pipeline

This is where tiered pricing meets real-world messiness: mid-cycle signups need proration, EU customers need VAT at the correct country rate, US customers may need state sales tax, and the pipeline needs to handle 200 customers without taking an hour.

```text
Implement a monthly invoice generation service in Node.js. It should: query all active customers, aggregate their API usage for the billing period, apply tiered pricing, add any flat subscription charges with proration for mid-cycle signups, calculate tax based on customer country (EU VAT, US sales tax — use a tax rates lookup table for now), generate an invoice record with line items, and render a PDF. Process all 200 customers in parallel with concurrency limit of 10.
```

A sample invoice shows the tiered calculation in action:

**Invoice #INV-2026-02-0047** — Customer Acct #1047 (Germany, EU)

| Line Item | Quantity | Unit Price | Amount |
|---|---|---|---|
| API calls — Free tier | 10,000 | $0.00 | $0.00 |
| API calls — Standard tier | 90,000 | $0.001 | $90.00 |
| API calls — Volume tier | 147,891 | $0.0005 | $73.95 |
| Premium support (monthly) | 1 | $99.00 | $99.00 |
| **Subtotal** | | | **$262.95** |
| VAT (19% — Germany) | | | $49.96 |
| **Total** | | | **$312.91** |

The full run processes 200 customers in 34 seconds with a concurrency limit of 10. Results: 187 invoices generated (13 skipped — zero usage and no active subscriptions), total revenue of $47,829.14. The breakdown: $31,204.50 in usage charges, $14,892.00 in flat subscriptions, -$412.36 in proration adjustments (for customers who signed up mid-cycle), and $2,145.00 in tax collected across 14 EU countries and 3 US states.

### Step 3: Create Professional Invoice PDFs

A PDF invoice needs to look like it came from a real finance department. Customers at the enterprise tier are forwarding these to their accounting departments for approval and payment processing. A plain-text email with numbers does not inspire confidence, and an ugly PDF raises questions about whether the vendor is legitimate.

```text
Design a PDF invoice template with our branding. Include: company logo area, invoice number, date, and due date in the header. Customer billing details on the left, our company details on the right. A line items table with description, quantity, unit price, and amount. Subtotal, tax breakdown, and total in bold. Payment instructions at the bottom with bank transfer details and a link to pay online. Footer with payment terms (Net 30) and our tax registration number.
```

The template uses a headless rendering approach (Puppeteer rendering an HTML template to PDF) that produces clean, print-ready documents. The layout handles variable-length line items gracefully — an invoice with 2 line items and one with 20 both look correct, with page breaks falling between line items rather than cutting through them.

Each invoice gets a unique payment link embedded in both a QR code and a clickable URL alongside the bank transfer details. Customers can pay by card online (which Kenji prefers because it settles instantly) or by wire transfer (which enterprise accounting departments prefer because it fits their existing AP workflow). The reference number in the wire transfer instructions matches the invoice number, enabling automatic reconciliation.

### Step 4: Automate Payment Collection and Dunning

Generating invoices is half the battle. Collecting payment is the other half, and the part where Kenji currently burns two full days every month writing individual follow-up emails.

```text
Implement a payment collection workflow. For customers with a card on file, automatically charge via Stripe when the invoice is created. For bank transfer customers, send the invoice with payment instructions and track incoming payments. Build a dunning workflow for failed payments: retry on day 0, send a reminder email on day 3, send an urgent notice on day 7 with a direct payment link, and flag for manual review on day 14. Track all state transitions in an audit log.
```

The first monthly run tells the whole story:

**Auto-charge customers (142 with card on file):**
- 136 successful charges — money in the bank before the customer even opens the invoice email. This alone is a massive improvement over the manual process, where Kenji would send the invoice and then wait for customers to pay on their own schedule.
- 6 entered dunning: 3 expired cards (triggered "update payment method" email with a direct link to the Stripe customer portal), 2 insufficient funds (retry scheduled for day 3 to give time for the customer's account to be replenished), 1 declined (retry scheduled for day 3)

**Bank transfer customers (45):**
- Invoices sent with payment instructions and unique reference numbers
- A matching engine watches for incoming wire transfers by reference number and auto-reconciles them against open invoices

The dunning workflow is a state machine: `issued` to `payment_attempted` to `retry_scheduled` to `reminder_sent` to `urgent_notice` to `manual_review`. Every transition gets logged to an audit table. Day 3 reminders are polite and assume the best. Day 7 notices are direct and include a one-click payment link. Day 14 escalation goes to Kenji's queue for a personal follow-up — by this point, the automated messages have resolved 80% of cases.

### Step 5: Build Financial Reporting

The spreadsheet Kenji used to maintain by hand becomes a set of API endpoints that stay current in real time:

```text
Create a billing dashboard API with these endpoints: GET /api/billing/mrr (monthly recurring revenue with trend), GET /api/billing/outstanding (total unpaid invoices by aging bucket: current, 1-30 days, 31-60 days, 60+ days), GET /api/billing/revenue-by-customer (top 20 customers by revenue with month-over-month change), and GET /api/billing/churn-risk (customers with declining usage or payment failures). Include CSV export for the finance team.
```

The MRR endpoint tracks growth trends week by week, including a breakdown by revenue source (usage vs. subscriptions) so the team can see whether growth is driven by new customers or by existing customers increasing their API usage. The outstanding endpoint breaks unpaid invoices into four aging buckets — current, 1-30 days, 31-60 days, and 60+ days — so Kenji can see at a glance how much money is healthy versus at risk.

The churn-risk endpoint is the one the CEO cares about. It flags customers whose API usage has been declining for two consecutive months or who have had payment failures, surfacing early warning signs that are completely invisible in a spreadsheet. A customer dropping from 100,000 API calls to 50,000 to 20,000 is probably evaluating a competitor — and the sales team wants to know before the customer cancels, not after.

All endpoints support CSV export so the finance team can pull data into their existing reporting tools without changing their workflow.

## Real-World Example

Kenji runs the first automated billing cycle on March 1st. The pipeline processes all 200 customers in 34 seconds, generates 187 invoices with correct tiered calculations, and sends them before he finishes his morning coffee. The 142 card-on-file customers are charged automatically; 136 succeed on the first try.

The dunning workflow handles the 6 failed payments without manual intervention. By day 7, 4 of the 6 have updated their payment methods and been charged successfully. The remaining 2 hit Kenji's manual review queue on day 14 — both turn out to be customers who changed banks and need updated payment details.

The dashboard shows real-time MRR of $47,829 with a 4.2% month-over-month growth trend, $8,200 in outstanding receivables (85% current, 12% under 30 days, 3% over 30 days), and 3 customers flagged for churn risk based on declining usage. Monthly billing goes from 5 days of manual work to a single button press, with zero calculation errors and 15% faster payment collection from the automated reminders. Kenji gets those five days back every month — and the $3,400 undercharging error from last quarter becomes impossible because the tiered pricing math runs in code, not in a spreadsheet formula.
