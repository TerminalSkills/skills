---
name: archiver
description: >-
  Archiver is a Node.js library that builds ZIP and TAR (optionally gzipped)
  archives as streams from files, directories, globs, strings and buffers. Use
  when a task involves zipping files in Node, generating downloadable bundles,
  backing up a directory to .tar.gz, building a deployment package, or
  streaming a ZIP in an HTTP response without a temporary file.
license: Apache-2.0
compatibility: "Node.js 18+, ESM only (archiver 8)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/archiverjs/node-archiver
  category: documents
  tags: ["zip", "tar", "archive", "compression", "bundling"]
---

# Archiver

## Overview

Archiver (current: 8.0.0) streams ZIP and TAR archives to any writable stream: a file, an HTTP response or an upload. Version 8 changed the API, so snippets from older articles fail:

- The package is ESM only (`import`, not `require`).
- There is no `archiver("zip")` factory any more; use the classes `ZipArchive`, `TarArchive` and `JsonArchive`.
- It ships no type declarations of its own; for TypeScript install `@types/archiver` (8.x describes the v8 classes).
- `archive.finalize()` returns a promise.

The examples below ran on Node 24 with archiver 8.0.0 and the results were listed with `unzip -l` and `tar tzf`.

## Instructions

### Install

```bash
npm install archiver
```

Set `"type": "module"` in `package.json`, or name files `.mjs`.

### Write an archive to a file

`pipeline` from `node:stream/promises` rejects on any stream error and resolves when the file is fully written. Start it before adding entries, then call `finalize()`.

```javascript
// archive.mjs
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive, TarArchive } from "archiver";

async function build(archive, outputPath, fill) {
  archive.on("warning", (err) => {
    if (err.code !== "ENOENT") throw err;       // a missing source file is only a warning
    console.warn("skipped:", err.message);
  });
  const written = pipeline(archive, createWriteStream(outputPath));
  fill(archive);
  await archive.finalize();
  await written;
  return archive.pointer();                       // total bytes
}

export function zipFiles(files, outputPath) {
  return build(new ZipArchive({ zlib: { level: 9 } }), outputPath, (a) => {
    for (const file of files) a.file(file, { name: basename(file) });
  });
}

export function zipDirectory(dir, outputPath, rootName = false) {
  // rootName false: contents at the archive root; a string nests them under that folder
  return build(new ZipArchive({ zlib: { level: 6 } }), outputPath, (a) => a.directory(dir, rootName));
}

export function zipEntries(entries, outputPath) {
  return build(new ZipArchive(), outputPath, (a) => {
    for (const entry of entries) a.append(entry.content, { name: entry.name }); // string, Buffer or Readable
  });
}

export function tarGz(dir, outputPath) {
  return build(new TarArchive({ gzip: true, gzipOptions: { level: 9 } }), outputPath, (a) => a.directory(dir, false));
}
```

Other sources: `archive.glob("reports/**/*.csv", { cwd: baseDir })`, `archive.symlink(name, target)`, and entry options such as `{ name, date, mode }`. Use `{ store: true }` on `ZipArchive` to skip compression for already compressed files.

### Stream to an HTTP response

Nothing touches the disk. Once headers are sent a failure cannot change the status code, so destroy the connection and stop the archive when the client leaves.

```javascript
// server.mjs
import http from "node:http";
import { ZipArchive } from "archiver";

export function sendZip(res, entries, filename = "export.zip") {
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (err) => res.destroy(err));
  res.on("close", () => archive.abort());
  archive.pipe(res);
  for (const entry of entries) archive.append(entry.content, { name: entry.name });
  return archive.finalize();
}

http.createServer((req, res) =>
  sendZip(res, [{ name: "report.csv", content: "month,total\n2026-09,1200\n" }]),
).listen(8080, "127.0.0.1");
```

With Express, pass `res` the same way (`sendZip(res, entries)`).

### Progress

```javascript
archive.on("progress", ({ entries, fs }) => {
  console.log(`${entries.processed} entries, ${fs.processedBytes} bytes read`);
});
```

`entries.total` grows while a directory is still being scanned, so `processed / total` is not a reliable percentage. For a real percentage, sum the source file sizes first and divide `fs.processedBytes` by that.

## Examples

### Example 1: "Zip the build folder for release"

```javascript
import { zipDirectory } from "./archive.mjs";
const bytes = await zipDirectory("dist", "storefront-v2.4.0.zip", "storefront");
console.log(bytes);
```

```console
$ unzip -l storefront-v2.4.0.zip
  storefront/css/
  storefront/css/app.css
  storefront/index.html
```

### Example 2: "Back up uploads as a .tar.gz"

```javascript
import { tarGz } from "./archive.mjs";
await tarGz("/var/www/uploads", `/backups/uploads-${new Date().toISOString().slice(0, 10)}.tar.gz`);
```

```console
$ tar tzf /backups/uploads-2026-10-24.tar.gz
avatars/
avatars/mira.png
invoices/INV-2041.pdf
```

### Example 3: "Let users download their monthly report as a ZIP"

Call `sendZip(res, [{ name: "report.csv", content: csv }, { name: "report.json", content: JSON.stringify(data) }], "report-2026-09.zip")` from the route handler. A request returns `200 application/zip` with both files inside.

## Guidelines

- Register `warning` and `error` handlers (or use `pipeline`) before adding entries; an unhandled `error` event crashes the process.
- Never build entry names from user input without removing `..` and absolute paths; extractors can write outside the target directory.
- `archive.directory(dir, false)` puts the contents at the root; pass a string to keep a top-level folder.
- Do not append the output file to a directory you are archiving into the same folder.
- For extracting archives use a separate library (such as `yauzl` or `tar`); Archiver only creates them.
