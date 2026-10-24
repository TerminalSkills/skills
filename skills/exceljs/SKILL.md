---
name: exceljs
description: >-
  Generate and parse Excel spreadsheets with ExcelJS — create workbooks with
  multiple sheets, styled cells, formulas, charts, images, and conditional
  formatting. Use when tasks involve exporting application data to .xlsx,
  building financial reports, parsing uploaded spreadsheets, or creating
  data import/export pipelines.
license: Apache-2.0
compatibility: "Node.js 18+ recommended (package declares >=8.3.0); exceljs 4.4.0; also runs in the browser"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/exceljs/exceljs
  category: documents
  tags: ["excel", "xlsx", "spreadsheet", "exceljs", "reports"]
---

# ExcelJS

## Overview

ExcelJS reads and writes `.xlsx` files (not the old binary `.xls`) in Node.js and the browser: styles, formulas, images, conditional formatting, and a streaming reader/writer for large files. Latest release is 4.4.0 (December 2024); development is slow, and `npm audit` reports a moderate advisory on its `uuid` dependency (GHSA-w5hq-g745-h8pq, an issue in uuid v3/v5/v6 when a buffer is passed in) with no non-breaking fix. The examples below were run on 4.4.0.

## Instructions

Create a `Workbook`, add worksheets with `columns`, add rows, style cells, then write with `workbook.xlsx.writeFile(path)` or `writeBuffer()`. To read, use `readFile(path)` or `load(buffer)`.

## Setup

```bash
# Install ExcelJS for spreadsheet generation and parsing.
npm install exceljs
```

The examples use ES modules with top-level `await`: put `"type": "module"` in `package.json` or name the files `.mjs`.

## Creating a Workbook

```typescript
// src/excel/create.ts — Create an Excel workbook with a styled header row and data.
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
workbook.creator = "Report System";
workbook.created = new Date();

const sheet = workbook.addWorksheet("Sales Data", {
  properties: { tabColor: { argb: "FF3498DB" } },
});

// Define columns
sheet.columns = [
  { header: "Product", key: "product", width: 25 },
  { header: "Revenue", key: "revenue", width: 15 },
  { header: "Units Sold", key: "units", width: 12 },
  { header: "Growth", key: "growth", width: 12 },
];

// Style header row
sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
sheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF3498DB" },
};

// Add data
const data = [
  { product: "Widget Pro", revenue: 45000, units: 1200, growth: 0.12 },
  { product: "Gadget Plus", revenue: 32000, units: 800, growth: 0.08 },
  { product: "Tool Basic", revenue: 18000, units: 2400, growth: -0.03 },
];

data.forEach((row) => sheet.addRow(row));

// Format numbers
sheet.getColumn("revenue").numFmt = "$#,##0";
sheet.getColumn("growth").numFmt = "0.0%";

await workbook.xlsx.writeFile("sales-report.xlsx");
```

## Formulas

```typescript
// src/excel/formulas.ts — Add formulas for totals, averages, and derived values.
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Financials");

sheet.columns = [
  { header: "Item", key: "item", width: 20 },
  { header: "Q1", key: "q1", width: 12 },
  { header: "Q2", key: "q2", width: 12 },
  { header: "Total", key: "total", width: 12 },
];

sheet.addRow({ item: "Revenue", q1: 100000, q2: 120000 });
sheet.addRow({ item: "Expenses", q1: 80000, q2: 85000 });
sheet.addRow({ item: "Profit" });

// Formula references
// ExcelJS does not calculate formulas. Without `result`, a reader that does not
// recalculate (a script, a preview pane) sees an empty cell; Excel recalculates on open.
sheet.getCell("D2").value = { formula: "B2+C2", result: 220000 };
sheet.getCell("D3").value = { formula: "B3+C3", result: 165000 };
sheet.getCell("B4").value = { formula: "B2-B3", result: 20000 };
sheet.getCell("C4").value = { formula: "C2-C3", result: 35000 };
sheet.getCell("D4").value = { formula: "D2-D3", result: 55000 };

await workbook.xlsx.writeFile("financials.xlsx");
```

## Conditional Formatting

