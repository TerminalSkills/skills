---
title: "Transform PDF Reports Into Actionable Data and Cut Analysis Time"
slug: analyze-pdf-documents
description: "Extract tables, figures, and insights from complex PDF reports to eliminate manual data entry and accelerate business decisions."
skills: [pdf-analyzer, data-analysis, excel-processor, mineru]
category: data-ai
tags: [pdf, extraction, analysis, tables, reporting, automation]
---

# Transform PDF Reports Into Actionable Data and Cut Analysis Time

## The Problem

Every month, Sofia at a 35-person consulting firm receives 12 vendor PDF reports averaging 67 pages each. She needs the revenue tables, client metrics and performance indicators for her monthly dashboard, and she spends about 14 hours copying them by hand. Tables come out mangled, numbers misalign, and the copy-paste errors surface only when a total does not add up.

PDF complexity compounds the problem. Tables that continue on the next page repeat the header row, merged cells turn a clean table into a jumble when pasted into Excel, and scanned reports resist text selection entirely. The 3-day delay between receiving the reports and having usable data means leadership decides on stale numbers.

## The Solution

Four skills cover the pipeline:

- **pdf-analyzer** extracts text and tables from digital PDFs with pdfplumber (PyMuPDF as the fallback).
- **mineru** handles the reports pdfplumber cannot: scanned pages, merged cells and complex layouts, converting them to Markdown/HTML tables first.
- **data-analysis** (pandas) combines the tables, checks them against the reports' own totals, and finds outliers and trends.
- **excel-processor** writes the result to a workbook with the raw data, a summary and a chart.

## Step-by-Step Walkthrough

### Step 1: Triage the Reports

```text
Look at every PDF in ./monthly-reports/. For each one, report the page count, whether pages have a text layer or are scans, and how many tables pdfplumber finds.
```

The agent opens each file with pdfplumber and gives a triage table. A page whose `extract_text()` is empty but which has images is a scan and needs OCR, so the report is routed to mineru (step 2b). Encrypted files raise an empty `PdfminerException` in pdfplumber; the agent asks you for the password and never guesses it.

| Report | Pages | Tables found | Text layer | Route |
|---|---|---|---|---|
| acme.pdf | 67 | 5 | yes | pdfplumber |
| gamma.pdf | 89 | 7 | yes | pdfplumber (table continues over pp. 23-26) |
| delta.pdf | 71 | 0 | no, scanned | mineru, then pandas |
| ... | | | | |

### Step 2: Extract and Combine the Tables

```text
Extract the revenue tables from the digital reports into one DataFrame with a vendor column. A table that continues on the next page repeats its header row: drop the repeats. Save a CSV.
```

This script (tested with pdfplumber 0.11.10 and pandas 3 on a generated two-page report with a table continued across pages) is what the agent writes:

```python
import sys
from pathlib import Path
import pandas as pd
import pdfplumber

def vendor_table(pdf_path: Path) -> pd.DataFrame:
    """Stack the tables of every page; drop the header row repeated on continuation pages."""
    frames = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables():
                frames.append(pd.DataFrame(table[1:], columns=table[0]).assign(page=page_no))
    df = pd.concat(frames, ignore_index=True)
    df = df[df["Region"] != "Region"]
    num = [c for c in df.columns if c.startswith("Q")]
    df[num] = df[num].apply(lambda s: pd.to_numeric(s.str.replace(",", ""), errors="coerce"))
    df.insert(0, "vendor", pdf_path.stem)
    return df

data = pd.concat([vendor_table(p) for p in sorted(Path(sys.argv[1]).glob("*.pdf"))], ignore_index=True)
data.to_csv(sys.argv[2], index=False)
```

The default pdfplumber strategy needs ruling lines. For borderless tables the agent retries with `{"vertical_strategy": "text", "horizontal_strategy": "text"}` and checks the headers, because a title line above the table can become the first row. Merged header cells come out as `None`; fill them forward (`pd.Series(table[0]).ffill()`) before building column names such as `Q1_Jan`.

**Step 2b, scans and stubborn layouts.** For the scanned report, convert with MinerU and load the resulting table:

```console
$ pip install -U "mineru>=4.0,<5"
$ mineru-kit models download --tier basic
$ mineru-kit parse delta.pdf -o delta.md --tier basic
```

`mineru-kit` is installed by the `mineru` package (Python 3.11-3.14). The `basic` tier runs OCR and table models locally on CPU (about 0.8 GB of models, downloaded once); `standard` adds a vision-language model and is the default for PDFs, better on complex layouts. Documents leave your machine only if you pass `--remote`. Load the tables from the Markdown output into pandas, then treat OCR output as less reliable than a text layer: the validation in step 3 matters most here. The install and the `parse` flags were checked against `mineru-kit parse --help` of mineru 4.1.7; the parse itself was not run for this page.

