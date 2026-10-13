---
name: expense-report
description: >-
  Organize, categorize, and summarize business expenses for reimbursement and
  tax preparation. Use when a user asks to create an expense report, organize
  receipts, categorize expenses, summarize spending, prepare expenses for
  reimbursement, or compile business expenses for tax filing. Handles receipts,
  CSV data, and manual entries.
license: Apache-2.0
compatibility: "Requires Python 3.11+ with pandas 3 and openpyxl for spreadsheet generation"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["expense", "report", "finance", "receipts", "tax"]
  use-cases:
    - "Compile a monthly expense report from receipts for reimbursement"
    - "Categorize and summarize annual business expenses for tax preparation"
    - "Analyze spending patterns across expense categories"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Expense Report

## Overview

Organize, categorize, and summarize business expenses into professional reports. This skill processes expense data from receipts, CSV files, or manual entries, categorizes them by type, calculates totals, and generates formatted reports suitable for reimbursement submissions or tax preparation.

## Instructions

When a user asks to create an expense report or organize their expenses, follow these steps:

### Step 1: Collect expense data

Gather expenses from the available sources:

**From a CSV or spreadsheet:**
```python
import pandas as pd

def load_expenses_csv(file_path):
    df = pd.read_csv(file_path)
    df.columns = [col.strip().lower() for col in df.columns]  # date, description, amount, ...
    df["date"] = pd.to_datetime(df["date"])  # needed for the monthly grouping below
    df["amount"] = pd.to_numeric(df["amount"].astype(str).str.replace(r"[$,]", "", regex=True))
    if "category" not in df.columns:
        df["category"] = df["description"].map(categorize_expense)
    return df
```

**From manual entries:**
Prompt the user for each expense or accept a list:
- Date
- Description / Vendor
- Amount
- Category (assign automatically if not provided)
- Payment method (credit card, cash, reimbursable)

**From receipt images or PDFs:**
Extract data using OCR or text extraction, then structure into the same format. Treat OCR output as a draft: confirm amounts and dates with the user.

### Step 2: Categorize expenses

Assign each expense to a standard category from the vendor name and description. Match whole words: plain substring tests misfile "Attorney fees" under Communication (`att`) and "Las Vegas" under Transportation (`gas`).

```python
import re

CATEGORY_RULES = {
    "Travel": ["airline", "airlines", "hotel", "uber", "lyft", "taxi", "flight", "airbnb", "rental car"],
    "Meals": ["restaurant", "cafe", "coffee", "lunch", "dinner", "doordash", "grubhub"],
    "Office Supplies": ["staples", "office depot", "supplies"],
    "Software & Subscriptions": ["github", "aws", "google cloud", "slack", "zoom", "adobe"],
    "Transportation": ["gas", "parking", "toll", "metro", "transit"],
    "Professional Services": ["consulting", "legal", "accounting", "freelance"],
    "Communication": ["phone", "internet", "verizon", "at&t", "t-mobile"],
    "Training & Education": ["course", "conference", "workshop", "udemy", "training"],
}
PATTERNS = {cat: re.compile(r"\b(?:" + "|".join(re.escape(k) for k in kws) + r")\b", re.I)
            for cat, kws in CATEGORY_RULES.items()}

def categorize_expense(description):
    for category, pattern in PATTERNS.items():
        if pattern.search(description):
            return category
    return "Other"
```

Ambiguous vendors (Amazon, Costco, Walmart) cannot be categorized from the name alone: leave them as "Other" and ask the user.

### Step 3: Calculate totals and summaries

```python
def summarize_expenses(df):
    return {
        "total": df["amount"].sum(),
        "by_category": df.groupby("category")["amount"].sum().to_dict(),
        "by_month": {str(p): v for p, v in df.groupby(df["date"].dt.to_period("M"))["amount"].sum().items()},
        "count": len(df),
        "date_range": f"{df['date'].min():%Y-%m-%d} to {df['date'].max():%Y-%m-%d}",
        "avg_per_expense": df["amount"].mean(),
        "largest_expense": df.loc[df["amount"].idxmax()].to_dict(),
    }

def find_duplicates(df):
    return df[df.duplicated(["description", "amount", "date"], keep=False)]
```

### Step 4: Generate the report

**Excel report with multiple sheets** (keep amounts numeric and apply a number format, so the user can still sum and filter in Excel):

```python
def generate_excel_report(df, summary, output_path="expense_report.xlsx"):
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        pd.DataFrame([
            {"Metric": "Total expenses", "Value": summary["total"]},
            {"Metric": "Number of expenses", "Value": summary["count"]},
            {"Metric": "Date range", "Value": summary["date_range"]},
            {"Metric": "Average per expense", "Value": summary["avg_per_expense"]},
        ]).to_excel(writer, sheet_name="Summary", index=False)

        by_cat = sorted(summary["by_category"].items(), key=lambda kv: -kv[1])
        pd.DataFrame(by_cat, columns=["Category", "Total"]).to_excel(writer, sheet_name="By Category", index=False)
        for cell in writer.sheets["By Category"]["B"][1:]:
            cell.number_format = "$#,##0.00"

        df.to_excel(writer, sheet_name="All Expenses", index=False)
    return output_path
```

