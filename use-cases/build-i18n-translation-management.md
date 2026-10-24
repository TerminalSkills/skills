---
title: Build an i18n Translation Management System
slug: build-i18n-translation-management
description: Build a translation management system with key tracking, missing translation detection, review workflow, locale-correct plural rules, and CI integration for multi-language apps.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - i18n
  - translation
  - localization
  - internationalization
  - multi-language
---

# Build an i18n Translation Management System

## The Problem

Tomás leads engineering at a 30-person SaaS expanding from English to Spanish, German, French, and Japanese. Translations live in JSON files that developers edit by hand. Nobody knows which keys are missing, so users see raw keys like `dashboard.metrics.title` in production. Translators work in spreadsheets that drift out of sync, and a new string needs a deploy. Pluralization is hardcoded (`${count} items` is wrong in Russian, which has four plural forms, and in Arabic, which has six). They need central key management, missing-translation checks, a review step, and a CI gate.

## The Solution

A small service on PostgreSQL (keys and translations as JSONB), Redis (a versioned cache), Hono (HTTP API) and Zod (request validation), written in TypeScript. Plural rules come from the runtime's built-in `Intl.PluralRules`, which carries the CLDR data, so there is no hand-written locale table to get wrong.

```bash
npm install hono @hono/node-server @hono/zod-validator zod ioredis pg
npm install --save-dev typescript tsx @types/node @types/pg
```

Set `"type": "module"` in `package.json` and export `DATABASE_URL`, `REDIS_URL` and `TMS_TOKEN`.

## Step-by-Step Walkthrough

### Step 1: Schema

```sql
CREATE TABLE translation_keys (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  namespace    TEXT NOT NULL,
  key          TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  plural_type  TEXT NOT NULL DEFAULT 'none' CHECK (plural_type IN ('none', 'cardinal', 'ordinal')),
  translations JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (namespace, key)
);
```

One row per key; every locale lives in the `translations` JSONB (`{"es": {"value": ..., "status": ...}}`). A translation moves from `review` to `approved`, and only `approved` and `published` ones are served.

### Step 2: Connections

```ts
import pg from "pg";
import { Redis } from "ioredis";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
```

### Step 3: The translation engine

Three details matter here. Postgres needs `$1::text` on a JSONB key lookup, because a bare `translations -> $1` fails with "operator is not unique". `pg` already returns JSONB parsed, so do not `JSON.parse` it. And writing one locale with `jsonb_set` is atomic, where read-modify-write loses edits when two translators save at once.

```ts
// src/i18n/manager.ts
import { pool, redis } from "../db";

export const SUPPORTED_LOCALES = ["en", "es", "de", "fr", "ja", "ar"];
const LIVE = ["approved", "published"];

export interface Translation {
  value: string;
  pluralForms?: Record<string, string>; // keyed by CLDR category: zero, one, two, few, many, other
  status: "draft" | "review" | "approved" | "published";
  translatedBy: string;
  updatedAt: string;
}

// The plural categories a locale needs, straight from the runtime's CLDR data
export const pluralCategories = (locale: string, type: Intl.PluralRuleType = "cardinal") =>
  new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories;

// Cache entries carry a version; bumping it invalidates every locale at once (no KEYS scan)
const version = async () => (await redis.get("i18n:version")) ?? "0";
const invalidate = () => redis.incr("i18n:version");

export async function getTranslations(locale: string, namespace?: string): Promise<Record<string, string>> {
  const cacheKey = `i18n:${await version()}:${locale}:${namespace ?? "all"}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    `SELECT namespace, key, translations -> $1::text AS t FROM translation_keys
     WHERE translations ? $1::text AND ($2::text IS NULL OR namespace = $2)`,
    [locale, namespace ?? null],
  );
  const out: Record<string, string> = {};
  for (const { namespace: ns, key, t } of rows) {
    if (!LIVE.includes(t.status)) continue; // jsonb columns arrive already parsed
    out[`${ns}.${key}`] = t.value;
    for (const [form, v] of Object.entries(t.pluralForms ?? {})) out[`${ns}.${key}_${form}`] = v as string;
  }
  await redis.set(cacheKey, JSON.stringify(out), "EX", 300);
  return out;
}

