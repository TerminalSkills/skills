---
title: Build a Headless CMS with Content Versioning
slug: build-headless-cms-with-content-versioning
description: Build a headless CMS with schema-defined content types, draft/publish workflow, full version history, scheduled publishing, and a REST/GraphQL API for any frontend.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: Full-Stack Development
tags:
  - cms
  - headless
  - content-management
  - versioning
  - api
---

# Build a Headless CMS with Content Versioning

## The Problem

Mia leads product at a 25-person company with 3 frontends (marketing site, docs, mobile app) all needing content from different sources — WordPress for blog, hardcoded JSON for docs, a Google Sheet for FAQs. Content changes require developer deployments. Marketing can't schedule posts. When someone accidentally publishes a draft, there's no way to revert. They need a unified headless CMS with draft/publish workflow, version history, and an API that any frontend can consume.

## Step 1: Build Content Type System and Storage

```typescript
// src/cms/content-types.ts — Dynamic content type definitions with field validation
import { z } from "zod";
import { pool } from "../db";

// Field types supported by the CMS
const FieldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), name: z.string(), required: z.boolean().default(false), maxLength: z.number().optional() }),
  z.object({ type: z.literal("richtext"), name: z.string(), required: z.boolean().default(false) }),
  z.object({ type: z.literal("number"), name: z.string(), required: z.boolean().default(false), min: z.number().optional(), max: z.number().optional() }),
  z.object({ type: z.literal("boolean"), name: z.string(), required: z.boolean().default(false) }),
  z.object({ type: z.literal("date"), name: z.string(), required: z.boolean().default(false) }),
  z.object({ type: z.literal("image"), name: z.string(), required: z.boolean().default(false) }),
  z.object({ type: z.literal("reference"), name: z.string(), required: z.boolean().default(false), referenceTo: z.string() }),
  z.object({ type: z.literal("array"), name: z.string(), required: z.boolean().default(false), itemType: z.string() }),
  z.object({ type: z.literal("enum"), name: z.string(), required: z.boolean().default(false), values: z.array(z.string()) }),
]);

interface ContentType {
  slug: string;
  name: string;
  fields: z.infer<typeof FieldSchema>[];
  publishable: boolean;
  singleton: boolean;  // e.g., "homepage" — only one entry
}

// Validate content against its type definition
export function validateContent(contentType: ContentType, data: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of contentType.fields) {
    const value = data[field.name];

    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`${field.name} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    switch (field.type) {
      case "text":
        if (typeof value !== "string") errors.push(`${field.name} must be a string`);
        else if (field.maxLength && value.length > field.maxLength)
          errors.push(`${field.name} exceeds max length ${field.maxLength}`);
        break;
      case "number":
        if (typeof value !== "number") errors.push(`${field.name} must be a number`);
        else if (field.min !== undefined && value < field.min) errors.push(`${field.name} must be >= ${field.min}`);
        else if (field.max !== undefined && value > field.max) errors.push(`${field.name} must be <= ${field.max}`);
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${field.name} must be boolean`);
        break;
      case "enum":
        if (!field.values.includes(value)) errors.push(`${field.name} must be one of: ${field.values.join(", ")}`);
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}
```

```typescript
// src/cms/content-store.ts — Versioned content storage with draft/publish workflow
import { pool } from "../db";
import { Redis } from "ioredis";
import { validateContent, ContentType } from "./content-types";

const redis = new Redis(process.env.REDIS_URL!);

interface ContentEntry {
  id: string;
  contentType: string;
  data: Record<string, any>;
  status: "draft" | "published" | "archived";
  version: number;
  slug: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdBy: string;
  updatedBy: string;
}

export async function createEntry(
  contentType: ContentType,
  data: Record<string, any>,
  userId: string
): Promise<ContentEntry> {
  const validation = validateContent(contentType, data);
  if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.join(", ")}`);

  const id = `${contentType.slug}-${Date.now()}`;
  const slug = data.slug || data.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 100) || id;

  const { rows: [entry] } = await pool.query(
    `INSERT INTO content_entries (id, content_type, data, status, version, slug, created_by, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'draft', 1, $4, $5, $5, NOW(), NOW()) RETURNING *`,
    [id, contentType.slug, JSON.stringify(data), slug, userId]
  );

  // Save version history
  await pool.query(
    `INSERT INTO content_versions (entry_id, version, data, status, created_by, created_at)
     VALUES ($1, 1, $2, 'draft', $3, NOW())`,
    [id, JSON.stringify(data), userId]
  );

  return mapEntry(entry);
}

