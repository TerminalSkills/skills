---
title: "Automate Freelancer Billing and Expense Tracking"
slug: automate-freelancer-billing-and-expense-tracking
description: "Build an end-to-end system that tracks billable hours, generates invoices, and categorizes expenses for independent consultants."
skills:
  - billing-automation
  - expense-report
category: business
tags:
  - freelancing
  - invoicing
  - expenses
  - billing
---

# Automate Freelancer Billing and Expense Tracking

## The Problem

A freelance software consultant works with 8 clients simultaneously on hourly and fixed-rate contracts. At the end of each month she spends an entire Sunday creating invoices in a spreadsheet, cross-referencing time logs from three different tools, working out which clients need tax on their invoice, and manually categorizing 60-80 business expenses. She once missed billing a client for 12 hours because the time entry was in Toggl but the invoice was built from her calendar. Her accountant also flagged that her expense categories are inconsistent from month to month.

## The Solution

Using **billing-automation** to consolidate time entries into billable line items and render invoice PDFs, and **expense-report** to categorize and summarize business expenses, the consultant replaces most of the monthly admin with a run she reviews instead of builds. The agent does the arithmetic and the bookkeeping. Tax rates, tax wording on invoices and which expenses are deductible come from her accountant and her tax authority, and she supplies them as input files; the agent does not decide them.

## Step-by-Step Walkthrough

### 1. Consolidate billable hours from multiple sources

Pull time entries from different tools into one billing ledger. Export each source to CSV first (Toggl Track reports, a calendar export of events tagged "billable", and the manual log), so the run is repeatable and nothing depends on a live API session.

> Use billing-automation to merge /data/toggl.csv, /data/calendar_billable.csv and /data/time_log.csv. Reconcile overlapping entries (same client, overlapping time range), flag any day with more than 10 billable hours for review, and compute totals per client. Apply the rates in /data/clients.csv: Acme Corp 175/hr, Beta Labs 200/hr, Gamma Inc fixed 8000/month. Write the billing summary to /billing/2026-02/summary.csv.

Keep amounts as `Decimal` (or integer cents), never floats; the skill's `calculate_invoice` helper does this.

### 2. Generate invoices

Produce a PDF invoice per client. The tax treatment of each client is data, not something the agent infers from a state name.

> Use billing-automation to create February 2026 invoices for all 8 clients from /billing/2026-02/summary.csv. For each client read `tax_rate` and `tax_note` from /data/tax_rules.csv (my accountant fills this in; an empty rate means no tax line). Each invoice has my business details, a sequential invoice number starting at INV-2026-0023 with no gaps, itemized time entries with dates and descriptions, payment terms Net 15 and bank transfer details. Save PDFs to /invoices/2026-02/ and never overwrite an issued invoice: correct a mistake with a credit note.

The batch summary (tax lines appear only where tax_rules.csv sets a rate):

```text
Invoice Generation - February 2026
==================================
INV-2026-0023  Acme Corp         42.5 hrs x 175   7,437.50
INV-2026-0024  Beta Labs         38.0 hrs x 200   7,600.00
INV-2026-0025  Gamma Inc         fixed            8,000.00
INV-2026-0026  Delta Health      28.0 hrs x 175   4,900.00
INV-2026-0027  Epsilon UK        35.0 hrs x 200   7,000.00
INV-2026-0028  Zeta Finance      22.0 hrs x 200   4,400.00
INV-2026-0029  Eta Robotics      31.0 hrs x 175   5,425.00
INV-2026-0030  Theta Ventures    19.5 hrs x 200   3,900.00

Subtotal: 48,662.50 before any tax lines
PDFs saved: /invoices/2026-02/ (8 files)
```

### 3. Categorize and summarize monthly expenses

> Use expense-report to process /data/february_transactions.csv (73 rows). Categorize each row with the skill's whole-word rules, extended with GitHub, AWS and Figma under Software & Subscriptions and conference tickets under Training & Education. Leave ambiguous vendors as "Other" and list them for me. Flag every expense over 500 for receipt verification, list possible duplicates, and write monthly totals by category plus a year-to-date column to /expenses/2026-02.xlsx.

Treat the categories as bookkeeping labels. Whether an item is deductible, and in what proportion (home office, meals), is a question for the tax authority's rules and the accountant: in the US, start from the IRS guidance, for example [Publication 334](https://www.irs.gov/publications/p334) (Tax Guide for Small Business; the IRS discontinued Publication 535 after its 2022 revision) for business expenses and [Publication 463](https://www.irs.gov/publications/p463) for travel and meals, and apply the percentages the accountant gives you.

### 4. Produce a monthly snapshot for the accountant

> Combine /billing/2026-02/summary.csv and /expenses/2026-02.xlsx into a monthly snapshot: revenue per client, expenses by category, revenue minus expenses, year-to-date totals, and the top 3 clients by revenue. List invoices from earlier months that are still unpaid, using /data/payments.csv. Export a PDF and a CSV for the accountant. Do not estimate tax; the accountant uses these totals for that.

## Real-World Example

The consultant ran her first automated cycle on March 1st with her own February exports. The merge surfaced 4 overlapping entries that would have been billed twice, and the expense run left 9 vendors as "Other" for her to label. She reviewed 8 draft invoices and the summary before sending anything, and the accountant received a consistent category list instead of free-text labels. The Sunday session became a review of generated files rather than building them by hand.

## Tips

- Export time data on the last day of the month, and re-export before invoicing if you edited entries late.
- Keep a separate CSV for manual entries that fit no tracker, such as short calls or travel time.
- Keep the invoice number sequence gap-free and never reuse a number; void with a credit note instead of deleting.
- Review the expense category rules each quarter, and update `tax_rules.csv` whenever your accountant changes a client's treatment.

## Related Skills

- [billing-automation](/skills/billing-automation)
- [expense-report](/skills/expense-report)
