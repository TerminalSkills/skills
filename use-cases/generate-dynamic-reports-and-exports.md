---
title: Generate Dynamic Reports and Exports
slug: generate-dynamic-reports-and-exports
description: Build a report generation system that creates PDF reports, Excel spreadsheets, and CSV exports from application data — with charts, branded templates, and scheduled delivery.
skills:
  - pdfkit
  - exceljs
  - csv-parse
  - sharp-image
category: Document Generation
tags:
  - reports
  - pdf
  - excel
  - csv
  - export
  - data-pipeline
---

# Generate Dynamic Reports and Exports

Marcus runs the analytics team at a mid-size SaaS company. Every Monday morning, stakeholders expect a performance report: a polished PDF for the executive summary, an Excel workbook for the data team to slice and dice, and a CSV dump for the BI pipeline. He's been building these by hand in Google Sheets, exporting, and emailing. It takes two hours every week. He wants to automate the whole thing.

## Step 1 — Define the Report Data Layer

Before generating any documents, Marcus needs a clean data interface. The report system pulls from the database, shapes the data, and passes it to each exporter.

```typescript
// src/reports/data.ts — Fetch and shape report data from the database.
// Returns a normalized structure that all exporters consume.
interface ReportData {
  title: string;
  period: { start: Date; end: Date };
  summary: { metric: string; value: number; change: number }[];
  dailyMetrics: { date: string; revenue: number; users: number; churn: number }[];
  topProducts: { name: string; revenue: number; units: number }[];
}

export async function getWeeklyReportData(weekOf: Date): Promise<ReportData> {
  const start = new Date(weekOf);
  start.setDate(start.getDate() - 7);

  // In production, these would be database queries
  return {
    title: `Weekly Performance Report`,
    period: { start, end: weekOf },
    summary: [
      { metric: "Total Revenue", value: 142500, change: 0.12 },
      { metric: "Active Users", value: 8430, change: 0.05 },
      { metric: "Churn Rate", value: 2.1, change: -0.3 },
      { metric: "NPS Score", value: 72, change: 4 },
    ],
    dailyMetrics: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(start.getTime() + i * 86400000).toISOString().split("T")[0],
      revenue: 18000 + Math.random() * 5000,
      users: 1100 + Math.floor(Math.random() * 200),
      churn: 1.5 + Math.random() * 1.5,
    })),
    topProducts: [
      { name: "Pro Plan", revenue: 68000, units: 340 },
      { name: "Team Plan", revenue: 45000, units: 90 },
      { name: "Enterprise", revenue: 29500, units: 12 },
    ],
  };
}
```

## Step 2 — Generate the PDF Report

The PDF is the executive version — branded, visual, one page of KPIs with a summary table. Marcus uses PDFKit to build it programmatically so the layout stays consistent every week.