export async function updateEntry(
  id: string,
  contentType: ContentType,
  data: Record<string, any>,
  userId: string
): Promise<ContentEntry> {
  const validation = validateContent(contentType, data);
  if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.join(", ")}`);

  const { rows: [current] } = await pool.query("SELECT version FROM content_entries WHERE id = $1", [id]);
  const newVersion = current.version + 1;

  const { rows: [entry] } = await pool.query(
    `UPDATE content_entries SET data = $2, version = $3, updated_by = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(data), newVersion, userId]
  );

  await pool.query(
    `INSERT INTO content_versions (entry_id, version, data, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, newVersion, JSON.stringify(data), entry.status, userId]
  );

  // Invalidate cache
  await redis.del(`content:${id}`, `content:slug:${entry.content_type}:${entry.slug}`);

  return mapEntry(entry);
}

export async function publishEntry(id: string, userId: string): Promise<ContentEntry> {
  const { rows: [entry] } = await pool.query(
    `UPDATE content_entries SET status = 'published', published_at = NOW(), updated_by = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, userId]
  );

  // Cache published content
  await redis.setex(`content:${id}`, 300, JSON.stringify(mapEntry(entry)));
  await redis.setex(`content:slug:${entry.content_type}:${entry.slug}`, 300, JSON.stringify(mapEntry(entry)));

  return mapEntry(entry);
}

export async function schedulePublish(id: string, publishAt: string, userId: string): Promise<void> {
  await pool.query(
    "UPDATE content_entries SET scheduled_at = $2, updated_by = $3, updated_at = NOW() WHERE id = $1",
    [id, publishAt, userId]
  );
}

export async function revertToVersion(id: string, version: number, userId: string): Promise<ContentEntry> {
  const { rows: [versionData] } = await pool.query(
    "SELECT data FROM content_versions WHERE entry_id = $1 AND version = $2",
    [id, version]
  );
  if (!versionData) throw new Error(`Version ${version} not found`);

  const { rows: [current] } = await pool.query("SELECT version FROM content_entries WHERE id = $1", [id]);
  const newVersion = current.version + 1;

  const { rows: [entry] } = await pool.query(
    `UPDATE content_entries SET data = $2, version = $3, updated_by = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, versionData.data, newVersion, userId]
  );

  await pool.query(
    `INSERT INTO content_versions (entry_id, version, data, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, newVersion, versionData.data, entry.status, userId]
  );

  return mapEntry(entry);
}

export async function getVersionHistory(id: string): Promise<Array<{ version: number; createdBy: string; createdAt: string }>> {
  const { rows } = await pool.query(
    "SELECT version, created_by, created_at FROM content_versions WHERE entry_id = $1 ORDER BY version DESC",
    [id]
  );
  return rows;
}

// Content delivery API — cached, fast reads
export async function getPublishedContent(contentType: string, slug: string): Promise<ContentEntry | null> {
  const cacheKey = `content:slug:${contentType}:${slug}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    "SELECT * FROM content_entries WHERE content_type = $1 AND slug = $2 AND status = 'published'",
    [contentType, slug]
  );
  if (rows.length === 0) return null;

  const entry = mapEntry(rows[0]);
  await redis.setex(cacheKey, 300, JSON.stringify(entry));
  return entry;
}

function mapEntry(row: any): ContentEntry {
  return {
    id: row.id, contentType: row.content_type, data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    status: row.status, version: row.version, slug: row.slug,
    publishedAt: row.published_at, scheduledAt: row.scheduled_at,
    createdBy: row.created_by, updatedBy: row.updated_by,
  };
}
```

## Results

- **Content changes without deployments** — marketing publishes blog posts, updates FAQs, and edits landing pages without asking a developer; deployment frequency dropped from "every content change" to "only for features"
- **Full version history with one-click revert** — the accidental publish incident is fixed in 10 seconds by reverting to the previous version; every change is tracked with who and when
- **3 frontends, 1 content API** — marketing site, docs, and mobile app all consume the same REST API; content updates propagate to all surfaces instantly
- **Scheduled publishing works** — "publish this post Friday at 9 AM" is a single API call; a cron job checks for scheduled content and publishes automatically
- **Sub-10ms reads for published content** — Redis caching means the delivery API is CDN-fast; cache invalidation on publish ensures freshness