// Interpolation + plurals. `count` picks the CLDR plural form for the locale.
export function t(dict: Record<string, string>, key: string, params: Record<string, unknown> = {}, locale = "en"): string {
  let template = dict[key];
  if (typeof params.count === "number") {
    const form = new Intl.PluralRules(locale).select(params.count);
    template = dict[`${key}_${form}`] ?? dict[`${key}_other`] ?? template;
  }
  return (template ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{{${k}}}`));
}

export async function upsertKey(p: { namespace: string; key: string; description?: string; pluralType?: "none" | "cardinal" | "ordinal"; defaultValue?: string }) {
  const en = p.defaultValue
    ? { en: { value: p.defaultValue, status: "published", translatedBy: "system", updatedAt: new Date().toISOString() } }
    : {};
  await pool.query(
    `INSERT INTO translation_keys (namespace, key, description, plural_type, translations)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (namespace, key) DO UPDATE SET description = EXCLUDED.description, updated_at = now()`,
    [p.namespace, p.key, p.description ?? "", p.pluralType ?? "none", JSON.stringify(en)],
  );
  await invalidate();
}

export async function submitTranslation(namespace: string, key: string, locale: string, value: string, translatedBy: string, pluralForms?: Record<string, string>) {
  const { rows: [row] } = await pool.query("SELECT plural_type FROM translation_keys WHERE namespace = $1 AND key = $2", [namespace, key]);
  if (!row) throw new Error("Key not found");
  if (row.plural_type !== "none") {
    const missing = pluralCategories(locale, row.plural_type).filter((c) => !pluralForms?.[c]);
    if (missing.length) throw new Error(`${locale} needs plural forms: ${missing.join(", ")}`);
  }
  const entry: Translation = { value, pluralForms, status: "review", translatedBy, updatedAt: new Date().toISOString() };
  // jsonb_set changes one locale atomically, so two translators never overwrite each other
  await pool.query(
    `UPDATE translation_keys SET translations = jsonb_set(translations, ARRAY[$3::text], $4::jsonb), updated_at = now()
     WHERE namespace = $1 AND key = $2`,
    [namespace, key, locale, JSON.stringify(entry)],
  );
  await invalidate();
}

export async function approve(namespace: string, key: string, locale: string) {
  await pool.query(
    `UPDATE translation_keys SET translations = jsonb_set(translations, ARRAY[$3::text, 'status'], '"approved"'), updated_at = now()
     WHERE namespace = $1 AND key = $2 AND translations ? $3::text`,
    [namespace, key, locale],
  );
  await invalidate();
}

export async function findMissing(locale: string) {
  const { rows } = await pool.query(
    `SELECT namespace, key, description FROM translation_keys
     WHERE COALESCE(translations -> $1::text ->> 'status', '') <> ALL ($2::text[]) ORDER BY namespace, key`,
    [locale, LIVE],
  );
  return rows;
}

export async function getCoverage() {
  const { rows } = await pool.query(
    `SELECT l AS locale, COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE translations -> l ->> 'status' = ANY ($2::text[]))::int AS translated
     FROM translation_keys, unnest($1::text[]) AS l GROUP BY l`,
    [SUPPORTED_LOCALES, LIVE],
  );
  return Object.fromEntries(rows.map((r) => [r.locale, { ...r, percentage: r.total ? Math.round((100 * r.translated) / r.total) : 100 }]));
}

// Flat "ns.key" entries -> nested object, for libraries that load nested JSON files
export async function exportLocale(locale: string) {
  const nested: Record<string, any> = {};
  for (const [flat, value] of Object.entries(await getTranslations(locale))) {
    const parts = flat.split(".");
    const leaf = parts.pop()!;
    const parent = parts.reduce((o, p) => (o[p] ??= {}), nested);
    parent[leaf] = value;
  }
  return nested;
}
```

`pluralCategories("ru")` returns `one, few, many, other`, and `"ar"` returns all six. `submitTranslation` rejects a plural key that lacks any of them, so a translator cannot ship half the forms.

### Step 4: HTTP API

The app reads strings at runtime from the public routes. Writes and the missing-key list sit behind a bearer token.

```ts
// src/api.ts
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as i18n from "./i18n/manager";

const app = new Hono();
const locale = z.enum(i18n.SUPPORTED_LOCALES as [string, ...string[]]);

// Public, read-only: the app fetches its strings at runtime, so new text needs no deploy
app.get("/v1/translations/:locale", zValidator("param", z.object({ locale })), async (c) =>
  c.json(await i18n.getTranslations(c.req.valid("param").locale, c.req.query("namespace"))));
app.get("/v1/coverage", async (c) => c.json(await i18n.getCoverage()));

// Translators and CI use a token
const write = new Hono();
write.use(bearerAuth({ token: process.env.TMS_TOKEN! }));
write.get("/missing/:locale", zValidator("param", z.object({ locale })), async (c) =>
  c.json(await i18n.findMissing(c.req.valid("param").locale)));
write.post("/keys", zValidator("json", z.object({
  namespace: z.string().min(1), key: z.string().min(1), description: z.string().optional(),
  pluralType: z.enum(["none", "cardinal", "ordinal"]).optional(), defaultValue: z.string().optional(),
})), async (c) => { await i18n.upsertKey(c.req.valid("json")); return c.json({ ok: true }, 201); });
write.put("/translations/:namespace/:key/:locale", zValidator("json", z.object({
  value: z.string(), translatedBy: z.string(), pluralForms: z.record(z.string(), z.string()).optional(),
})), async (c) => {
  const { namespace, key, locale: l } = c.req.param();
  const b = c.req.valid("json");
  try { await i18n.submitTranslation(namespace, key, l, b.value, b.translatedBy, b.pluralForms); }
  catch (e) { return c.json({ error: (e as Error).message }, 400); }
  return c.json({ ok: true });
});
write.post("/translations/:namespace/:key/:locale/approve", async (c) => {
  const { namespace, key, locale: l } = c.req.param();
  await i18n.approve(namespace, key, l);
  return c.json({ ok: true });
});
app.route("/v1", write);

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" });
```

### Step 5: CI gate

```ts
// scripts/check-coverage.ts — CI step: fail the build when a locale is below the threshold
const res = await fetch(`${process.env.TMS_URL}/v1/coverage`);
const coverage: Record<string, { percentage: number }> = await res.json();
const MIN = 95;
const low = Object.entries(coverage).filter(([, c]) => c.percentage < MIN);
for (const [l, c] of low) console.error(`${l}: ${c.percentage}% (< ${MIN}%)`);
process.exit(low.length ? 1 : 0);
```

Run it with `TMS_URL=http://127.0.0.1:3000 npx tsx scripts/check-coverage.ts` in the pipeline. For the list of what is missing, call `GET /v1/missing/de` with the token.

## Real-World Example

Tomás's team loads the six locales into the service and wires the coverage script into CI with a 95% floor. Translators open the missing list for their language, submit values (plural keys need every form the locale requires), and a reviewer approves them. Because the app fetches `/v1/translations/:locale` with a five-minute cache, an approved string reaches production without a release. Raw keys stop appearing, since a locale that falls below the floor fails the build before it ships.

## Related Skills

- [typescript](/skills/typescript) - Types for the manager and API
- [redis](/skills/redis) - Versioned translation cache
- [postgresql](/skills/postgresql) - JSONB storage and queries
- [hono](/skills/hono) - The HTTP API
- [zod](/skills/zod) - Request validation
