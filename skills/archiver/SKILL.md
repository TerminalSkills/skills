---
name: archiver
description: >-
  Create ZIP and TAR archives programmatically with Archiver — bundle files,
  directories, and streams into compressed archives with progress tracking.
  Use when tasks involve generating downloadable bundles, backing up directories,
  creating deployment packages, or building export features that zip multiple
  files together.
license: Apache-2.0
compatibility: "Node.js 14+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: document-generation
  tags: ["zip", "tar", "archive", "compression", "bundling"]
---

# Archiver

Create ZIP and TAR archives from files, directories, and streams. Streaming architecture for large archives.

## Setup

```bash
# Install archiver for creating archives.
npm install archiver
npm install -D @types/archiver
```

## Creating a ZIP Archive

```typescript
// src/archive/zip.ts — Bundle multiple files into a ZIP archive.
import archiver from "archiver";
import fs from "fs";

export async function createZip(files: string[], outputPath: string): Promise<void> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(`Archive created: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on("error", reject);
    archive.pipe(output);

    for (const file of files) {
      archive.file(file, { name: file.split("/").pop()! });
    }

    archive.finalize();
  });
}
```

## Archiving Directories

```typescript
// src/archive/directory.ts — Recursively add an entire directory to a ZIP.
import archiver from "archiver";
import fs from "fs";

export async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    // Add entire directory, preserving structure
    archive.directory(sourceDir, false);

    // Or nest under a folder name inside the archive
    // archive.directory(sourceDir, "my-project");

    archive.finalize();
  });
}
```

## Adding Buffers and Streams

```typescript
// src/archive/buffers.ts — Add in-memory content (buffers, strings) to archives
// without writing temporary files.
import archiver from "archiver";
import fs from "fs";

export async function createArchiveFromData(
  entries: { name: string; content: string | Buffer }[],
  outputPath: string
): Promise<void> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }

    archive.finalize();
  });
}

// Example: bundle generated reports
// await createArchiveFromData([
//   { name: "report.csv", content: csvString },
//   { name: "report.json", content: JSON.stringify(data) },
//   { name: "README.txt", content: "Generated reports bundle" },
// ], "reports.zip");
```

## TAR Archives

```typescript
// src/archive/tar.ts — Create gzipped TAR archives for deployment or backup.
import archiver from "archiver";
import fs from "fs";

export async function createTarGz(sourceDir: string, outputPath: string): Promise<void> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("tar", { gzip: true, gzipOptions: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
```

## Progress Tracking

```typescript
// src/archive/progress.ts — Track archive creation progress for large bundles.
import archiver from "archiver";
import fs from "fs";

export async function createZipWithProgress(
  sourceDir: string,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);

    archive.on("progress", (progress) => {
      const percent = (progress.entries.processed / progress.entries.total) * 100;
      onProgress(Math.round(percent));
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
```

## Streaming to HTTP Response

```typescript
// src/archive/api.ts — Stream a ZIP archive directly to an Express response
// without writing to disk.
import archiver from "archiver";
import type { Response } from "express";

export function streamZipResponse(
  res: Response,
  files: { name: string; content: string | Buffer }[]
) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=export.zip");

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  for (const file of files) {
    archive.append(file.content, { name: file.name });
  }

  archive.finalize();
}
```
