---
title: "Build Automated Payroll Calculation and Reporting with AI"
slug: build-automated-payroll-calculation
description: "Use AI to calculate payroll from timesheets, apply tax rules, and generate pay stubs and summary reports."
skills: [excel-processor, report-generator, template-engine]
category: business
tags: [payroll, reporting, spreadsheet, automation, finance]
---

# Build Automated Payroll Calculation and Reporting with AI

## The Problem

Payroll seems simple until you do it at scale. A 30-person digital agency tracks hours in spreadsheets — five different spreadsheets, one per department, each with slightly different column names and formatting. The design team's sheet uses "Hours" while engineering uses "Hrs Worked" and operations uses "Time (h)." Same data, three different labels.

Every two weeks the office manager spends an entire day copying timesheet data into a payroll template, manually calculating overtime, cross-referencing tax withholding elections from yet another spreadsheet, and generating individual pay stubs as PDFs in Word. One misplaced decimal means an underpayment that erodes trust — or an overpayment that's awkward to claw back. Last month, a decimal error caused an $800 underpayment that took a week of back-and-forth to resolve.

The reconciliation between five spreadsheets is where most errors creep in: a row gets skipped during copy-paste, overtime gets calculated against the wrong week boundary (the pay period spans two calendar weeks, and the 40-hour threshold applies per week, not per period), a new hire's tax election doesn't get picked up because their W-4 was filed after the spreadsheet was created. The team has grown from 10 to 30 people in a year, and the manual approach that worked at 10 is visibly breaking at 30.

## The Solution

Using the **excel-processor**, **report-generator**, and **template-engine** skills, the workflow ingests timesheets from multiple spreadsheets regardless of formatting differences, normalizes them into a single clean dataset, flags anomalies before any calculation runs, computes gross pay with per-week overtime, applies tax withholdings and benefit deductions from each employee's elections, generates individual PDF pay stubs, and produces a company-wide payroll summary — all from a single command in under three minutes.

## Step-by-Step Walkthrough

### Step 1: Ingest and Normalize Timesheets

Start by pointing at the raw data:

```text
Read all .xlsx files in the /payroll/timesheets-jan-15/ folder. Each file has columns for employee name, date, hours worked, and project code. Merge them into a single table and flag any rows with missing data or hours over 16 in a day.
```

The agent parses each file, maps different column names to a standard schema (Hours, Hrs Worked, and Time (h) all become `hours_worked`), and merges everything into a single dataset:

**Merged timesheet:** 30 employees, 420 rows (14 working days x 30 employees)

**Flagged issues:**
- Row 87: Marta Oliveira, Jan 9 — 18 hours logged (exceeds 16h threshold, likely a data entry error — intended 8?)
- Row 203: Tomas Ferreira, Jan 12 — missing project code (hours logged but no project allocation)
- Row 341: New hire Yuki Tanaka — first timesheet, W-4 election not found in salary file (needs to be added)

The flags surface problems before any calculation runs. That 18-hour entry would have silently become 2 hours of overtime pay nobody questioned — a $90 error per pay period, $2,340 per year if it recurred. The missing W-4 for the new hire would have caused either zero tax withholding (compliance problem) or a default rate that doesn't match their election (trust problem). Both caught before a single dollar is calculated.

### Step 2: Calculate Gross Pay and Overtime

```text
Using the merged timesheet and the salary table in /payroll/salary-rates.xlsx, calculate gross pay for each employee. Apply 1.5x for hours over 40 per week. Output a summary table.
```

The calculation handles the tricky parts — weekly overtime thresholds that span the pay period boundary, hourly vs. salaried employees, and rate lookups from the salary table:

**Payroll Period: Jan 1-15, 2025**

| Employee | Regular Hours | OT Hours | Regular Pay | OT Pay | Gross Pay |
|----------|--------------|----------|-------------|--------|-----------|
| Marta Oliveira | 80.0 | 6.5 | $4,800.00 | $585.00 | $5,385.00 |
| Tomas Ferreira | 76.0 | 0.0 | $3,800.00 | $0.00 | $3,800.00 |
| Lena Nowak | 80.0 | 3.0 | $5,200.00 | $390.00 | $5,590.00 |
| Yuki Tanaka | 64.0 | 0.0 | $3,200.00 | $0.00 | $3,200.00 |
| ... (26 more) | ... | ... | ... | ... | ... |

All 30 employees computed. Overtime is calculated per-week, not averaged across the two-week pay period — a common mistake in manual payroll that's surprisingly hard to catch. If Marta worked 46.5 hours in week 1 and 40 hours in week 2, she gets 6.5 hours of overtime. Averaging the two weeks gives 43.25 hours per week, which looks like only 3.25 hours of overtime per week or 6.5 total — same number by coincidence in this case, but in general, averaging across weeks systematically underpays employees with uneven schedules and creates legal liability under FLSA rules.

The calculation also handles edge cases that trip up manual processing: employees who started mid-period (Yuki joined Jan 6 and only has 8 working days), salaried employees who don't earn overtime, and the holiday on Jan 1 which some departments track as PTO and others don't.

