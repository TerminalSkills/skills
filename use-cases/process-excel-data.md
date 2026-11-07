---
title: "Transform Messy Spreadsheets Into Business Intelligence and Save 20 Hours Weekly"
slug: process-excel-data
description: "Clean, analyze, and automate complex Excel data processing to eliminate manual work and generate actionable business insights."
skills: [excel-processor, data-analysis, report-generator]
category: data-ai
tags: [excel, spreadsheet, data-cleaning, automation, reporting]
---

# Transform Messy Spreadsheets Into Business Intelligence and Save 20 Hours Weekly

## The Problem

Every Monday, Ana at a 67-person manufacturing company faces the same job: 23 Excel files from different departments, each with its own conventions, merged header cells and subtotal rows pasted into the data. Sales writes dates as mm/dd/yyyy, Operations as dd-mm-yyyy. Product codes appear as "SKU-001", "SKU_001" and "SKU 001". The same customer shows up as "ACME Corp", "Acme Corporation" and "ACME Corp.", and phone numbers come as "(555) 123-4567", "555.123.4567" and "5551234567".

Combining it all by hand takes about 20 hours a week, and the result is a few days old by the time leadership sees it. Duplicate customers also inflate every per-customer number she reports. Those 20 hours are the example team's own estimate; the point is that the work is mechanical, repeatable and error-prone, which is what a script is for.

## The Solution

Three skills split the work:

- **excel-processor** loads every workbook with pandas, standardizes columns, dates, phones and codes, drops duplicates and writes clean `.xlsx` output.
- **data-analysis** profiles the merged table, finds outliers, and computes the trends and customer concentration.
- **report-generator** turns the results into a self-contained HTML (or PDF) report that is rebuilt on a schedule.

Everything runs as Python with `pandas` and `openpyxl` (pandas 3.x, Python 3.11+). The agent works on copies and never overwrites the original files.

## Step-by-Step Walkthrough

### Step 1: Load and profile every file

```text
Load every .xlsx in ./inbox. Print shape, columns, dtypes, missing values and
duplicate counts per file before changing anything. Do not overwrite the originals.
```

The agent follows the excel-processor pattern: `pd.read_excel(path, sheet_name=0)` per file, lower-cases and underscores the headers so "Order Date" and "order_date" line up, adds a `source_file` column, and concatenates. Before transforming it prints the shape, column names and first rows of each file, so a merged-header file that loaded wrongly is caught at once. Columns that do not match across files are reported, not silently dropped.

Files that carry subtotal rows or formulas pointing at other sheets need a decision: `read_excel` returns the cached formula results, and subtotal rows are filtered out by a rule you confirm (for example, rows where `sku` is empty).

### Step 2: Normalize formats and merge duplicates

```text
Normalize dates, SKUs and phone numbers. Group company names that differ only in
suffix or punctuation. Put anything uncertain in a needs_review column instead of guessing.
```

The core of the cleaning script, tested against pandas 3.1:

```python
import re
from difflib import SequenceMatcher
import pandas as pd

SUFFIXES = {"corp", "corporation", "inc", "incorporated", "co", "company", "llc", "ltd"}

def company_key(name):
    words = re.sub(r"[^a-z0-9 ]", " ", str(name).lower()).split()
    return " ".join(w for w in words if w not in SUFFIXES)

def sku_key(code):
    m = re.search(r"(\d+)", str(code))
    return f"SKU-{int(m.group(1)):05d}" if m else ""

def phone_key(raw):
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}" if len(digits) == 10 else ""

# Name the format for each source; pandas 3 warns and guesses per value otherwise.
us = pd.to_datetime(df["order_date"], format="%m/%d/%Y", errors="coerce")
eu = pd.to_datetime(df["order_date"], format="%d-%m-%Y", errors="coerce")
df["order_date"] = us.fillna(eu)
df["sku"] = df["sku"].map(sku_key)
df["phone_clean"] = df["phone"].map(phone_key)
df["needs_review"] = (df["phone_clean"] == "") | df["order_date"].isna()

df["company_key"] = df["company"].map(company_key)
canon = {}
for key in df["company_key"].unique():
    match = next((c for c in canon if SequenceMatcher(None, key, c).ratio() >= 0.92), None)
    canon[key] = canon[match] if match else key
df["company_id"] = df["company_key"].map(canon)
```