**Markdown summary for quick review:**

```python
def generate_markdown_summary(summary):
    lines = [
        "# Expense Report Summary",
        f"**Period:** {summary['date_range']}",
        f"**Total Expenses:** ${summary['total']:,.2f}",
        f"**Number of Items:** {summary['count']}",
        "",
        "## By Category",
    ]
    for cat, amt in sorted(summary["by_category"].items(), key=lambda kv: -kv[1]):
        lines.append(f"- **{cat}:** ${amt:,.2f} ({amt / summary['total'] * 100:.1f}%)")
    return "\n".join(lines)
```

### Step 5: Present results and flag issues

Display the summary and flag any potential issues:
- Expenses missing receipts
- Unusually large individual expenses
- Expenses outside the reporting period
- Duplicate entries (same vendor, amount, and date)

## Examples

### Example 1: Monthly expense report from CSV

**User request:** "Create an expense report from my expenses.csv file for January"

**Actions taken:**
1. Load and parse expenses.csv
2. Filter to January entries
3. Auto-categorize 34 expenses
4. Generate summary and Excel report

**Output:**
```
Expense Report: January 2026
=============================
Total Expenses: $4,287.50
Number of Items: 34
Average per Expense: $126.10

By Category:
  Travel:                   $1,850.00 (43.1%)
  Software & Subscriptions:   $680.00 (15.9%)
  Meals:                     $542.30 (12.7%)
  Office Supplies:            $418.20 (9.8%)
  Transportation:             $365.00 (8.5%)
  Professional Services:      $320.00 (7.5%)
  Other:                      $112.00 (2.6%)

Top 3 Expenses:
  1. $890.00 - Delta Airlines (Jan 15)
  2. $520.00 - Marriott Hotel (Jan 15-16)
  3. $320.00 - Legal consultation (Jan 22)

Flags:
  - 2 potential duplicates found (review recommended)
  - 3 expenses over $200 may require manager approval

Report saved: expense_report_jan_2026.xlsx
```

### Example 2: Annual tax expense summary

**User request:** "Summarize all my business expenses from 2025 for tax filing"

**Actions taken:**
1. Load expense data for full year
2. Categorize using IRS Schedule C categories
3. Generate annual summary with monthly breakdown

**Output:**
```
Annual Expense Summary: 2025
============================
Total Business Expenses: $48,320.75

IRS Schedule C Categories:
  Advertising:                  $3,200.00
  Car & Truck Expenses:         $4,850.00
  Contract Labor:               $8,400.00
  Insurance:                    $2,160.00
  Office Expenses:              $5,680.00
  Supplies:                     $2,340.00
  Travel:                      $12,450.00
  Meals (50% deductible):       $4,280.75
  Utilities:                    $1,920.00
  Other:                        $3,040.00

Monthly Trend:
  Highest month: November ($6,420)
  Lowest month: August ($2,180)

Report saved: annual_expenses_2025.xlsx
```

### Example 3: Organize receipts from a business trip

**User request:** "I just got back from a conference in Chicago. Organize these receipts: flights $450, hotel 3 nights $180/night, Uber rides $85, meals $220, conference ticket $399"

**Output:**
```
Business Trip Expense Report: Chicago Conference
=================================================
Total: $1,694.00

Expenses:
  Date       | Category      | Description           | Amount
  ---------- | ------------- | --------------------- | --------
  [Trip]     | Travel        | Round-trip flights     | $450.00
  [Trip]     | Travel        | Hotel (3 nights)       | $540.00
  [Trip]     | Transportation| Uber rides             | $85.00
  [Trip]     | Meals         | Meals during trip      | $220.00
  [Trip]     | Training      | Conference registration| $399.00

Summary:
  Travel & Lodging:   $990.00 (58.4%)
  Meals:              $220.00 (13.0%)
  Training:           $399.00 (23.6%)
  Transportation:      $85.00 (5.0%)

Note: Fill in specific dates for each expense before submitting.
Report saved: trip_expense_chicago.xlsx
```

## Guidelines

- Auto-categorize expenses by default but allow the user to override categories.
- Always flag potential duplicates (same vendor, amount, and date within 1 day).
- Keep entertainment separate from meals: entertainment is generally not deductible in the US, and business meals are generally 50% deductible. Rules change, so point the user to the current IRS Publication 463 and Schedule C instructions.
- Use standard business expense categories that align with common reimbursement policies and IRS Schedule C.
- For tax reports, note which categories have special deduction rules (e.g., meals at 50%).
- Format all currency amounts consistently with two decimal places.
- When generating Excel reports, include a summary sheet, category breakdown, and full detail sheet.
- Date formats should be consistent. Parse and normalize dates from various input formats.
- Never assume tax rates or reimbursement policies. Present the data and let the user or their accountant make tax decisions.
- Install the libraries in a virtual environment: `python -m venv .venv && .venv/bin/pip install pandas openpyxl`. pandas 3 needs Python 3.11 or newer.
- Receipts hold personal data (card numbers, addresses): keep report files out of shared folders and version control.
