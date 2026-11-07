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

Every pay period the office manager spends an entire day copying timesheet data into a payroll template, manually calculating overtime, cross-referencing tax withholding elections (Form W-4) from yet another spreadsheet, and generating individual pay stubs as PDFs in Word. One misplaced decimal means an underpayment that erodes trust — or an overpayment that's awkward to claw back. Last month, a decimal error caused an $800 underpayment that took a week of back-and-forth to resolve.

The reconciliation between five spreadsheets is where most errors creep in: a row gets skipped during copy-paste, overtime gets calculated against the wrong week boundary (the pay period spans parts of three workweeks, and the 40-hour threshold applies per workweek, not per pay period), a new hire's tax election doesn't get picked up because their W-4 was filed after the spreadsheet was created. The team has grown from 10 to 30 people in a year, and the manual approach that worked at 10 is visibly breaking at 30.

## The Solution

Using the **excel-processor**, **report-generator**, and **template-engine** skills, the workflow ingests timesheets from multiple spreadsheets regardless of formatting differences, normalizes them into a single clean dataset, flags anomalies before any calculation runs, computes gross pay with per-week overtime, applies tax withholdings and benefit deductions from each employee's elections, generates individual PDF pay stubs, and produces a company-wide payroll summary — all from one prompt-driven run.

## Step-by-Step Walkthrough

### Step 1: Ingest and Normalize Timesheets

Start by pointing at the raw data:

```text
Read all .xlsx files in the /payroll/timesheets-jan-15/ folder. Each file has columns for employee name, date, hours worked, and project code. Merge them into a single table and flag any rows with missing data or hours over 16 in a day. Use pandas, with the column-name mapping written down in one place.
```

The agent parses each file, maps different column names to a standard schema (Hours, Hrs Worked, and Time (h) all become `hours_worked`), and merges everything into a single dataset:

**Merged timesheet:** 30 employees, 318 rows (one row per employee per worked day, Jan 1-15 with the Jan 1 holiday excluded)

**Flagged issues:**
- Row 87: Marta Oliveira, Jan 9 — 18 hours logged (exceeds 16h threshold, likely a data entry error — intended 8?)
- Row 203: Tomas Ferreira, Jan 12 — missing project code (hours logged but no project allocation)
- Row 301: New hire Yuki Tanaka — first timesheet, W-4 election not found in salary file (needs to be added)

The flags surface problems before any calculation runs. An 18-hour entry that should have been 8 would silently become paid overtime nobody questioned, and a missing W-4 would leave the new hire's withholding to a guess. Both are caught before a single dollar is calculated.

### Step 2: Calculate Gross Pay and Overtime

```text
Using the merged timesheet and the salary table in /payroll/salary-rates.xlsx, calculate gross pay for each employee. Apply 1.5x for hours over 40 in each workweek (the week starts on Monday). Treat salaried employees marked exempt in the salary table as no-overtime. Output a summary table.
```

The calculation handles the tricky parts — weekly overtime thresholds that cross the pay period boundary, hourly vs. salaried employees, and rate lookups from the salary table:

**Payroll Period: Jan 1-15 (example data)**

| Employee | Regular Hours | OT Hours | Regular Pay | OT Pay | Gross Pay |
|----------|--------------|----------|-------------|--------|-----------|
| Marta Oliveira | 80.0 | 6.5 | $4,800.00 | $585.00 | $5,385.00 |
| Tomas Ferreira | 76.0 | 0.0 | $3,800.00 | $0.00 | $3,800.00 |
| Lena Nowak | 80.0 | 3.0 | $5,200.00 | $390.00 | $5,590.00 |
| Yuki Tanaka | 64.0 | 0.0 | $3,200.00 | $0.00 | $3,200.00 |
| ... (26 more) | ... | ... | ... | ... | ... |

