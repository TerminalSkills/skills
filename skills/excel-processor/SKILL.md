---
name: excel-processor
description: >-
  Read, transform, analyze, and generate Excel and CSV files. Use when a user
  asks to open a spreadsheet, process Excel data, merge CSVs, create pivot
  tables, clean up data, convert between Excel and CSV, add formulas, filter
  rows, or generate reports from tabular data. Handles .xlsx, .xls, and .csv.
license: Apache-2.0
compatibility: "Requires Python 3 with pandas 3.x and openpyxl; xlrd only for legacy .xls files"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["excel", "csv", "spreadsheet", "data", "pandas"]
  repository: https://github.com/pandas-dev/pandas
---

# Excel Processor

## Overview

Read, transform, analyze, and generate Excel and CSV files using Python. This skill covers data loading, cleaning, filtering, aggregation, formula generation, and export to multiple formats.

## Instructions

When a user asks you to work with spreadsheets, Excel files, or CSV data, follow these steps:

### Step 1: Load the data

```python
import pandas as pd

# For .xlsx files (openpyxl engine, the default)
df = pd.read_excel("data.xlsx", sheet_name=0)  # or sheet_name="Sheet1"

# For legacy .xls files, install xlrd (pip install xlrd) or pass engine="calamine"
# df = pd.read_excel("legacy.xls", sheet_name=0, engine="calamine")

# For CSV files
df = pd.read_csv("data.csv")

# Show shape and preview
print(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns")
print(f"Columns: {list(df.columns)}")
print(df.head())
```

Always print the shape, column names, and first few rows so the user can verify the data loaded correctly.

### Step 2: Assess data quality

```python
# Check for issues
print(f"Missing values:\n{df.isnull().sum()}")
print(f"\nDuplicates: {df.duplicated().sum()}")
print(f"\nData types:\n{df.dtypes}")
```

Report any issues found before proceeding with transformations.

### Step 3: Apply requested transformations

Common operations:

**Filtering:**
```python
filtered = df[df["status"] == "active"]
filtered = df[df["amount"] > 1000]
filtered = df[df["date"].between("2024-01-01", "2024-12-31")]
```

**Aggregation:**
```python
summary = df.groupby("category").agg(
    count=("id", "count"),
    total=("amount", "sum"),
    average=("amount", "mean")
).reset_index()
```

**Pivot tables:**
```python
pivot = df.pivot_table(
    values="revenue",
    index="region",
    columns="quarter",
    aggfunc="sum",
    margins=True
)
```

**Cleaning:**
```python
df["name"] = df["name"].str.strip().str.title()
df["email"] = df["email"].str.lower()
# State the format: without it pandas guesses per value and warns
df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
df = df.drop_duplicates(subset=["id"])
df = df.dropna(subset=["required_field"])
```

### Step 4: Export results

```python
# To .xlsx (openpyxl writes the values; pandas does not apply cell styling)
with pd.ExcelWriter("output.xlsx", engine="openpyxl") as writer:
    df.to_excel(writer, sheet_name="Data", index=False)
    summary.to_excel(writer, sheet_name="Summary", index=False)

# To CSV
df.to_csv("output.csv", index=False)
```

### Step 5: Report what was done

Always summarize the operations performed, rows affected, and output file location.

## Examples

### Example 1: Clean and deduplicate a customer list

**User request:** "Clean up customers.xlsx -- remove duplicates, fix phone formatting, and split into active/inactive sheets"

**Actions taken:**
1. Load `customers.xlsx` (2,340 rows, 8 columns)
2. Remove 156 duplicate rows based on email
3. Standardize phone numbers to (XXX) XXX-XXXX format
4. Split into active (1,847 rows) and inactive (337 rows)
5. Export to `customers_clean.xlsx` with two sheets

**Output:**
```
Loaded: 2,340 rows x 8 columns
Removed: 156 duplicate rows (by email)
Fixed: 892 phone numbers reformatted
Split: 1,847 active, 337 inactive

Saved to customers_clean.xlsx:
  - Sheet "Active": 1,847 rows
  - Sheet "Inactive": 337 rows
```

### Example 2: Generate a monthly sales summary

**User request:** "Create a pivot table from sales.csv showing revenue by region and month"

**Actions taken:**
1. Load `sales.csv` (15,200 rows)
2. Parse date column, extract month
3. Build pivot table: regions as rows, months as columns, sum of revenue
4. Add row and column totals
5. Export to `sales_summary.xlsx`

**Output:**
```
| Region    | Jan      | Feb      | Mar      | Total     |
|-----------|----------|----------|----------|-----------|
| North     | $45,200  | $52,100  | $48,900  | $146,200  |
| South     | $38,700  | $41,300  | $44,600  | $124,600  |
| East      | $51,900  | $49,800  | $55,200  | $156,900  |
| West      | $42,100  | $46,700  | $43,500  | $132,300  |
| Total     | $177,900 | $189,900 | $192,200 | $560,000  |

Saved to sales_summary.xlsx
```

## Guidelines

- Always show data shape and column names after loading so the user can verify correctness.
- When dealing with dates, explicitly parse them with `pd.to_datetime()` and specify the format when ambiguous (e.g., is 01/02/03 Jan 2 or Feb 1?). Without `format=`, pandas 3 parses each value separately and emits a "Could not infer format" warning, which is slower and can silently mix day-first and month-first dates.
- `.xls` (Excel 97-2003) needs `xlrd` or `engine="calamine"`; `.xlsx` needs `openpyxl`. A `sheet_name` that does not exist raises `ValueError: Worksheet named ... not found`.
- Excel rows are capped at 1,048,576 per sheet; split larger exports across sheets or CSV files.
- For large files (100k+ rows), warn about memory and suggest chunked processing.
- Preserve original files. Write output to new files unless the user explicitly asks to overwrite.
- When merging multiple files, check that column names match and report any discrepancies before proceeding.
- If the user asks for "formulas", generate the Excel formula strings (e.g., `=SUM(B2:B100)`) rather than computing values, so the spreadsheet stays dynamic.
- Default to UTF-8 encoding for CSV. If the data contains special characters, test with `encoding="utf-8-sig"` for Excel compatibility.