```typescript
// src/reports/pdf-report.ts — Generate a branded PDF report with logo,
// KPI cards, and a summary table. Streams to a file.
import PDFDocument from "pdfkit";
import sharp from "sharp";
import fs from "fs";

interface ReportData {
  title: string;
  period: { start: Date; end: Date };
  summary: { metric: string; value: number; change: number }[];
  topProducts: { name: string; revenue: number; units: number }[];
}

export async function generatePdfReport(data: ReportData, outputPath: string) {
  // Resize logo to consistent dimensions before embedding
  const logoBuffer = await sharp("assets/logo.png")
    .resize(160, 48, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(fs.createWriteStream(outputPath));

  // Header with logo
  doc.image(logoBuffer, 50, 40, { width: 120 });
  doc.fontSize(20).fillColor("#2c3e50")
    .text(data.title, 200, 45, { align: "right" });
  doc.fontSize(10).fillColor("#7f8c8d")
    .text(
      `${data.period.start.toLocaleDateString()} — ${data.period.end.toLocaleDateString()}`,
      200, 70, { align: "right" }
    );

  // Divider
  doc.moveTo(50, 100).lineTo(545, 100).strokeColor("#3498db").lineWidth(2).stroke();

  // KPI cards
  let y = 120;
  doc.fontSize(14).fillColor("#2c3e50").text("Key Metrics", 50, y);
  y += 30;

  const cardWidth = 115;
  data.summary.forEach((kpi, i) => {
    const x = 50 + i * (cardWidth + 12);
    doc.rect(x, y, cardWidth, 70).fillAndStroke("#f8f9fa", "#e0e0e0");

    doc.fontSize(9).fillColor("#7f8c8d").text(kpi.metric, x + 8, y + 8, { width: cardWidth - 16 });
    doc.fontSize(18).fillColor("#2c3e50").text(
      kpi.metric.includes("Rate") ? `${kpi.value}%` : kpi.value.toLocaleString(),
      x + 8, y + 28
    );

    const changeColor = kpi.change >= 0 ? "#27ae60" : "#e74c3c";
    const arrow = kpi.change >= 0 ? "▲" : "▼";
    doc.fontSize(10).fillColor(changeColor)
      .text(`${arrow} ${Math.abs(kpi.change)}%`, x + 8, y + 52);
  });

  // Products table
  y += 100;
  doc.fontSize(14).fillColor("#2c3e50").text("Top Products", 50, y);
  y += 25;

  // Table header
  doc.fontSize(10).fillColor("#ffffff");
  doc.rect(50, y, 495, 22).fill("#3498db");
  doc.text("Product", 58, y + 6, { width: 200 });
  doc.text("Revenue", 260, y + 6, { width: 120 });
  doc.text("Units", 390, y + 6, { width: 100 });

  // Table rows
  y += 22;
  doc.fillColor("#333333");
  data.topProducts.forEach((product, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fa";
    doc.rect(50, y, 495, 22).fill(bg);
    doc.fillColor("#333333");
    doc.text(product.name, 58, y + 6, { width: 200 });
    doc.text(`$${product.revenue.toLocaleString()}`, 260, y + 6, { width: 120 });
    doc.text(product.units.toString(), 390, y + 6, { width: 100 });
    y += 22;
  });

  doc.end();
}
```

## Step 3 — Generate the Excel Workbook

The data team needs the raw numbers in Excel with multiple sheets, formulas, and conditional formatting so they can build their own analysis on top.

```typescript
// src/reports/excel-report.ts — Create a multi-sheet Excel workbook with
// summary, daily metrics, and product breakdown. Includes formulas and styling.
import ExcelJS from "exceljs";

interface ReportData {
  title: string;
  period: { start: Date; end: Date };
  summary: { metric: string; value: number; change: number }[];
  dailyMetrics: { date: string; revenue: number; users: number; churn: number }[];
  topProducts: { name: string; revenue: number; units: number }[];
}

export async function generateExcelReport(data: ReportData, outputPath: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Report System";
  workbook.created = new Date();

  // Summary sheet
  const summary = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF3498DB" } },
  });

  summary.columns = [
    { header: "Metric", key: "metric", width: 25 },
    { header: "Value", key: "value", width: 18 },
    { header: "Change (%)", key: "change", width: 15 },
  ];

  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(1).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FF3498DB" },
  };

  data.summary.forEach((row) => summary.addRow(row));
  summary.getColumn("change").numFmt = "+0.0%;-0.0%";

  // Daily metrics sheet
  const daily = workbook.addWorksheet("Daily Metrics");
  daily.columns = [
    { header: "Date", key: "date", width: 15 },
    { header: "Revenue", key: "revenue", width: 15 },
    { header: "Active Users", key: "users", width: 15 },
    { header: "Churn Rate (%)", key: "churn", width: 15 },
  ];

  daily.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  daily.getRow(1).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FF2ECC71" },
  };

  data.dailyMetrics.forEach((row) => daily.addRow({
    ...row,
    revenue: Math.round(row.revenue),
    churn: Math.round(row.churn * 10) / 10,
  }));

  daily.getColumn("revenue").numFmt = "$#,##0";

  // Totals row with formulas
  const lastRow = data.dailyMetrics.length + 1;
  const totalsRow = daily.addRow({ date: "TOTAL" });
  totalsRow.getCell(2).value = { formula: `SUM(B2:B${lastRow})` } as any;
  totalsRow.getCell(3).value = { formula: `AVERAGE(C2:C${lastRow})` } as any;
  totalsRow.getCell(4).value = { formula: `AVERAGE(D2:D${lastRow})` } as any;
  totalsRow.font = { bold: true };

  // Products sheet
  const products = workbook.addWorksheet("Products");
  products.columns = [
    { header: "Product", key: "name", width: 25 },
    { header: "Revenue", key: "revenue", width: 18 },
    { header: "Units Sold", key: "units", width: 15 },
    { header: "Avg Price", key: "avgPrice", width: 15 },
  ];

  products.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  products.getRow(1).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FF9B59B6" },
  };

  data.topProducts.forEach((p, i) => {
    const row = products.addRow({ ...p });
    row.getCell(4).value = { formula: `B${i + 2}/C${i + 2}` } as any;
  });

  products.getColumn("revenue").numFmt = "$#,##0";
  products.getColumn("avgPrice").numFmt = "$#,##0.00";

  await workbook.xlsx.writeFile(outputPath);
}
```

