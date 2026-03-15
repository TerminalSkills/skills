---
title: Build a Headless CMS with Live Preview
slug: build-headless-cms-with-live-preview
description: >
  Build a content management system where marketers see changes
  instantly in a live preview — with version history, approval
  workflows, and scheduled publishing that eliminated the "deploy
  to see your changes" bottleneck.
skills:
  - typescript
  - hono
  - postgresql
  - redis
  - zod
  - nextjs
category: development
tags:
  - headless-cms
  - live-preview
  - content-management
  - publishing-workflow
  - version-history
  - marketing
---

# Build a Headless CMS with Live Preview

## The Problem

A marketing team manages 500+ pages, blog posts, and landing pages. Every content change requires an engineer to deploy: marketers write in a Google Doc, email it to engineering, an engineer copies it to the codebase, pushes to staging for review, then deploys. Turnaround: 2-3 days for a typo fix. The marketing team publishes 15 pieces of content per week but can only get 5 deployed because engineering is the bottleneck. During product launches, the CMO begs engineers to "just push one more thing" at midnight.

## Step 1: Content Model and API

```typescript
// src/cms/content-model.ts
import { z } from 'zod';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const ContentEntry = z.object({
  id: z.string().uuid(),
  contentType: z.string(),          // 'page', 'blog_post', 'landing_page'
  slug: z.string(),
  locale: z.string().default('en'),
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']),
  version: z.number().int(),
  fields: z.record(z.string(), z.unknown()), // flexible field data
  metadata: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().url().optional(),
    publishedAt: z.string().datetime().optional(),
    scheduledAt: z.string().datetime().optional(),
    author: z.string(),
  }),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Content type definitions (schema for each content type)
export const contentTypes: Record<string, z.ZodObject<any>> = {
  blog_post: z.object({
    title: z.string().min(1).max(200),
    subtitle: z.string().max(300).optional(),
    body: z.string(),               // Rich text / MDX
    heroImage: z.string().url().optional(),
    category: z.string(),
    tags: z.array(z.string()),
    readTimeMinutes: z.number().int().optional(),
  }),
  landing_page: z.object({
    headline: z.string().min(1).max(100),
    subheadline: z.string().max(200),
    heroImage: z.string().url(),
    ctaText: z.string().max(50),
    ctaUrl: z.string().url(),
    sections: z.array(z.object({
      type: z.enum(['text', 'image', 'testimonial', 'features', 'pricing', 'cta']),
      content: z.record(z.string(), z.unknown()),
    })),
  }),
};

// Save with version history
export async function saveContent(
  id: string,
  fields: Record<string, unknown>,
  metadata: any,
  userId: string
): Promise<{ version: number }> {
  // Get current version
  const { rows } = await db.query(
    'SELECT version FROM content WHERE id = $1 ORDER BY version DESC LIMIT 1',
    [id]
  );
  const newVersion = (rows[0]?.version ?? 0) + 1;

  // Save new version (old versions kept for history)
  await db.query(`
    INSERT INTO content_versions (content_id, version, fields, metadata, created_by, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [id, newVersion, JSON.stringify(fields), JSON.stringify(metadata), userId]);

  // Update current
  await db.query(`
    UPDATE content SET fields = $1, metadata = $2, version = $3, updated_by = $4, updated_at = NOW()
    WHERE id = $5
  `, [JSON.stringify(fields), JSON.stringify(metadata), newVersion, userId, id]);

  return { version: newVersion };
}

// Version diff for review
export async function getVersionDiff(contentId: string, v1: number, v2: number): Promise<{
  fieldChanges: Array<{ field: string; before: unknown; after: unknown }>;
}> {
  const { rows } = await db.query(
    `SELECT version, fields FROM content_versions WHERE content_id = $1 AND version IN ($2, $3)`,
    [contentId, v1, v2]
  );

  const old = rows.find(r => r.version === v1)?.fields ?? {};
  const current = rows.find(r => r.version === v2)?.fields ?? {};

  const changes: any[] = [];
  const allKeys = new Set([...Object.keys(old), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (JSON.stringify(old[key]) !== JSON.stringify(current[key])) {
      changes.push({ field: key, before: old[key], after: current[key] });
    }
  }

  return { fieldChanges: changes };
}
```

## Step 2: Live Preview API

```typescript
// src/cms/preview.ts
import { Hono } from 'hono';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

// Live preview: returns draft content for preview iframe
app.get('/v1/preview/:slug', async (c) => {
  const slug = c.req.param('slug');
  const previewToken = c.req.query('token');

  // Validate preview token (short-lived, per-session)
  const userId = await redis.get(`preview:token:${previewToken}`);
  if (!userId) return c.json({ error: 'Invalid preview token' }, 401);

  // Return draft content (not published)
  const { rows } = await db.query(`
    SELECT * FROM content WHERE slug = $1
    ORDER BY version DESC LIMIT 1
  `, [slug]);

  if (!rows[0]) return c.json({ error: 'Content not found' }, 404);

  return c.json({
    ...rows[0],
    fields: rows[0].fields,
    _preview: true,
    _version: rows[0].version,
  });
});

// Real-time preview updates via Server-Sent Events
app.get('/v1/preview/:slug/stream', async (c) => {
  const slug = c.req.param('slug');

  return new Response(
    new ReadableStream({
      start(controller) {
        const sub = redis.duplicate();
        sub.subscribe(`content:update:${slug}`);
        sub.on('message', (channel, message) => {
          controller.enqueue(`data: ${message}\n\n`);
        });
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
  );
});

// Notify preview when content changes
export async function notifyPreview(slug: string, fields: any): Promise<void> {
  await redis.publish(`content:update:${slug}`, JSON.stringify(fields));
}

export default app;
```

## Step 3: Publishing Workflow

```typescript
// src/cms/workflow.ts
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function submitForReview(contentId: string, userId: string): Promise<void> {
  await db.query(`UPDATE content SET status = 'review', updated_by = $1 WHERE id = $2`, [userId, contentId]);
}

export async function approve(contentId: string, approverId: string): Promise<void> {
  await db.query(`UPDATE content SET status = 'approved', updated_by = $1 WHERE id = $2`, [approverId, contentId]);
}

export async function publish(contentId: string, userId: string): Promise<void> {
  await db.query(`
    UPDATE content SET status = 'published', metadata = metadata || '{"publishedAt": "${new Date().toISOString()}"}'::jsonb, updated_by = $1
    WHERE id = $2
  `, [userId, contentId]);

  // Purge CDN cache
  await fetch(process.env.CDN_PURGE_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CDN_TOKEN}` },
    body: JSON.stringify({ contentId }),
  }).catch(() => {});
}

// Scheduled publishing
export async function publishScheduled(): Promise<number> {
  const { rowCount } = await db.query(`
    UPDATE content SET status = 'published'
    WHERE status = 'approved'
      AND (metadata->>'scheduledAt')::timestamptz <= NOW()
  `);
  return rowCount ?? 0;
}
```

## Results

- **Content turnaround**: 15 minutes (was 2-3 days)
- **Engineering bottleneck**: eliminated — marketers publish independently
- **Content output**: 15 pieces/week actually published (was 5 due to bottleneck)
- **Live preview**: marketers see exactly what users will see, no surprises
- **Midnight deploys**: zero — scheduled publishing handles launches
- **Version history**: every change tracked, easy rollback
- **Workflow**: draft → review → approve → publish, with clear accountability
