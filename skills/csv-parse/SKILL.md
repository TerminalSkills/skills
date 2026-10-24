---
name: csv-parse
description: >-
  Parse and generate CSV files with the csv package — stream large files,
  handle custom delimiters, transform records, validate data, and generate
  CSV output from objects. Use when tasks involve data import/export, ETL
  pipelines, processing uploaded CSV files, or generating downloadable reports.
license: Apache-2.0
compatibility: "csv-parse 7, csv-stringify 6, Node.js (ES modules), or a browser"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/adaltas/node-csv
  category: documents
  tags: ["csv", "parsing", "streaming", "data-import", "export"]
---

# csv-parse

## Overview

The `csv` project (node-csv) is four packages: `csv-parse`, `csv-stringify`, `stream-transform` and `csv-generate`. The `csv` package re-exports all four. Parsers and stringifiers are Node.js streams, with a `/sync` entry point for small inputs and a `/browser/esm` build for browsers. Values come out as strings unless you ask for casting. Checked against csv-parse 7.0.3, csv-stringify 6.9.0 and stream-transform 3.6.0.

## Instructions

### Setup

```bash
npm install csv-parse csv-stringify stream-transform
```

`npm install csv` installs everything in one package; the examples below import from the individual packages. They are ES modules (`"type": "module"` in package.json), and they type-check with `tsc` under `module: nodenext`.

### Parsing a CSV file

```typescript
// src/csv/parse-file.ts — Read a CSV file and convert rows to objects.
// Uses the header row as keys for each record object.
import { parse } from "csv-parse";
import fs from "node:fs";

export async function parseCsvFile(filePath: string): Promise<Record<string, string>[]> {
  const records: Record<string, string>[] = [];

  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,       // use first row as headers
      skip_empty_lines: true,
      trim: true,
      bom: true,           // strip the byte-order mark Excel adds to UTF-8 files
    })
  );

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}
```

Without `skip_empty_lines`, a blank line at the end of the file raises `CSV_RECORD_INCONSISTENT_COLUMNS`. Without `bom: true`, the first header of a file saved by Excel starts with an invisible character, so `record.name` is `undefined`.

### Parsing a CSV String

```typescript
// src/csv/parse-string.ts — Parse CSV data from a string (e.g., API response body).
import { parse } from "csv-parse/sync";

export function parseCsvString(csvData: string) {
  return parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    cast: true,           // numeric strings become numbers; "true" stays a string
    cast_date: true,      // date strings become Date objects
  });
}
```

### Generating CSV Output

```typescript
// src/csv/stringify.ts — Convert objects to CSV strings for download or file export.
import { stringify } from "csv-stringify/sync";

interface SalesRow {
  product: string;
  revenue: number;
  units: number;
  date: string;
}

export function generateCsv(data: SalesRow[]): string {
  return stringify(data, {
    header: true,
    columns: [
      { key: "product", header: "Product Name" },
      { key: "revenue", header: "Revenue ($)" },
      { key: "units", header: "Units Sold" },
      { key: "date", header: "Date" },
    ],
  });
}
```

### Streaming Large Files

```typescript
// src/csv/stream.ts — Process million-row CSV files without loading into memory.
// Transform each record as it streams through.
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { transform } from "stream-transform";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";

export async function transformCsv(inputPath: string, outputPath: string) {
  // pipeline() forwards an error from any stage and closes every stream;
  // a plain .pipe() chain leaves parse errors unhandled.
  await pipeline(
    fs.createReadStream(inputPath),
    parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }),
    transform((record: Record<string, string>) => ({
      name: record.name.toUpperCase(),
      email: record.email.toLowerCase(),
      total: Number(record.price) * Number(record.quantity),
    })),
    stringify({ header: true }),
    fs.createWriteStream(outputPath)
  );
}
```

### Custom Delimiters