## Step 4 — Generate the CSV Export

The BI pipeline ingests CSV. Marcus generates a flat denormalized export with all daily metrics — simple, streamable, and machine-readable.

```typescript
// src/reports/csv-export.ts — Generate a CSV export of daily metrics for
// the BI pipeline. Uses csv-stringify for proper escaping and formatting.
import { stringify } from "csv-stringify/sync";
import fs from "fs";

interface DailyMetric {
  date: string;
  revenue: number;
  users: number;
  churn: number;
}

export function generateCsvExport(metrics: DailyMetric[], outputPath: string) {
  const csv = stringify(metrics, {
    header: true,
    columns: [
      { key: "date", header: "Date" },
      { key: "revenue", header: "Revenue (USD)" },
      { key: "users", header: "Active Users" },
      { key: "churn", header: "Churn Rate (%)" },
    ],
    cast: {
      number: (value) => value.toFixed(2),
    },
  });

  fs.writeFileSync(outputPath, csv);
  console.log(`CSV exported: ${metrics.length} rows`);
}
```

## Step 5 — Orchestrate Everything

Marcus ties it all together in a single function that generates all three formats and optionally emails them. This runs on a Monday morning cron job.

```typescript
// src/reports/generate-all.ts — Orchestrate the full report generation pipeline.
// Fetches data once, generates PDF + Excel + CSV, and logs results.
import { getWeeklyReportData } from "./data";
import { generatePdfReport } from "./pdf-report";
import { generateExcelReport } from "./excel-report";
import { generateCsvExport } from "./csv-export";
import path from "path";
import fs from "fs";

export async function generateWeeklyReports() {
  const now = new Date();
  const dateStamp = now.toISOString().split("T")[0];
  const outputDir = path.join("reports", dateStamp);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Generating reports for week of ${dateStamp}...`);

  // Fetch data once
  const data = await getWeeklyReportData(now);

  // Generate all formats in parallel
  await Promise.all([
    generatePdfReport(data, path.join(outputDir, "weekly-report.pdf")),
    generateExcelReport(data, path.join(outputDir, "weekly-data.xlsx")),
  ]);

  // CSV is synchronous
  generateCsvExport(data.dailyMetrics, path.join(outputDir, "daily-metrics.csv"));

  console.log(`All reports saved to ${outputDir}/`);
  return {
    pdf: path.join(outputDir, "weekly-report.pdf"),
    excel: path.join(outputDir, "weekly-data.xlsx"),
    csv: path.join(outputDir, "daily-metrics.csv"),
  };
}
```
