---
name: csv-parse
description: >-
  Parse and generate CSV files with the csv package — stream large files,
  handle custom delimiters, transform records, validate data, and generate
  CSV output from objects. Use when tasks involve data import/export, ETL
  pipelines, processing uploaded CSV files, or generating downloadable reports.
license: Apache-2.0
compatibility: "Node.js 14+ or browser"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: document-generation
  tags: ["csv", "parsing", "streaming", "data-import", "export"]
---

# csv-parse

Parse and stringify CSV data. Streaming architecture handles files of any size.

## Setup

```bash
# Install the csv package (includes parse, stringify, transform, generate).
npm install csv
# Or install individual packages:
npm install csv-parse csv-stringify
```

## Parsing a CSV File

```typescript
// src/csv/parse-file.ts — Read a CSV file and convert rows to objects.
// Uses the header row as keys for each record object.
import { parse } from "csv-parse";
import fs from "fs";

export async function parseCsvFile(filePath: string): Promise<Record<string, string>[]> {
  const records: Record<string, string>[] = [];

  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,       // use first row as headers
      skip_empty_lines: true,
      trim: true,
    })
  );

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}
```

## Parsing a CSV String

```typescript
// src/csv/parse-string.ts — Parse CSV data from a string (e.g., API response body).
import { parse } from "csv-parse/sync";

export function parseCsvString(csvData: string) {
  return parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    cast: true,           // auto-cast numbers and booleans
    cast_date: true,      // auto-cast ISO date strings
  });
}
```

## Generating CSV Output

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

## Streaming Large Files

```typescript
// src/csv/stream.ts — Process million-row CSV files without loading into memory.
// Transform each record as it streams through.
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { transform } from "stream-transform";
import fs from "fs";

export function transformCsv(inputPath: string, outputPath: string) {
  fs.createReadStream(inputPath)
    .pipe(parse({ columns: true }))
    .pipe(
      transform((record: any) => ({
        name: record.name.toUpperCase(),
        email: record.email.toLowerCase(),
        total: Number(record.price) * Number(record.quantity),
      }))
    )
    .pipe(stringify({ header: true }))
    .pipe(fs.createWriteStream(outputPath));
}
```

## Custom Delimiters

```typescript
// src/csv/delimiters.ts — Handle TSV files, semicolon-separated, or pipe-delimited.
import { parse } from "csv-parse/sync";

// Tab-separated values
const tsvData = "name\tage\tcity\nAlice\t30\tPrague";
const tsvRecords = parse(tsvData, { columns: true, delimiter: "\t" });

// Semicolon-separated (common in European exports)
const csvData = "name;age;city\nAlice;30;Prague";
const csvRecords = parse(csvData, { columns: true, delimiter: ";" });
```

## Validation

```typescript
// src/csv/validate.ts — Validate CSV records during parsing and collect errors.
import { parse } from "csv-parse";
import fs from "fs";

interface ValidationError {
  line: number;
  field: string;
  message: string;
}

export async function validateCsv(
  filePath: string,
  requiredFields: string[]
): Promise<{ valid: any[]; errors: ValidationError[] }> {
  const valid: any[] = [];
  const errors: ValidationError[] = [];

  const parser = fs.createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true })
  );

  let line = 1;
  for await (const record of parser) {
    line++;
    let hasError = false;

    for (const field of requiredFields) {
      if (!record[field] || record[field].trim() === "") {
        errors.push({ line, field, message: `Missing required field: ${field}` });
        hasError = true;
      }
    }

    if (!hasError) valid.push(record);
  }

  return { valid, errors };
}
```

## Express API Endpoint

```typescript
// src/csv/api.ts — API endpoint that generates and streams a CSV download.
import { stringify } from "csv-stringify";
import type { Request, Response } from "express";

export function handleCsvExport(req: Request, res: Response, data: any[]) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=export.csv");

  const stringifier = stringify({ header: true });
  stringifier.pipe(res);

  for (const row of data) {
    stringifier.write(row);
  }

  stringifier.end();
}
```