Numbers that appear only inside a chart image (a bar chart with no table) are not extracted reliably. If the text states the same figures, use those; otherwise flag them for a person to read off the chart.

### Step 3: Validate Against the Reports' Own Totals

```text
Check each report's stated Total row against the sum of its rows, per quarter. List every mismatch.
```

Extraction without validation is just faster data entry with the same error rate. Every report carries its own checksum:

```python
body = data[data["Region"] != "Total"]
stated = data[data["Region"] == "Total"]
quarters = ["Q1", "Q2", "Q3"]
diff = stated.set_index("vendor")[quarters] - body.groupby("vendor")[quarters].sum()
print(diff.stack().loc[lambda s: s != 0])
```

On the generated test reports this prints one mismatch (Delta, Q3: the stated total is 849 higher than the rows add up to), which is the signal to open that PDF page and decide whether the header or the line items are wrong, or to ask the vendor for a corrected report. Rounding differences in the source are normal; set a tolerance for them. The flagged rows stay in the dataset with a `needs_review` marker, not silently corrected.

### Step 4: Analyze

```text
From the combined dataset, compute revenue by vendor and quarter, the quarter-over-quarter change, and flag any vendor that moved more than 20% from its previous quarter. List outliers.
```

The agent uses pandas `groupby`, `pct_change()` and an IQR or threshold filter, the techniques in the data-analysis skill. Report which numbers were extracted from a scan or flagged in step 3 next to each finding, so a reader knows how far to trust it. Treat patterns across a dozen vendors as leads to check, not conclusions: correlation between two columns of a small table does not show cause.

### Step 5: Build the Workbook

```text
Write vendor_dashboard.xlsx with a Raw Data sheet, a Summary sheet by vendor, a Q3-vs-Q1 percentage column as live formulas with red fill where negative, and a bar chart.
```

excel-processor writes with pandas and openpyxl (tested with openpyxl 3.1.5):

```python
import pandas as pd
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import PatternFill

summary = body.groupby("vendor")[["Q1", "Q2", "Q3"]].sum().reset_index()

with pd.ExcelWriter("vendor_dashboard.xlsx", engine="openpyxl") as writer:
    data.to_excel(writer, sheet_name="Raw Data", index=False)
    summary.to_excel(writer, sheet_name="Summary", index=False)
    ws = writer.sheets["Summary"]
    last = len(summary) + 1
    ws["F1"] = "Q3 vs Q1 %"
    for r in range(2, last + 1):
        ws[f"F{r}"] = f"=D{r}/B{r}-1"          # live formula, recalculates in Excel
        ws[f"F{r}"].number_format = "0.0%"
    ws.conditional_formatting.add(f"F2:F{last}", CellIsRule(
        operator="lessThan", formula=["0"], fill=PatternFill("solid", start_color="F8CBAD")))
    chart = BarChart()
    chart.title = "Revenue by quarter"
    chart.add_data(Reference(ws, min_col=2, max_col=4, min_row=1, max_row=last), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=last))
    ws.add_chart(chart, "H2")
```

openpyxl cannot create pivot tables, so the Summary sheet is a pandas group-by written as a plain table. Add a `Sources` sheet with each PDF name, extraction date and any flagged discrepancy. Next month Sofia drops the new PDFs in the folder and reruns the same two scripts; keep each month's CSV so year-over-year comparisons need no re-extraction.

## Real-World Example

The head of operations at a property management firm receives monthly PDF statements for 47 properties from several management companies, in different formats. She spent about 22 hours a month copying occupancy, maintenance cost and rental income into a spreadsheet. Some statements were scans she could not even select text from.

She runs the triage first: most statements have a text layer and go through pdfplumber, the scans go through MinerU. The currency strings differ (`$1,234`, `1234.00`, `$1.2K`) and the dates mix `MM/DD/YYYY` and `DD-MMM-YY`, so the pandas step normalizes both, with the date format stated explicitly. The statement totals check flags a handful of properties whose line items do not match the printed totals; she asks those companies for corrected statements before the numbers reach the workbook.

With clean data, a group-by on management company shows which company's maintenance costs run well above the others, and a monthly occupancy view shows the seasonal pattern in renewals. The workbook and its two scripts now take her a short review pass each month instead of a day of copying, and the shaky figures are marked instead of hidden.

## Related Skills

- [pdf-analyzer](/skills/pdf-analyzer) — text and table extraction from digital PDFs with pdfplumber and PyMuPDF.
- [mineru](/skills/mineru) — scanned pages, merged cells and complex layouts, converted to Markdown or HTML tables before analysis.
- [data-analysis](/skills/data-analysis) — pandas validation, aggregation and outlier checks.
- [excel-processor](/skills/excel-processor) — the output workbook with formulas, formatting and a chart.
