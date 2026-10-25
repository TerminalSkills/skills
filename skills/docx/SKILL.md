---
name: docx
description: >-
  The docx library generates Word (.docx) files from Node.js or the browser in code, with no Word installation: paragraphs, tables, images, headers, footers, page numbers and numbered or bulleted lists. Use when someone asks to "generate a Word document from data", "create a .docx report in Node", "build a contract or proposal as docx", or "add page numbers to a generated Word file".
license: Apache-2.0
compatibility: "Node.js 16+ or a modern browser; docx 9.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  repository: https://github.com/dolanmiu/docx
  tags: "docx, word, document, reports, office"
---

# docx

## Overview

`docx` (npm package, repository dolanmiu/docx, version 9.14.0 when checked on 2026-10-24) builds Word documents declaratively: you create a `Document` with sections, then serialise it with `Packer`. It writes new files; it does not edit existing ones. The examples below were run against 9.14.0 and produced a valid .docx.

## Instructions

```bash
npm install docx
```

Use ES modules (`"type": "module"` in package.json) so top-level `await` works, or wrap the code in an async function.

1. Build a `Document({ sections: [{ children: [...] }] })`. Section content is `Paragraph` and `Table` objects.
2. Serialise with `await Packer.toBuffer(doc)` (Node), `Packer.toBlob(doc)` (browser) or `Packer.toBase64String(doc)`.
3. Write the buffer with `fs.writeFileSync`.

Things that differ from older tutorials:

- `ImageRun` needs `type` (`"png"`, `"jpg"`, `"gif"`, `"bmp"` or `"svg"`; svg also needs a `fallback` image). Omitting it is a TypeScript error. Add `altText` for accessibility.
- Table cell colour is `shading: { type: ShadingType.CLEAR, fill: "1F4E79", color: "auto" }`. `fill` is the cell background; this form was run and produced a valid file.
- Lists are not automatic: declare a `numbering.config` entry (use `LevelFormat.DECIMAL` or `LevelFormat.BULLET`) and refer to it with `numbering: { reference, level }` on each paragraph.
- Use the `HeadingLevel` enum (`HeadingLevel.HEADING_2`), never a string cast to `any`.

## Examples

### Example 1: "Generate a monthly report with a table and page numbers"

```typescript
// report.ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, Footer, PageNumber, AlignmentType,
} from "docx";
import fs from "node:fs";

const cell = (text: string, head = false) =>
  new TableCell({
    shading: head ? { type: ShadingType.CLEAR, fill: "1F4E79", color: "auto" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: head, color: head ? "FFFFFF" : undefined })] })],
  });

const doc = new Document({
  sections: [{
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })],
        })],
      }),
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, text: "Monthly Report" }),
      new Paragraph({ children: [new TextRun("Covers "), new TextRun({ text: "September 2026", bold: true }), new TextRun(". Figures are preliminary.")] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [cell("Plan", true), cell("Revenue", true), cell("Growth", true)] }),
          new TableRow({ children: [cell("Starter"), cell("$45,000"), cell("+12%")] }),
          new TableRow({ children: [cell("Growth"), cell("$32,000"), cell("+8%")] }),
        ],
      }),
    ],
  }],
});

fs.writeFileSync("report.docx", await Packer.toBuffer(doc));
```

Run `npx tsx report.ts`; the result is `report.docx` with a heading, a shaded header row that repeats on page breaks, and "Page 1 of 1" in the footer (Word fills the fields in when it opens the file).

### Example 2: "Add a logo, a confidentiality header and a numbered action list"

```typescript
// proposal.ts
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Header, AlignmentType, LevelFormat, HeadingLevel,
} from "docx";
import fs from "node:fs";

const doc = new Document({
  numbering: {
    config: [
      { reference: "actions", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }] },
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }] },
    ],
  },
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Confidential", italics: true, color: "999999" })] })],
      }),
    },
    children: [
      new Paragraph({
        children: [new ImageRun({
          type: "png",
          data: fs.readFileSync("logo.png"),
          transformation: { width: 200, height: 60 },
          altText: { name: "logo", title: "Company logo", description: "Northwind Studio logo" },
        })],
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Action items" }),
      ...["Review Q3 metrics", "Update pricing model", "Schedule team sync"].map(
        (item) => new Paragraph({ text: item, numbering: { reference: "actions", level: 0 } }),
      ),
      new Paragraph({ text: "Open question: renewal terms", numbering: { reference: "bullets", level: 0 } }),
    ],
  }],
});

fs.writeFileSync("proposal.docx", await Packer.toBuffer(doc));
```

The output has the logo at the top, a right-aligned grey "Confidential" header on every page, a numbered list 1.-3. and one bullet.

## Guidelines

- Pass real `Buffer` data to `ImageRun`; to embed a remote image, download it first and check the response is an image.
- Page-number fields are computed by Word on open; a viewer that does not recalculate fields may show them blank.
- For many repeated items, generate the `Paragraph`/`TableRow` arrays with `map` rather than building the XML by hand.
- To check output without Word, unzip the file (`unzip -p report.docx word/document.xml`) or open it in LibreOffice.
- Do not use this library to edit an existing .docx or to read one; use a parser for reading and a template-filling tool for edits.
-