All 30 employees computed. Overtime is calculated per workweek, never averaged across the two-week pay period. The U.S. Department of Labor states that overtime is due at not less than one and one-half times the regular rate for hours over 40 in a workweek, that a workweek is a fixed, recurring 168-hour period (it need not match the calendar week), and that averaging hours over two or more weeks is not permitted ([DOL Fact Sheet #23](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay)). If Marta worked 46.5 hours in week 1 and 40 in week 2, week 1 has 6.5 overtime hours and week 2 has none; if she had worked 36 in week 2, averaging would wrongly erase the overtime.

Edge cases the agent handles: employees who started mid-period (Yuki joined Jan 6 and has 8 working days), salaried employees the table marks exempt, and the Jan 1 holiday that some departments track as PTO and others do not. Whether a salaried employee is exempt depends on legal tests, not on being salaried: a fixed salary for a regular workweek longer than 40 hours does not by itself discharge the overtime obligation (same DOL fact sheet), so confirm exemptions with your payroll adviser before they go into the table.

### Step 3: Apply Deductions and Compute Net Pay

```text
Read each employee's Form W-4 data from /payroll/w4-elections.xlsx and the withholding amounts from /payroll/withholding.xlsx (exported from your payroll provider or computed by your accountant). Deduct health insurance premiums from /payroll/benefits.xlsx. Calculate net pay for each employee.
```

Each employee's deductions come from their specific elections: the withholding amounts, the benefit tier and the 401(k) deferral. The figures below are example data, not a tax calculation:

| Employee | Gross Pay | Federal Tax | State Tax | Health Ins | 401k | Net Pay |
|----------|-----------|-------------|-----------|------------|------|---------|
| Marta Oliveira | $5,385.00 | $861.60 | $269.25 | $245.00 | $269.25 | $3,739.90 |
| Tomas Ferreira | $3,800.00 | $570.00 | $190.00 | $245.00 | $190.00 | $2,605.00 |
| Lena Nowak | $5,590.00 | $894.40 | $279.50 | $380.00 | $279.50 | $3,756.60 |
| Yuki Tanaka | $3,200.00 | $480.00 | $160.00 | $245.00 | $0.00 | $2,315.00 |
| ... | ... | ... | ... | ... | ... | ... |

The agent does not invent tax rules: federal income tax withholding follows the IRS methods in [Publication 15-T](https://www.irs.gov/forms-pubs/about-publication-15-t), driven by the employee's Form W-4 ([IRS](https://www.irs.gov/forms-pubs/about-form-w-4)), and state rules come from the state's own revenue agency. Use your payroll provider's or accountant's withholding output as the input here, and have the agent only join and total it. The three source files are joined by employee ID, not by name, so "Marta Oliveira" and "M. Oliveira" still match. Any employee whose ID appears in the timesheet but not in the W-4 file is flagged and held out of the run (like Yuki) rather than silently defaulting; Yuki's row above is shown once the W-4 has been added.

### Step 4: Generate Individual Pay Stubs

```text
Using the pay stub template in /payroll/templates/pay-stub.html, generate a PDF pay stub for each employee (Jinja2 fills the HTML, WeasyPrint renders the PDF). Save them to /payroll/output/stubs/jan-15/.
```

Thirty PDF pay stubs are rendered, one per employee. Each contains:

- Pay period dates and payment date
- Gross pay breakdown: regular hours and rate, overtime hours and rate (at 1.5x), listed separately
- Itemized deductions: federal tax, state tax, health insurance, 401k contribution
- Net pay (the number on the check)
- Year-to-date totals for gross pay, each deduction category, and net pay

Check your state's pay-stub rules with the state labor agency; they differ by state.

Each stub is filled from the calculated results, so there is no copy-paste between employees. Each stub is saved as `jan-15-marta-oliveira.pdf` for easy distribution.

### Step 5: Produce the Payroll Summary Report

```text
Generate a payroll summary report showing total gross, total deductions by category, total net pay, and a department-level breakdown. Save as PDF and Excel.
```

The summary gives the operations and finance teams a single-page view of the entire pay period:

**Payroll Summary — Jan 1-15 (example data)**

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

The PDF is for the finance team to review and archive. The Excel version is written with openpyxl, with SUM formulas for the totals and the per-employee rows on a separate sheet, so the numbers can be audited cell by cell. If someone questions why the Engineering department's overtime is higher than last period, they can trace it from the summary to individual employees to specific timesheet entries.

The summary also serves as the input for the agency's monthly financial reporting, replacing another manual step where someone would re-aggregate payroll numbers into the P&L spreadsheet.

## Real-World Example

Rui manages operations at a 30-person digital agency (an invented team). Payroll day used to take eight hours: copying numbers between five spreadsheets with different column names, double-checking overtime by hand and generating pay stubs one at a time in Word.

Now Rui drops the timesheet files into a folder and runs the workflow. The agent flags three anomalies: an 18-hour day, a missing project code and a new hire without a W-4 on file. Rui corrects the entry, assigns the code and adds Yuki's W-4 data. The agent then calculates gross and net pay for all 30 employees, generates 30 PDF pay stubs and produces the summary report. Rui reviews the output and compares the totals with the payroll provider's register before anything is paid; the agent prepares the numbers, a person approves them.

## Related Skills

- [excel-processor](/skills/excel-processor)
- [report-generator](/skills/report-generator)
- [template-engine](/skills/template-engine)
