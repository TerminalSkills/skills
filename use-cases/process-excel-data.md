---
title: "Process Excel Data with AI"
slug: process-excel-data
description: "Clean, transform, and analyze messy spreadsheet data using AI-driven pandas automation."
skills: [excel-processor]
category: data-ai
tags: [excel, spreadsheet, data-cleaning, pandas]
---

# Process Excel Data with AI

## The Problem

You have a messy spreadsheet with 10,000 rows of customer data. Names are inconsistently capitalized, phone numbers use different formats, there are duplicate entries, and you need a pivot table summarizing sales by region and quarter. Doing this manually in Excel takes hours and one wrong formula can corrupt the entire sheet.

## The Solution

Use the **excel-processor** skill to have your AI agent load, clean, transform, and export spreadsheet data using Python and pandas. The agent handles the complexity while you describe what you want in plain English.

Install the skill:

```bash
npx terminal-skills install excel-processor
```

## Step-by-Step Walkthrough

### 1. Describe your data task

```
Clean up customers.xlsx: remove duplicates by email, standardize phone numbers,
and create a summary sheet with customer count by state.
```

### 2. The agent loads and inspects the data

It reads the file, reports the shape (rows and columns), shows column names and data types, and flags any quality issues like missing values or duplicates.

### 3. Transformations are applied

The agent writes and executes a pandas script that:
- Removes duplicate rows based on the email column
- Standardizes phone numbers to a consistent format
- Groups by state and counts customers
- Creates a summary DataFrame

### 4. Results are exported

The agent writes a new Excel file with two sheets: the cleaned data and the summary. The original file is preserved.

```
Loaded: 10,240 rows x 12 columns
Removed: 847 duplicates (by email)
Formatted: 6,203 phone numbers standardized
Summary: 48 states represented

Saved to customers_clean.xlsx:
  - Sheet "Customers": 9,393 rows
  - Sheet "By State": 48 rows
```

### 5. Iterate as needed

Ask for additional transformations: "Now filter to only California customers and add a column for account age."

## Real-World Example

A sales team exports their CRM data monthly as Excel files. Each export has slightly different column names and formatting. Using the excel-processor skill:

1. Ask the agent: "Merge all monthly exports in ./reports/ into one file, normalize the column names, and create a pivot table of revenue by salesperson by month"
2. The agent reads each file, maps varying column names to a standard schema, concatenates the data, builds the pivot table, and exports everything to a single workbook
3. The sales manager gets a clean, consolidated view without manually copy-pasting between spreadsheets

## Related Skills

- [pdf-analyzer](../skills/pdf-analyzer/) -- Extract tables from PDF reports into spreadsheets
- [data-analysis](../skills/data-analysis/) -- Create charts from spreadsheet data
- [sql-optimizer](../skills/sql-optimizer/) -- Query large datasets more efficiently than Excel
