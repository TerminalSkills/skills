---
name: pdfkit
description: >-
  PDFKit is a JavaScript library that generates PDF files in Node.js and the browser, with text, images, vector graphics, tables, custom fonts and streaming output. Use when asked to "generate a PDF with Node", "create an invoice or report PDF", "add page numbers to a PDFKit document", "draw a table in PDFKit", or "stream a PDF from an Express route".
license: Apache-2.0
compatibility: Node.js 18+; pdfkit 0.20 (older 0.15-0.17 releases behave the same for the basics, but lack some features noted below)
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  repository: https://github.com/foliojs/pdfkit
  tags: ["pdf", "pdfkit", "reports", "invoices", "node"]
---

# PDFKit

## Overview

PDFKit builds PDFs from code: you create a `PDFDocument`, call drawing methods, pipe it to a writable stream and call `end()`. It is streaming, so the same document can go to a file or an HTTP response. Checked against pdfkit 0.20.2 (August 2026), run in scratch with Node 24.

Things that differ from older write-ups: `doc.table()` is built in (added in the 0.17 line), so you no longer have to draw tables by hand; 0.20 removed the browser virtual file system (use `registerFile`) and exports `PDFDocument` as a named export as well as the default. PDFKit does not render HTML; for HTML to PDF use a headless browser instead.

## Instructions

### Install

```bash
npm install pdfkit
npm install -D @types/pdfkit typescript
```

`@types/pdfkit` (0.17.x) provides the TypeScript types, including `table`.

### Document basics

```typescript
import PDFDocument from "pdfkit";
import fs from "node:fs";

const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("monthly-report.pdf"));

doc.fontSize(24).text("Monthly Report", { align: "center" });
doc.moveDown();
doc.fontSize(11).text("Revenue grew 8.4% in September, driven by annual plans.", { align: "justify", lineGap: 4 });
doc.image("logo.png", 50, 50, { width: 120 });
doc.rect(50, 250, 200, 100).fill("#3498db");
doc.circle(400, 300, 50).fill("#e74c3c");
doc.moveTo(50, 400).lineTo(550, 400).dash(5, { space: 5 }).stroke("#999999");
doc.end();
```

`end()` must be called, otherwise the file is never finished. Listen to the output stream's `finish` event before reading or sending the file.

### Tables

```typescript
doc.table({
  columnStyles: [250, "*", "*"],           // fixed width, then equal shares of the rest
  data: [
    [{ text: "Item", font: { src: "Helvetica-Bold" } }, "Qty", "Amount"],
    ["Annual license", "1", "$1,200.00"],
    ["Support plan", "12", "$600.00"],
  ],
});
```

Cells can be strings or objects (`text`, `colSpan`, `rowSpan`, `textColor`, `font`, ...). `rowStyles` takes a number, an array or a function of the row index. A builder form also exists: `doc.table().row([...]).row([...])`. Tables break across pages automatically.

### Page numbers with buffered pages

Footers need the total page count, so buffer the pages and write the footer after the content. Set the bottom margin to 0 while writing inside it, otherwise PDFKit starts a new page.

```typescript
const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
// ... write all content ...
const { start, count } = doc.bufferedPageRange();
for (let i = start; i < start + count; i++) {
  doc.switchToPage(i);
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fontSize(8).text(`Page ${i + 1} of ${count}`, 50, doc.page.height - 30, { align: "center" });
  doc.page.margins.bottom = bottom;
}
doc.end();
```

### Fonts

The 14 standard fonts (Helvetica, Times-Roman, Courier and their bold/italic variants) are built in but only cover Western European characters. For anything else register a TTF/OTF/WOFF file:

```typescript
doc.registerFont("Inter", "./fonts/Inter-Regular.ttf");
doc.registerFont("Inter-Bold", "./fonts/Inter-Bold.ttf");
doc.font("Inter-Bold").fontSize(24).text("Quarterly Report");
doc.font("Inter").fontSize(12).text("Привет, Zürich, 東京");
```

### Streaming from Express

```typescript
import type { Response } from "express";

export function sendInvoice(res: Response, number: string) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${encodeURIComponent(number)}.pdf"`);
  doc.pipe(res);
  doc.fontSize(20).text(`Invoice ${number}`);
  doc.end();
}
```

## Examples

### Example 1: "Generate an invoice PDF with a line-item table"

```typescript
const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("INV-2026-0142.pdf"));
doc.fontSize(20).text("Invoice INV-2026-0142");
doc.moveDown().fontSize(10).table({
  columnStyles: [250, "*", "*"],
  data: [
    [{ text: "Item", font: { src: "Helvetica-Bold" } }, "Qty", "Amount"],
    ["Annual license", "1", "$1,200.00"],
    ["Support plan", "12", "$600.00"],
  ],
});
doc.end();
```

Result: a one-page A4 PDF with a title and a three-row table (verified with `pdftotext`).

### Example 2: "Add 'Page X of Y' to a 200-line report"

Use `bufferPages: true`, write the content, then run the footer loop above. Result: a 3-page PDF whose last page ends with `Page 3 of 3` and no blank extra page.

## Guidelines

- Always attach an `error` handler to the output stream and call `end()`; a forgotten `end()` yields an empty or truncated file.
- Writing text below the bottom margin silently adds a page. Reset the margin as shown when drawing footers.
- Standard fonts cannot display non-Latin text; register a font that has the glyphs.
- Do not build file paths or `Content-Disposition` names from raw user input; sanitize or encode them.
- Do not put untrusted URLs in `image()` arguments; PDFKit reads local paths and data URLs, so fetch and validate remote images yourself.
- For huge documents write straight to a stream instead of collecting a Buffer in memory.
- Do not use PDFKit to fill existing PDF forms or edit existing PDFs; it only creates new documents.
