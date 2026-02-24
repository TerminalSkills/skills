---
name: exceljs
description: >-
  Generate and parse Excel spreadsheets with ExcelJS — create workbooks with
  multiple sheets, styled cells, formulas, charts, images, and conditional
  formatting. Use when tasks involve exporting application data to .xlsx,
  building financial reports, parsing uploaded spreadsheets, or creating
  data import/export pipelines.
license: Apache-2.0
compatibility: "Node.js 14+ or browser"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: ["excel", "xlsx", "spreadsheet", "exceljs", "reports"]
---

# ExcelJS

Read and write Excel files in Node.js. Full support for styles, formulas, images, and streaming.

## Setup

```bash
# Install ExcelJS for spreadsheet generation and parsing.
npm install exceljs
```

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
sheet.getCell("D2").value = { formula: "B2+C2" } as any;
sheet.getCell("D3").value = { formula: "B3+C3" } as any;
sheet.getCell("B4").value = { formula: "B2-B3" } as any;
sheet.getCell("C4").value = { formula: "C2-C3" } as any;
sheet.getCell("D4").value = { formula: "D2-D3" } as any;

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

// Green for values above target, red for below
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
