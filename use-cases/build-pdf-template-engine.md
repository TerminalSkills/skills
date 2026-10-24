---
title: Build a PDF Template Engine
slug: build-pdf-template-engine
description: Build a PDF generation system with reusable templates, dynamic data binding, multi-page layouts, headers/footers, table rendering, and batch generation for invoices, reports, and contracts.
skills:
  - typescript
  - redis
  - hono
  - zod
  - pdfkit
category: development
tags:
  - pdf
  - templates
  - generation
  - documents
  - reporting
---

# Build a PDF Template Engine

## The Problem

Petra leads engineering at a 20-person legal-tech company. They generate about 2,000 contracts a month. Each one is assembled by hand in Word, exported to PDF and emailed. Changing the company address means editing 15 templates, and client names, dates and amounts are copy-pasted, so typos get through. A headless-Chrome generator they tried was slow and heavy on memory per instance. They need templates that live as data, so the legal team can change wording without a developer, and an engine that renders multi-page documents with tables, headers and footers quickly.

## The Solution

Describe each template as JSON, validate it with [Zod](/skills/zod), and render it directly with [PDFKit](/skills/pdfkit) (no browser involved). Write it in [TypeScript](/skills/typescript), expose it through a small [Hono](/skills/hono) API, and use [Redis](/skills/redis) to cache templates and track batch progress.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install pdfkit hono @hono/node-server @hono/zod-validator zod ioredis
npm install -D typescript tsx @types/node @types/pdfkit
```

The code uses ES modules (`"type": "module"` in `package.json`) and was type-checked with `tsc --noEmit` under `strict`. PDFKit has a table API (`doc.table()`) that splits long tables across pages, so there is no hand-written row-height logic.

### Step 2: Define the template format

The template is data, so the schema is the contract between the template editor and the engine. Zod rejects a bad template at save time instead of at render time.

```typescript
// src/pdf/schema.ts
import { z } from "zod";

const style = z.object({
  fontSize: z.number().positive().optional(),
  bold: z.boolean().optional(),
  alignment: z.enum(["left", "center", "right"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).default({});

const text = z.object({ type: z.literal("text"), content: z.string(), style });
const pagebreak = z.object({ type: z.literal("pagebreak") });
const table = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  widths: z.array(z.number().positive()),      // percentages, one per column
  dataKey: z.string(),                         // variable holding the rows
  rowTemplate: z.array(z.string()),            // e.g. "{{item.price|money}}"
  totalRow: z.array(z.string()).optional(),
});

export const section = z.discriminatedUnion("type", [text, pagebreak, table])
  .and(z.object({ if: z.string().optional() })); // render only if this variable is truthy

export const templateSchema = z.object({
  name: z.string().min(1),
  pageSize: z.enum(["A4", "LETTER", "LEGAL"]).default("A4"),
  margin: z.number().min(20).max(120).default(56),
  fontSize: z.number().default(11),
  header: z.string().optional(),               // "{{company}}"
  footer: z.string().optional(),               // "Page {{_page}} of {{_pages}}"
  variables: z.array(z.object({ name: z.string(), required: z.boolean().default(false) })).default([]),
  sections: z.array(section),
});
export type Template = z.infer<typeof templateSchema>;
export type Section = z.infer<typeof section>;
```

### Step 3: Write the renderer

`interpolate` replaces `{{path}}` placeholders, with an optional `|money` filter that formats integer cents. Headers and footers are drawn after layout so `{{_pages}}` is known. PDFKit adds a page if you write below the bottom margin, so the footer code zeroes that margin while it draws.

```typescript
// src/pdf/engine.ts
import PDFDocument from "pdfkit";
import type { Section, Template } from "./schema";

type Data = Record<string, any>;
const money = (cents: unknown) => (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// {{path.to.value}} or {{path|money}}; unknown paths render as empty text
export function interpolate(tpl: string, data: Data): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(money))?\s*\}\}/g, (_, path: string, filter?: string) => {
    const value = path.split(".").reduce((v: any, k) => v?.[k], data);
    if (value == null) return "";
    return filter === "money" ? money(value) : String(value);
  });
}

