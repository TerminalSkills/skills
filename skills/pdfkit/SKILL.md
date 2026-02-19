---
name: pdfkit
description: >-
  Generate PDF documents programmatically with PDFKit — add text, images,
  vector graphics, tables, headers/footers, and custom fonts. Use when tasks
  involve creating invoices, reports, certificates, or any structured PDF
  output from application data in Node.js.
license: Apache-2.0
compatibility: "Node.js 14+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: document-generation
  tags: ["pdf", "pdfkit", "reports", "invoices", "node"]
---

# PDFKit

Programmatic PDF generation for Node.js. Streaming architecture — write to files or HTTP responses.

## Setup

```bash
# Install PDFKit for PDF generation.
npm install pdfkit
npm install -D @types/pdfkit
```

## Basic Document

```typescript
// src/pdf/basic.ts — Create a simple PDF with text and save to file.
import PDFDocument from "pdfkit";
import fs from "fs";

const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(fs.createWriteStream("output.pdf"));

doc.fontSize(24).text("Monthly Report", { align: "center" });
doc.moveDown();
doc.fontSize(12).text("Generated on " + new Date().toLocaleDateString());
doc.moveDown(2);
doc.fontSize(11).text(
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  { align: "justify", lineGap: 4 }
);

doc.end();
```

## Tables

```typescript
// src/pdf/table.ts — Draw a table with headers and rows.
// PDFKit has no built-in table; draw it with lines and positioned text.
import PDFDocument from "pdfkit";

export function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  startY: number
) {
  const colWidth = (doc.page.width - 100) / headers.length;
  const rowHeight = 25;
  let y = startY;

  // Header row
  doc.font("Helvetica-Bold").fontSize(10);
  headers.forEach((header, i) => {
    doc.text(header, 50 + i * colWidth, y, { width: colWidth, align: "left" });
  });

  y += rowHeight;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();

  // Data rows
  doc.font("Helvetica").fontSize(10);
  for (const row of rows) {
    y += 5;
    row.forEach((cell, i) => {
      doc.text(cell, 50 + i * colWidth, y, { width: colWidth, align: "left" });
    });
    y += rowHeight;

    // Page break if needed
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 50;
    }
  }
}
```

## Images and Graphics

```typescript
// src/pdf/graphics.ts — Add images, draw shapes, and use vector graphics.
import PDFDocument from "pdfkit";
import fs from "fs";

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream("report.pdf"));

// Embed an image
doc.image("logo.png", 50, 50, { width: 150 });

// Draw a colored rectangle
doc.rect(50, 250, 200, 100).fill("#3498db");

// Draw a circle
doc.circle(400, 300, 50).fill("#e74c3c");

// Draw a line
doc.moveTo(50, 400).lineTo(550, 400).dash(5, { space: 5 }).stroke("#999");

doc.end();
```

## Headers and Footers

```typescript
// src/pdf/headers.ts — Add repeating headers and footers with page numbers.
import PDFDocument from "pdfkit";
import fs from "fs";

export function createDocWithHeaderFooter(title: string, outputPath: string) {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.pipe(fs.createWriteStream(outputPath));

  // Write content across multiple pages
  doc.fontSize(20).text(title, { align: "center" });
  doc.moveDown(2);
  for (let i = 0; i < 200; i++) {
    doc.fontSize(11).text(`Line ${i + 1}: Sample content for the report.`);
  }

  // Add headers and footers to all pages
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Header
    doc.fontSize(8).fillColor("#999")
      .text(title, 50, 20, { align: "left" })
      .text(new Date().toLocaleDateString(), 50, 20, { align: "right" });

    // Footer with page number
    doc.text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30, {
      align: "center",
    });
  }

  doc.end();
}
```

## Custom Fonts

```typescript
// src/pdf/fonts.ts — Register and use custom fonts for branded documents.
import PDFDocument from "pdfkit";
import fs from "fs";

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream("branded.pdf"));

// Register custom font
doc.registerFont("Inter", "./fonts/Inter-Regular.ttf");
doc.registerFont("Inter-Bold", "./fonts/Inter-Bold.ttf");

doc.font("Inter-Bold").fontSize(24).text("Branded Report");
doc.font("Inter").fontSize(12).text("Using custom Inter font throughout.");

doc.end();
```

## Streaming to HTTP Response

```typescript
// src/pdf/stream.ts — Generate PDFs on the fly and stream to Express responses.
import PDFDocument from "pdfkit";
import type { Response } from "express";

export function streamPdf(res: Response, title: string) {
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${title}.pdf"`);

  doc.pipe(res);
  doc.fontSize(20).text(title);
  doc.end();
}
```
