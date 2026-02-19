---
name: docx
description: >-
  Generate Word documents programmatically with the docx library — create
  paragraphs, tables, images, headers, footers, numbered lists, and styled
  content. Use when tasks involve generating contracts, proposals, resumes,
  or any .docx output from application data in Node.js.
license: Apache-2.0
compatibility: "Node.js 14+ or browser"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: document-generation
  tags: ["docx", "word", "document", "reports", "office"]
---

# docx

Generate .docx files from code. No Word installation needed.

## Setup

```bash
# Install the docx library for Word document generation.
npm install docx
```

## Basic Document

```typescript
// src/docx/basic.ts — Create a Word document with a heading, paragraph, and save.
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import fs from "fs";

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "Monthly Report", bold: true })],
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new TextRun("This report covers performance metrics for "),
            new TextRun({ text: "January 2025", bold: true }),
            new TextRun(". All figures are preliminary."),
          ],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("report.docx", buffer);
```

## Tables

```typescript
// src/docx/tables.ts — Create a formatted table with header row and data.
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, BorderStyle, ShadingType,
} from "docx";
import fs from "fs";

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF" })] })],
    shading: { type: ShadingType.SOLID, color: "3498DB" },
  });
}

function createCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph(text)],
  });
}

const table = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: [createHeaderCell("Name"), createHeaderCell("Revenue"), createHeaderCell("Growth")] }),
    new TableRow({ children: [createCell("Product A"), createCell("$45,000"), createCell("+12%")] }),
    new TableRow({ children: [createCell("Product B"), createCell("$32,000"), createCell("+8%")] }),
  ],
});

const doc = new Document({ sections: [{ children: [table] }] });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("table.docx", buffer);
```

## Images

```typescript
// src/docx/images.ts — Embed images in a Word document from file or URL.
import { Document, Packer, Paragraph, ImageRun } from "docx";
import fs from "fs";

const imageBuffer = fs.readFileSync("logo.png");

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: { width: 200, height: 60 },
              type: "png",
            }),
          ],
        }),
        new Paragraph("Company logo above."),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("with-image.docx", buffer);
```

## Headers, Footers, and Page Numbers

```typescript
// src/docx/headers.ts — Add headers and footers with page numbers.
import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  PageNumber, AlignmentType,
} from "docx";
import fs from "fs";

const doc = new Document({
  sections: [
    {
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "Confidential", italics: true, color: "999999" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("Page "),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(" of "),
                new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({ text: "Document content goes here." }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("with-headers.docx", buffer);
```

## Lists

```typescript
// src/docx/lists.ts — Create bulleted and numbered lists.
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import fs from "fs";

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "numbered-list",
        levels: [
          { level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT },
        ],
      },
    ],
  },
  sections: [
    {
      children: [
        new Paragraph({ text: "Action Items:", heading: "Heading2" as any }),
        ...[
          "Review Q1 metrics",
          "Update pricing model",
          "Schedule team sync",
        ].map(
          (item) =>
            new Paragraph({
              children: [new TextRun(item)],
              numbering: { reference: "numbered-list", level: 0 },
            })
        ),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("lists.docx", buffer);
```