export function renderPDF(tpl: Template, input: Data): Promise<Buffer> {
  const data: Data = { ...input, _date: new Date().toISOString().slice(0, 10) };
  for (const v of tpl.variables) if (v.required && data[v.name] == null) throw new Error(`Missing required variable: ${v.name}`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: tpl.pageSize, margin: tpl.margin, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica").fontSize(tpl.fontSize);
    for (const s of tpl.sections) {
      if (s.if && !data[s.if]) continue;
      renderSection(doc, s, data, tpl);
    }

    // Headers and footers go on after layout, once the page count is known.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const vars = { ...data, _page: i + 1, _pages: range.count };
      const w = doc.page.width - 2 * tpl.margin;
      doc.fontSize(8).fillColor("#666666").font("Helvetica");
      if (tpl.header) doc.text(interpolate(tpl.header, vars), tpl.margin, tpl.margin / 2, { width: w, align: "center" });
      if (tpl.footer) {
        // writing below the bottom margin would add a page, so drop the margin first
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.text(interpolate(tpl.footer, vars), tpl.margin, doc.page.height - tpl.margin / 2 - 8, { width: w, align: "center" });
        doc.page.margins.bottom = bottom;
      }
    }
    doc.end();
  });
}

function renderSection(doc: PDFKit.PDFDocument, s: Section, data: Data, tpl: Template) {
  switch (s.type) {
    case "text": {
      doc.font(s.style.bold ? "Helvetica-Bold" : "Helvetica").fontSize(s.style.fontSize ?? tpl.fontSize)
        .fillColor(s.style.color ?? "#111111")
        .text(interpolate(s.content, data), { align: s.style.alignment ?? "left" }).moveDown(0.6);
      break;
    }
    case "pagebreak":
      doc.addPage();
      break;
    case "table": {
      const w = doc.page.width - 2 * tpl.margin;
      const rows: unknown[] = Array.isArray(data[s.dataKey]) ? data[s.dataKey] : [];
      const body = rows.map((item) => s.rowTemplate.map((c) => interpolate(c, { ...data, item })));
      doc.font("Helvetica").fontSize(10).fillColor("#111111");
      doc.table({
        columnStyles: s.widths.map((p) => (w * p) / 100),
        data: [
          s.headers.map((h) => ({ text: h, font: { src: "Helvetica-Bold" }, backgroundColor: "#f1f3f5" })),
          ...body,
          ...(s.totalRow ? [s.totalRow.map((c) => ({ text: interpolate(c, data), font: { src: "Helvetica-Bold" } }))] : []),
        ],
      });
      doc.moveDown(0.6);
      break;
    }
  }
}
```

### Step 4: Try it

```typescript
// src/demo.ts
import { writeFileSync } from "node:fs";
import { templateSchema } from "./pdf/schema";
import { renderPDF } from "./pdf/engine";
const tpl = templateSchema.parse({
  name: "Service agreement", header: "{{company}}", footer: "Page {{_page}} of {{_pages}}",
  variables: [{ name: "client", required: true }],
  sections: [
    { type: "text", content: "Service Agreement", style: { fontSize: 20, bold: true } },
    { type: "text", content: "Between {{company}} and {{client.name}}, dated {{_date}}." },
    { type: "table", headers: ["Item", "Qty", "Price"], widths: [60, 15, 25], dataKey: "items", rowTemplate: ["{{item.name}}", "{{item.qty}}", "{{item.price|money}}"], totalRow: ["Total", "", "{{total|money}}"] },
    { type: "text", content: "Rush clause applies.", if: "rush" },
  ],
});
const items = Array.from({ length: 80 }, (_, i) => ({ name: `Line item ${i + 1}`, qty: 1 + (i % 3), price: 12500 + i }));
const buf = await renderPDF(tpl, { company: "Acme Legal", client: { name: "Globex" }, items, total: 1000000, rush: true });
writeFileSync("agreement.pdf", buf);
```

Run it with `npx tsx src/demo.ts`. With 80 line items this gave a 2-page PDF in well under a second (checked with `pdftotext -layout`), with the header on both pages, the table continuing on page 2, the total row, the conditional clause, and "Page 2 of 2" in the footer.

### Step 5: Serve it with Hono, Zod and Redis

Templates are stored in Postgres (a `pdf_templates` table with `id text primary key` and `body jsonb`; `./db` is your own pool). Redis holds a 5-minute cache of parsed templates and the progress counters of each batch. The server binds to `127.0.0.1`; put authentication and a reverse proxy in front of it before exposing it.

```typescript
// src/api.ts
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Redis } from "ioredis";
import { z } from "zod";
import { pool } from "./db";
import { templateSchema, type Template } from "./pdf/schema";
import { renderPDF } from "./pdf/engine";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const app = new Hono();