On a small test set, "ACME Corp", "ACME Corp." and "Acme Corporation" collapse into one `company_id`, `SKU 001` and `SKU_001` become `SKU-00001`, and a phone with 5 digits or a date like "bad" lands in `needs_review`. Two caveats the agent states in its summary:

- A date such as 03/04/2026 matches both formats. Assign the format per source file (Sales is month-first, Operations is day-first) rather than per value.
- Name similarity alone only proposes a merge. A name-only match goes to review; a name plus the same phone or email merges. For thousands of names, a dedicated matcher such as `rapidfuzz` is faster than `difflib`, but the review rule stays the same.

Then `df.drop_duplicates(subset=["company_id", "order_id"])` removes exact repeats, and the agent reports how many rows each rule removed. Same-SKU rows with different prices are flagged, not merged: the cause may be a regional price or a typo.

### Step 3: Check data quality and find outliers

```text
Profile the merged table: completeness per column, negative stock, margins above 90%,
and order values outside 1.5 IQR. List the rows, do not delete them.
```

The data-analysis outlier recipe applies directly:

```python
q1, q3 = df["order_value"].quantile([0.25, 0.75])
iqr = q3 - q1
outliers = df[(df["order_value"] < q1 - 1.5 * iqr) | (df["order_value"] > q3 + 1.5 * iqr)]
negative_stock = df[df["stock"] < 0]
print(df.isnull().sum() / len(df))
```

Negative stock is almost always a data-entry error (a return keyed as a sale) and goes to the owner of that file. A very large order may be legitimate, so it is listed for a human, not removed.

### Step 4: Compute the business metrics

```text
Monthly revenue and year-over-year change by category, and the share of revenue
from the top 10% of customers. Chart the monthly trend.
```

```python
monthly = df.resample("ME", on="order_date").agg(revenue=("order_value", "sum"), orders=("order_id", "count"))
by_customer = df.groupby("company_id")["order_value"].sum().sort_values(ascending=False)
top_share = by_customer.head(max(1, len(by_customer) // 10)).sum() / by_customer.sum()
```

Because duplicates are merged first, customer counts, average order value and the top-customer share are computed on real customers. In pandas 3 the month-end alias is `"ME"`; the old `"M"` raises an error. The agent saves charts as PNG at 150 DPI with `matplotlib.use("Agg")` so it works on a server without a display. Forecasts and "growth opportunity" claims are labelled as extrapolation from the numbers shown, not as predictions.

### Step 5: Build a report that regenerates itself

```text
Generate weekly_report.html with KPI cards, the monthly chart and the review list,
including the data source, generation date and reporting period.
```

report-generator renders a single HTML file with the charts embedded as base64 through Jinja2, and a PDF through WeasyPrint if the Pango library is installed. The cleaning script and the report script are saved as plain `.py` files, so a scheduler (cron, a systemd timer or a CI job) can run them each Monday morning and write the result next to the cleaned workbook. The `needs_review` rows go into their own sheet of `inbox_clean.xlsx`, so the human decisions are visible and nothing is guessed silently.

## Real-World Example

In Ana's first run, the agent loads 23 files, flags 14 rows with unparseable dates and 9 phone numbers that are not 10 digits, merges the obvious company-name variants, and lists 6 same-SKU price conflicts. These figures are the example team's illustration, not a benchmark. Ana spends her first hour on the review sheet instead of copying columns, and decides each flagged item once; her rules (the date format per file, the SKU pattern, which name variants are the same company) are kept in the script, so the next Monday only new problems need her eyes.

From then on the Monday work is: run the script, open the report, check the review list. Customer counts and revenue per customer change slightly because the duplicate customers are merged, and the outlier list is what surfaces a row like a return keyed as a sale. The saving comes from the repetitive parts being code rather than from any single insight.