### Step 3: Apply Deductions and Compute Net Pay

```text
Apply federal tax withholding based on each employee's W-4 data in /payroll/w4-elections.xlsx. Deduct health insurance premiums from /payroll/benefits.xlsx. Calculate net pay for each employee.
```

Each employee's deductions come from their specific elections — filing status, allowances, dependents, and benefit tier:

| Employee | Gross Pay | Federal Tax | State Tax | Health Ins | 401k | Net Pay |
|----------|-----------|-------------|-----------|------------|------|---------|
| Marta Oliveira | $5,385.00 | $861.60 | $269.25 | $245.00 | $269.25 | $3,739.90 |
| Tomas Ferreira | $3,800.00 | $570.00 | $190.00 | $245.00 | $190.00 | $2,605.00 |
| Lena Nowak | $5,590.00 | $894.40 | $279.50 | $380.00 | $279.50 | $3,756.60 |
| Yuki Tanaka | $3,200.00 | $480.00 | $160.00 | $245.00 | $0.00 | $2,315.00 |
| ... | ... | ... | ... | ... | ... | ... |

The W-4 lookups and benefit deductions are the most error-prone step in manual payroll — three different source files, each with its own format and its own update cycle. The agent joins them by employee ID, not by name, so a "Marta Oliveira" in one sheet and "M. Oliveira" in another still match correctly. Any employee whose ID appears in the timesheet but not in the W-4 file gets flagged immediately (like Yuki above) rather than silently defaulting.

### Step 4: Generate Individual Pay Stubs

```text
Using the pay stub template in /payroll/templates/pay-stub.html, generate a PDF pay stub for each employee. Save them to /payroll/output/stubs/jan-15/.
```

Thirty PDF pay stubs render in under 10 seconds. Each one is a clean, professional document containing:

- Pay period dates and payment date
- Gross pay breakdown: regular hours and rate, overtime hours and rate (at 1.5x), listed separately
- Itemized deductions: federal tax, state tax, health insurance, 401k contribution
- Net pay (the number on the check)
- Year-to-date totals for gross pay, each deduction category, and net pay

The template engine fills in each employee's data from the calculated results — no copy-paste, no formatting errors, no accidentally putting Marta's numbers on Tomas's stub. Each stub is saved as `jan-15-marta-oliveira.pdf` for easy distribution.

### Step 5: Produce the Payroll Summary Report

```text
Generate a payroll summary report showing total gross, total deductions by category, total net pay, and a department-level breakdown. Save as PDF and Excel.
```

The summary gives the operations and finance teams a single-page view of the entire pay period:

**Payroll Summary — Jan 1-15, 2025**

| Category | Amount |
|----------|--------|
| Total Gross Pay | $142,650.00 |
| Total Federal Tax | $22,824.00 |
| Total State Tax | $7,132.50 |
| Total Health Insurance | $7,350.00 |
| Total 401k Contributions | $5,412.00 |
| **Total Net Pay** | **$99,931.50** |

**Department Breakdown:**

| Department | Headcount | Gross Pay | OT Pay | Net Pay |
|------------|-----------|-----------|--------|---------|
| Engineering | 12 | $68,400.00 | $4,680.00 | $48,120.00 |
| Design | 6 | $31,200.00 | $1,170.00 | $22,260.00 |
| Operations | 12 | $43,050.00 | $2,340.00 | $29,551.50 |

Both PDF (for the finance team to review and archive) and Excel (for import into QuickBooks or Xero) versions are generated. The Excel version includes formulas linking to the source data so the numbers can be audited cell by cell — not just flat values that require trust. If someone questions why the Engineering department's overtime is higher than last period, they can trace it from the summary to individual employees to specific timesheet entries.

The summary also serves as the input for the agency's monthly financial reporting, replacing another manual step where someone would re-aggregate payroll numbers into the P&L spreadsheet.

## Real-World Example

Rui manages operations at the 30-person digital agency. Payroll day used to consume eight hours: copying numbers between five spreadsheets with different column names, double-checking overtime math by hand, cross-referencing tax elections from a file that was last updated "sometime in Q3," and generating pay stubs one at a time in Word by replacing placeholder text. Last month, a decimal error caused an $800 underpayment that took a week to resolve and damaged trust with the employee.

Now Rui drops the timesheet files into a folder and runs one command. The agent flags three anomalies — an 18-hour day (data entry error), a missing project code, and a new hire without a W-4 on file. Rui corrects the 18-hour entry to 8, assigns the missing project code, and adds Yuki's W-4 data. The agent calculates gross and net pay for all 30 employees, generates 30 PDF pay stubs, and produces the summary report in under three minutes.

Errors dropped to zero in the first quarter because anomalies get caught before any calculation runs — not after someone notices their paycheck is wrong. The eight-hour payroll day became a 30-minute review session, and Rui has reclaimed a full day every two weeks.

The best part: when the agency hires employee 31, 32, and 33, the process doesn't get slower. It's the same single command whether the team is 30 people or 60. The manual approach that broke at 30 would have been impossible at 60 — but the automated pipeline scales linearly with headcount, adding about 10 seconds per new employee.
