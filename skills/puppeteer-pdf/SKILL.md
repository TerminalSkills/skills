---
name: puppeteer-pdf
description: >-
  Generate pixel-perfect PDFs from HTML and CSS using Puppeteer — render web
  pages or HTML templates to PDF with full CSS support including flexbox, grid,
  web fonts, and print media queries. Use when tasks involve converting HTML
  reports to PDF, generating invoices from templates, or creating PDFs that
  require complex CSS layouts.
license: Apache-2.0
compatibility: "Node.js 16+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: ["puppeteer", "pdf", "html-to-pdf", "headless-chrome", "reports"]
---

# Puppeteer PDF

Use headless Chrome to render HTML to PDF. Full CSS support — flexbox, grid, web fonts, media queries.

## Setup

```bash
# Install Puppeteer. Downloads Chromium automatically.
npm install puppeteer
```

## Basic HTML to PDF

```typescript
// src/pdf/from-html.ts — Convert an HTML string to a PDF file.
// Puppeteer launches headless Chrome, sets the HTML content, and prints to PDF.
import puppeteer from "puppeteer";

export async function htmlToPdf(html: string, outputPath: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.pdf({
    path: outputPath,
    format: "A4",
    margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    printBackground: true,
  });

  await browser.close();
}
```

## URL to PDF

```typescript
// src/pdf/from-url.ts — Navigate to a URL and save the page as PDF.
// Useful for archiving web pages or converting dashboards to reports.
import puppeteer from "puppeteer";

export async function urlToPdf(url: string, outputPath: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle0" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
  });

  await browser.close();
}
```

## Template-Based Reports

```typescript
// src/pdf/report-template.ts — Generate a styled report from data using an
// HTML template. Supports CSS grid layouts, charts, and branded headers.
import puppeteer from "puppeteer";

interface ReportData {
  title: string;
  date: string;
  rows: { label: string; value: string }[];
  logoUrl: string;
}

export async function generateReport(data: ReportData): Promise<Buffer> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        /* Report styles — print-optimized with CSS Grid layout. */
        @page { margin: 20mm; }
        body { font-family: 'Segoe UI', sans-serif; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: center;
                   border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }
        .header img { height: 40px; }
        .header h1 { font-size: 24px; color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #3498db; color: white; padding: 10px; text-align: left; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) { background: #f8f9fa; }
        .footer { position: fixed; bottom: 0; width: 100%; text-align: center;
                   font-size: 10px; color: #999; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${data.title}</h1>
        <img src="${data.logoUrl}" alt="Logo"/>
      </div>
      <p>Report generated: ${data.date}</p>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        ${data.rows.map((r) => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join("")}
      </table>
      <div class="footer">Confidential — ${data.title}</div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
  });

  await browser.close();
  return Buffer.from(pdf);
}
```

## Headers and Footers

```typescript
// src/pdf/header-footer.ts — Add dynamic headers and footers with page numbers.
// Puppeteer supports HTML templates for header/footer regions.
import puppeteer from "puppeteer";

export async function pdfWithPageNumbers(html: string, outputPath: string) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "30mm", bottom: "25mm", left: "15mm", right: "15mm" },
    headerTemplate: `
      <div style="font-size:9px; width:100%; text-align:center; color:#999;">
        Monthly Performance Report
      </div>`,
    footerTemplate: `
      <div style="font-size:9px; width:100%; text-align:center; color:#999;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
  });

  await browser.close();
}
```

## PDF Buffer for API Responses

```typescript
// src/pdf/api.ts — Generate PDF in memory and return as buffer for API endpoints.
import puppeteer from "puppeteer";
import type { Request, Response } from "express";

export async function handlePdfRequest(req: Request, res: Response) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(`<h1>Invoice #${req.params.id}</h1>`, {
    waitUntil: "networkidle0",
  });

  const pdf = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();

  res.contentType("application/pdf");
  res.send(pdf);
}
```
