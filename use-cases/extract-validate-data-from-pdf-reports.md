---
title: "Extract and Validate Structured Data from PDF Financial Reports"
slug: extract-validate-data-from-pdf-reports
description: "Pull tables and fields from PDF reports into validated datasets, catching formatting errors and missing values before they reach your database."
skills:
  - table-extractor
  - data-extractor
  - data-validator
category: data-ai
tags:
  - pdf-extraction
  - data-validation
  - table-extraction
  - etl
  - financial-data
---

# Extract and Validate Structured Data from PDF Financial Reports

## The Problem

An accounting firm processes 150 PDF financial statements per month from clients who send quarterly reports in different formats. Each PDF contains balance sheets, income statements, and cash flow tables that need to be extracted into a standardized Excel format for analysis. Currently, two junior analysts spend three days per month retyping numbers from PDFs. Transposed digits, missed rows and wrong decimal places creep in, and those errors compound through downstream tax calculations and audit reports, causing expensive corrections weeks later.

## The Solution

Using the **table-extractor**, **data-extractor**, and **data-validator** skills, the workflow extracts tables from text-based PDFs with Camelot, pulls non-tabular fields (company name, reporting period, currency) with pdfplumber-based text extraction, and runs validation checks on every extracted value so errors are caught before they enter the accounting system.

Camelot reads PDFs that contain a text layer. For scanned reports, run `ocrmypdf` first and spot-check the numbers, because OCR is where digits get misread.

## Step-by-Step Walkthrough

### 1. Extract tables from the PDF financial statements

Install the tools in a virtual environment (Camelot 1.0 and later render pages with pdfium, so Ghostscript is not required):

```console
$ python -m venv .venv && .venv/bin/pip install camelot-py pandas openpyxl pdfplumber
```

> Extract all tables from the 12 PDF files in ./client_reports/q3/. Use the lattice flavor for bordered tables and fall back to stream for borderless ones. Save each table as {company}_{table_number}.csv, and print the page, shape and accuracy of every table so I can see which ones need review.

The core call is:

```python
import camelot

tables = camelot.read_pdf("acme_q3.pdf", pages="all", flavor="lattice")
if len(tables) == 0:
    tables = camelot.read_pdf("acme_q3.pdf", pages="all", flavor="stream")
for i, t in enumerate(tables, start=1):
    print(i, t.page, t.shape, f"{t.accuracy:.0f}%")
    t.df.to_csv(f"acme_{i}.csv", index=False)
```

Camelot returns each table as a DataFrame whose columns are numbered 0, 1, 2 and whose first row usually holds the header. Statements with multi-line headers, merged cells or subtotal rows need cleaning afterwards: promote the header row, join wrapped lines, and forward-fill spanning labels. A low `accuracy` or a table that comes back with the wrong number of columns goes on the manual-review list.

### 2. Extract metadata and non-tabular fields

Pull the fields that sit outside tables: company name, fiscal year end, reporting currency, auditor and report date.

> For each PDF, read the text with pdfplumber and extract company_name, fiscal_year_end, reporting_currency, auditor_name and report_date into one JSON file per document. Reports phrase the period differently ("Year Ended December 31, 2025", "FY2025", "12 months to 31/12/2025"): convert every date to ISO 8601 and report the original wording next to it. If a field is not found, write null. Never guess.

This is pattern matching over extracted text, so list the expected phrasings, convert each date explicitly, and leave a field `null` when nothing matches. A `null` is a visible gap; a guessed value is a hidden error.

### 3. Validate the extracted data

Parse every amount into a number first. Statements print negatives in parentheses, and thousands separators differ by locale, so a naive conversion turns a European "2.300" into 2.3:

```python
import re

def to_number(cell: str) -> float | None:
    s = cell.strip().replace("$", "").replace(" ", "")
    if not s or s in {"-", "—"}:
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None          # unparseable: report it, do not guess
    return -float(s) if negative else float(s)
```

A cell that returns `None` is reported as an error instead of being converted. Then run the checks, with the data-validator skill's approach of hard failures versus warnings:

> Validate the extracted data. Errors: total assets must equal total liabilities plus equity (tolerance 0.01%); no null in an amount column; every amount parses to a number; net income on the income statement matches net income at the top of the cash flow statement. Warnings: year-over-year change above 200% on any line; negative values in lines that are normally positive (such as accounts receivable); mixed currency labels across pages. Write one report per company with severity, page, row and the values compared.

For the balance check, the code is short:

```python
diff = assets - (liabilities + equity)
if abs(diff) / assets > 0.0001:
    errors.append(f"Balance sheet imbalance: assets {assets:,.0f} vs "
                  f"liabilities+equity {liabilities + equity:,.0f} (diff {diff:,.0f})")
```

A report for one company then reads:

```text
VALIDATION REPORT: Acme Corp Q3
Status: 3 errors, 2 warnings

ERRORS
  [E01] Balance sheet imbalance (page 4)
        Assets 14,892,341 vs liabilities + equity 14,829,341, diff 63,000 (0.42%)
  [E02] Net income mismatch (income statement vs cash flow statement)
        8,234,576 vs 8,234,567, diff 9: likely a transposed digit
  [E03] Null in amount column (page 6): "Other current liabilities" is blank

WARNINGS
  [W01] Year-over-year change over 200%: R&D expenses 120,000 -> 480,000
  [W02] Negative value in "Accounts receivable": -3,200
```

Cross-checks catch what reading each table alone cannot: a transposed digit that looks plausible on the page fails against the matching figure in another statement.

### 4. Generate the standardized output with an error report

Combine the validated tables and metadata into one workbook:

> Write one Excel workbook with a sheet per company and a "Validation Results" sheet listing every error and warning grouped by company and severity. Mark any cell the cleaning step changed (stripped spaces, converted parentheses to negatives) and highlight cells with errors in red and warnings in yellow, using openpyxl.

```python
from openpyxl.styles import PatternFill

RED = PatternFill("solid", fgColor="FFC7CE")
YELLOW = PatternFill("solid", fgColor="FFEB9C")
ws["B12"].fill = RED          # a cell with a validation error
```

Analysts then review the flagged cells instead of rechecking every number.

For clients who send the same layout every quarter, keep their extraction settings (flavor, pages, and `table_areas` for the table regions) in a small JSON file per client and pass them to `camelot.read_pdf`. Each run then skips the trial-and-error step.

## Real-World Example

A mid-size accounting firm with about 150 client PDFs per quarter pilots this pipeline on one batch. In the firm's own run, Camelot reads most tables correctly on the first pass; the rest, with rotated headers or nested sub-tables, go to the manual-review list. The validator flags a revenue line where a European-formatted "2.300.000" had been read as 2.3, and a balance sheet that is off by exactly one transposed digit. Both would have survived a visual skim because each table looks right on its own.

The analysts' job changes from retyping to reviewing the flagged cells, and the quarterly batch no longer takes half a week of data entry.

## Related Skills

- [table-extractor](../skills/table-extractor/SKILL.md) — Camelot table extraction from text-based PDFs
- [data-extractor](../skills/data-extractor/SKILL.md) — pdfplumber, python-docx and pattern-based field extraction
- [data-validator](../skills/data-validator/SKILL.md) — data quality checks, schema and anomaly validation