// Templates live in Postgres (table pdf_templates: id text primary key, body jsonb);
// Redis only caches the parsed copy for 5 minutes.
async function loadTemplate(id: string): Promise<Template | null> {
  const cached = await redis.get(`pdf:tpl:${id}`);
  if (cached) return templateSchema.parse(JSON.parse(cached));
  const { rows } = await pool.query("SELECT body FROM pdf_templates WHERE id = $1", [id]);
  if (!rows[0]) return null;
  const tpl = templateSchema.parse(rows[0].body);
  await redis.set(`pdf:tpl:${id}`, JSON.stringify(tpl), "EX", 300);
  return tpl;
}

app.put("/templates/:id", zValidator("json", templateSchema), async (c) => {
  const id = c.req.param("id");
  await pool.query(
    "INSERT INTO pdf_templates (id, body) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET body = $2",
    [id, JSON.stringify(c.req.valid("json"))],
  );
  await redis.del(`pdf:tpl:${id}`);
  return c.json({ id });
});

app.post("/templates/:id/render", zValidator("json", z.record(z.string(), z.unknown())), async (c) => {
  const tpl = await loadTemplate(c.req.param("id"));
  if (!tpl) return c.json({ error: "template not found" }, 404);
  try {
    const pdf = await renderPDF(tpl, c.req.valid("json"));
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
  } catch (e) { return c.json({ error: (e as Error).message }, 422); }
});

// Batch: respond at once, render in the background, report progress through Redis
app.post("/batches", zValidator("json", z.object({
  templateId: z.string(),
  items: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
})), async (c) => {
  const { templateId, items } = c.req.valid("json");
  const tpl = await loadTemplate(templateId);
  if (!tpl) return c.json({ error: "template not found" }, 404);

  const id = randomUUID();
  const dir = `${process.env.OUTPUT_DIR ?? "./out"}/${id}`;
  await mkdir(dir, { recursive: true });
  await redis.hset(`pdf:batch:${id}`, { total: items.length, done: 0, failed: 0 });
  await redis.expire(`pdf:batch:${id}`, 86400);

  void (async () => {
    for (const [i, item] of items.entries()) {
      try {
        await writeFile(`${dir}/${i}.pdf`, await renderPDF(tpl, item));
        await redis.hincrby(`pdf:batch:${id}`, "done", 1);
      } catch {
        await redis.hincrby(`pdf:batch:${id}`, "failed", 1);
      }
    }
  })();
  return c.json({ id }, 202);
});

app.get("/batches/:id", async (c) => {
  const status = await redis.hgetall(`pdf:batch:${c.req.param("id")}`);
  return Object.keys(status).length ? c.json(status) : c.json({ error: "not found" }, 404);
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3300) });
```

`POST /templates/:id/render` returns the PDF. `POST /batches` returns `202` with a batch id, and `GET /batches/:id` returns `{ total, done, failed }` while files are written to `OUTPUT_DIR`. The batch loop runs inside the API process; for thousands of documents move it to a worker that reads jobs from a Redis-backed queue, so a restart does not lose a run.

## Real-World Example

Petra's team moves three contract types into this format. The company address becomes one variable, the client block comes from the CRM record, and the legal team edits the JSON through an internal form that calls `PUT /templates/:id` (a bad template comes back as a 400 with the Zod error). The month-end run posts 2,000 client records to `/batches` and watches `done` climb. A regression test renders every template against a sample record and compares the `pdftotext` output, so a wording change cannot silently break the layout.

## Related Skills

- [typescript](/skills/typescript): strict typing for the template model and the renderer
- [zod](/skills/zod): template and request validation
- [pdfkit](/skills/pdfkit): text, drawing, tables and multi-page layout
- [hono](/skills/hono): the HTTP API around the renderer
- [redis](/skills/redis): template cache and batch progress