```typescript
// src/excel/conditional.ts — Highlight cells based on value thresholds.
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("KPIs");

sheet.columns = [
  { header: "Metric", key: "metric", width: 20 },
  { header: "Value", key: "value", width: 15 },
];

sheet.addRows([
  { metric: "Uptime", value: 99.9 },
  { metric: "Error Rate", value: 2.3 },
  { metric: "Response Time (ms)", value: 450 },
]);

// Green fill for values above 95
sheet.addConditionalFormatting({
  ref: "B2:B4",
  rules: [
    {
      type: "cellIs",
      operator: "greaterThan",
      formulae: [95],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF27AE60" } } },
      priority: 1,
    },
  ],
});

await workbook.xlsx.writeFile("kpis.xlsx");
```

## Reading Excel Files

```typescript
// src/excel/read.ts — Parse an uploaded Excel file and extract data as objects.
import ExcelJS from "exceljs";

export async function parseExcel(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(1)!;
  const headers: string[] = [];
  const rows: Record<string, any>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => headers.push(String(cell.value)));
    } else {
      const obj: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        obj[headers[colNumber - 1]] = cell.value;
      });
      rows.push(obj);
    }
  });

  return rows;
}
```

Cell values are not always primitives: a formula cell is `{ formula, result }`, a hyperlink is `{ text, hyperlink }`, rich text is `{ richText: [...] }`, and dates arrive as `Date`. Use `cell.text` for a display string and `cell.result` for a formula's cached value. `eachCell` skips empty cells, so map by `colNumber` as above (or pass `{ includeEmpty: true }`). For uploads, use `await workbook.xlsx.load(buffer)` and `await workbook.xlsx.writeBuffer()` instead of files.

## Streaming Large Files

```typescript
// src/excel/stream.ts — Write large datasets without holding everything in memory.
// Uses ExcelJS streaming writer for millions of rows.
import ExcelJS from "exceljs";
import fs from "fs";

export async function streamLargeExport(data: AsyncIterable<any[]>, outputPath: string) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: fs.createWriteStream(outputPath),
    useStyles: true,
  });

  const sheet = workbook.addWorksheet("Data");
  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Name", key: "name", width: 30 },
    { header: "Value", key: "value", width: 15 },
  ];

  for await (const batch of data) {
    for (const row of batch) {
      sheet.addRow(row).commit();
    }
  }

  sheet.commit();
  await workbook.commit();
}
```

Streaming writes cannot be edited after `row.commit()`, and the sheet must be committed before the workbook. Read big files the same way with `new ExcelJS.stream.xlsx.WorkbookReader(path, {})` and `for await (const worksheet of reader) for await (const row of worksheet) { ... }` (run on a 3,001-row file).

## Examples

**"Export this month's orders to orders-2026-10.xlsx with a bold header and a total."**

```javascript
import ExcelJS from "exceljs";

const orders = [
  { id: 1041, customer: "Northwind Traders", total: 1280.5 },
  { id: 1042, customer: "Globex Supplies", total: 342.0 },
];
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Orders");
ws.columns = [
  { header: "Order", key: "id", width: 10 },
  { header: "Customer", key: "customer", width: 28 },
  { header: "Total (EUR)", key: "total", width: 14, style: { numFmt: "#,##0.00" } },
];
ws.getRow(1).font = { bold: true };
orders.forEach((o) => ws.addRow(o));
const sum = orders.reduce((a, o) => a + o.total, 0);
ws.addRow({ customer: "Total", total: { formula: "SUM(C2:C3)", result: sum } });
await wb.xlsx.writeFile("orders-2026-10.xlsx");
```

The file opens with a bold header, two order rows and a total row of 1622.5.

**"Read the uploaded price list and give me an array of objects."** Call `parseExcel("price-list.xlsx")` from the reading section; each element is `{ "SKU": "A-100", "Price": 4.2, ... }` keyed by the header row.

## Guidelines

- Only `.xlsx` is supported; convert `.xls` first. CSV has its own `workbook.csv.readFile` / `writeFile`.
- Formulas are stored, never computed by ExcelJS; supply `result` when other tools read the file.
- Use the streaming writer above roughly 100k rows; the normal API keeps the whole workbook in memory.
- Never build a cell value from untrusted text that starts with `=`, `+`, `-` or `@` without checking: spreadsheet apps may treat it as a formula (CSV/formula injection). Plain string values are stored as text.