```typescript
// src/csv/delimiters.ts — Handle TSV files, semicolon-separated, or pipe-delimited.
import { parse } from "csv-parse/sync";

// Tab-separated values
const tsvData = "name\tage\tcity\nAlice Moreau\t30\tPrague";
const tsvRecords = parse(tsvData, { columns: true, delimiter: "\t" });

// Semicolon-separated (common in European exports)
const csvData = "name;age;city\nAlice;30;Prague";
const csvRecords = parse(csvData, { columns: true, delimiter: ";" });

// Unknown delimiter: let the parser pick one from the first rows
const guessed = parse(csvData, { columns: true, delimiter_auto: true });
```

Use `delimiter_auto` only when the delimiter really is unknown. A fixed `delimiter` is faster and never guesses wrong.

### Validation

```typescript
// src/csv/validate.ts — Validate CSV records during parsing and collect errors.
import { parse } from "csv-parse";
import fs from "node:fs";

interface ValidationError {
  line: number;
  field: string;
  message: string;
}

export async function validateCsv(
  filePath: string,
  requiredFields: string[]
): Promise<{ valid: Record<string, string>[]; errors: ValidationError[] }> {
  const valid: Record<string, string>[] = [];
  const errors: ValidationError[] = [];

  const parser = fs.createReadStream(filePath).pipe(
    // info: true wraps each row as { record, info }; info.lines is the real
    // line number even when quoted fields span several lines.
    parse({ columns: true, skip_empty_lines: true, trim: true, bom: true, info: true })
  );

  for await (const { record, info } of parser) {
    const missing = requiredFields.filter((field) => !record[field]);
    for (const field of missing) {
      errors.push({ line: info.lines, field, message: `Missing required field: ${field}` });
    }
    if (missing.length === 0) valid.push(record);
  }

  return { valid, errors };
}
```

A row with the wrong number of columns throws `CsvError` (`code: "CSV_RECORD_INCONSISTENT_COLUMNS"`) and ends the stream. To keep going, set `skip_records_with_error: true` and listen for `parser.on("skip", (err) => …)`, or set `relax_column_count: true` to accept short and long rows.

### Express API endpoint

```typescript
// src/csv/api.ts — API endpoint that streams a CSV download.
import { stringify } from "csv-stringify";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";

export async function handleCsvExport(req: Request, res: Response, data: Record<string, unknown>[]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');
  await pipeline(Readable.from(data), stringify({ header: true }), res);
}
```

## Examples

### Example 1: Import a customer export
**User prompt:** "Read exports/customers-2026-10.csv from our CRM and give me the rows as objects. It has name, email, price, quantity and signup columns."

The agent uses `parseCsvFile("exports/customers-2026-10.csv")`. For a file with one row `Alice Moreau, ALICE@NORTHWIND.IO, 12.5, 2, 2026-03-01` the result is `[{ name: "Alice Moreau", email: "ALICE@NORTHWIND.IO", price: "12.5", quantity: "2", signup: "2026-03-01" }]`: trimmed, all strings. With `cast: true` and `cast_date: true`, price becomes `12.5` and signup becomes a `Date`.

### Example 2: Add a total column to a large file
**User prompt:** "Take orders.csv (about 2 million rows), uppercase the customer name, and write orders-with-totals.csv with total = price × quantity."

The agent calls `transformCsv("orders.csv", "orders-with-totals.csv")` from the streaming section. Memory stays flat because rows move through `pipeline()` one at a time. The output starts `name,email,total` followed by `ALICE MOREAU,alice@northwind.io,25`.

## Guidelines

- Use the `/sync` entry points only for small inputs; they load everything into memory. Use streams for files you do not control.
- Prefer `pipeline()` from `node:stream/promises` over chained `.pipe()` so errors are not lost.
- Parsed values are strings. Convert with `cast`, an `on_record` callback, or by hand; validate before trusting numbers or dates.
- Set `bom: true` for files from Excel, and `skip_empty_lines: true` for files that end with a blank line.
- Spreadsheet apps run text starting with `=`, `+`, `-` or `@` as formulas. When you generate CSV from user input, pass `escape_formulas: true` to `stringify`.
- Set `encoding` when the input is not UTF-8 (for example `latin1`); the parser reads UTF-8 by default.
- csv-parse is for delimited text. For `.xlsx` files use a spreadsheet library.
