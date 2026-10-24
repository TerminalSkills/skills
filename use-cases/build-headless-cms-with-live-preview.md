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

A marketing team manages 500+ pages, blog posts, and landing pages. Every content change requires an engineer to deploy: marketers write in a Google Doc, email it to engineering, an engineer copies it to the codebase, pushes to staging for review, then deploys. A typo fix takes days, and during product launches the CMO begs engineers to "just push one more thing" at midnight. The team wants to edit content, see exactly how it will look, get it approved, and publish on a schedule without a deploy.

## The Solution

A small content API (Hono, PostgreSQL, Redis, zod) stores entries with full version history and a review workflow. The marketing site is a Next.js app that renders published content, and uses Next.js Draft Mode to render the latest draft when an editor opens a preview link. Redis pub/sub pushes edits to the open preview so the page refreshes as the editor saves. Checked with Hono 4.13, zod 4.6, ioredis 6, pg 8.23 and Next.js 16.4.

```sql
CREATE TABLE content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','published','archived')),
  version int NOT NULL DEFAULT 0, fields jsonb NOT NULL DEFAULT '{}',
  author text NOT NULL, updated_by text,
  scheduled_at timestamptz, published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content_versions (
  content_id uuid REFERENCES content(id), version int NOT NULL,
  fields jsonb NOT NULL, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, version)
);
```

## Step 1: Content model and version history

Each content type has a zod schema, so a landing page cannot be saved without a headline. Saving locks the row and writes the version and the current copy in one transaction, so two editors saving at once cannot get the same version number.

```typescript
// src/cms/content-model.ts
import { z } from "zod";
import { Pool } from "pg";

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const contentTypes = {
  blog_post: z.object({
    title: z.string().min(1).max(200),
    body: z.string(), // Markdown or MDX
    category: z.string(),
    tags: z.array(z.string()),
  }),
  landing_page: z.object({
    headline: z.string().min(1).max(100),
    heroImage: z.url(),
    ctaText: z.string().max(50), ctaUrl: z.url(),
    sections: z.array(z.object({ type: z.enum(["text", "image", "features", "pricing"]), content: z.record(z.string(), z.unknown()) })),
  }),
};
export type ContentType = keyof typeof contentTypes;

export async function saveContent(id: string, type: ContentType, input: unknown, userId: string) {
  const fields = contentTypes[type].parse(input); // throws ZodError on bad input
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT version FROM content WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) throw new Error("Content not found");
    const version = rows[0].version + 1;
    await client.query("INSERT INTO content_versions (content_id, version, fields, created_by) VALUES ($1, $2, $3, $4)", [id, version, fields, userId]);
    await client.query("UPDATE content SET fields = $1, version = $2, updated_by = $3, updated_at = now() WHERE id = $4", [fields, version, userId, id]);
    await client.query("COMMIT");
    return { version };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

## Step 2: Preview API with live updates

The public `/v1/published/:slug` endpoint returns only `published` rows. Editors get a short-lived preview token; `/v1/preview/:slug` returns the latest draft for a valid token, and a Server-Sent Events stream relays Redis messages; the Redis subscriber is released when the client disconnects.

```typescript
// src/cms/preview.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { db } from "./content-model";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();
app.use("/v1/preview/*", cors({ origin: process.env.SITE_ORIGIN! }));

// Call after editor login; token lives 30 minutes
export async function issuePreviewToken(userId: string) {
  const token = randomBytes(24).toString("hex");
  await redis.set(`preview:token:${token}`, userId, "EX", 1800);
  return token;
}

const valid = async (token?: string) => !!token && (await redis.exists(`preview:token:${token}`)) === 1;

app.get("/v1/published/:slug", async (c) => {
  const { rows } = await db.query("SELECT type, slug, fields FROM content WHERE slug = $1 AND status = 'published'", [c.req.param("slug")]);
  return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.get("/v1/preview/:slug", async (c) => {
  if (!(await valid(c.req.query("token")))) return c.json({ error: "Invalid preview token" }, 401);
  const { rows } = await db.query("SELECT id, type, slug, status, version, fields FROM content WHERE slug = $1", [c.req.param("slug")]);
  return rows[0] ? c.json(rows[0]) : c.json({ error: "Content not found" }, 404);
});

app.get("/v1/preview/:slug/stream", async (c) => {
  if (!(await valid(c.req.query("token")))) return c.json({ error: "Invalid preview token" }, 401);
  const channel = `content:update:${c.req.param("slug")}`;
  return streamSSE(c, async (stream) => {
    const sub = redis.duplicate();
    await sub.subscribe(channel);
    sub.on("message", (_ch, message) => void stream.writeSSE({ data: message }));
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    sub.disconnect();
  });
});

// Call after saveContent() succeeds, so open previews refresh
export const notifyPreview = (slug: string, version: number) =>
  redis.publish(`content:update:${slug}`, JSON.stringify({ version }));

export default app;
```

## Step 3: Review, approval and scheduled publishing

Every transition checks the current status in its `WHERE` clause, so a draft cannot jump to published, and the person who wrote a page cannot approve it.

```typescript
// src/cms/workflow.ts
import { db } from "./content-model";

async function move(id: string, from: string, to: string, userId: string, extra = "") {
  const { rowCount } = await db.query(
    `UPDATE content SET status = $1, updated_by = $2, updated_at = now() ${extra} WHERE id = $3 AND status = $4`,
    [to, userId, id, from],
  );
  if (!rowCount) throw new Error(`Content ${id} is not in status "${from}"`);
}

export const submitForReview = (id: string, userId: string) => move(id, "draft", "review", userId);
export async function approve(id: string, approverId: string) {
  const { rows } = await db.query("SELECT author FROM content WHERE id = $1", [id]);
  if (rows[0]?.author === approverId) throw new Error("Authors cannot approve their own content");
  await move(id, "review", "approved", approverId);
}

export async function publish(id: string, userId: string) {
  await move(id, "approved", "published", userId, ", published_at = now()");
  await purgeCache();
}

export async function publishScheduled(): Promise<number> {
  const { rows } = await db.query(
    `UPDATE content SET status = 'published', published_at = now()
     WHERE status = 'approved' AND scheduled_at <= now() RETURNING id`,
  );
  if (rows.length) await purgeCache();
  return rows.length;
}

async function purgeCache() {
  const res = await fetch(`${process.env.SITE_ORIGIN}/api/revalidate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.REVALIDATE_SECRET}` },
  });
  if (!res.ok) throw new Error(`Revalidate failed: ${res.status}`);
}
```

## Step 4: The Next.js site, Draft Mode and refresh

The editor opens `/api/draft?slug=pricing&token=...`. The route checks the token against the CMS, turns on Draft Mode and remembers the token in an `httpOnly` cookie. In Next.js 15 and later, `draftMode()` and `cookies()` are async.

```typescript
// app/api/draft/route.ts
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const [slug, token] = [params.get("slug") ?? "", params.get("token") ?? ""];
  if (!/^[a-z0-9-]+$/.test(slug) || !token) return new Response("Bad request", { status: 400 });

  const check = await fetch(`${process.env.CMS_URL}/v1/preview/${slug}?token=${encodeURIComponent(token)}`);
  if (!check.ok) return new Response("Invalid token", { status: 401 });

  (await draftMode()).enable();
  (await cookies()).set("preview_token", token, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 1800 });
  redirect(`/${slug}`);
}
```

```typescript
// app/api/revalidate/route.ts — called by the CMS after publishing
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.REVALIDATE_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  revalidateTag("content", "max"); // Next.js 16 takes a cache-life profile as the second argument
  return Response.json({ ok: true });
}
```

```tsx
// app/[slug]/page.tsx
import { cookies, draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { PreviewRefresh } from "./preview-refresh";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, { isEnabled }, jar] = [await params, await draftMode(), await cookies()];
  const token = jar.get("preview_token")?.value;

  const res = isEnabled && token
    ? await fetch(`${process.env.CMS_URL}/v1/preview/${slug}?token=${token}`, { cache: "no-store" })
    : await fetch(`${process.env.CMS_URL}/v1/published/${slug}`, { next: { tags: ["content"] } });
  if (!res.ok) notFound();
  const entry = await res.json();

  return (
    <article>
      {isEnabled && token && <PreviewRefresh url={`${process.env.NEXT_PUBLIC_CMS_URL}/v1/preview/${slug}/stream?token=${token}`} />}
      <h1>{entry.fields.title ?? entry.fields.headline}</h1>
      {/* render entry.fields for the content type */}
    </article>
  );
}
```

```tsx
// app/[slug]/preview-refresh.tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PreviewRefresh({ url }: { url: string }) {
  const router = useRouter();
  useEffect(() => {
    const events = new EventSource(url);
    events.onmessage = () => router.refresh(); // re-runs the server component with the new draft
    return () => events.close();
  }, [url, router]);
  return null;
}
```

## Results

What the team gets from this design:

- Editors preview the saved draft in the real site template, refreshed on every save; the database refuses skipped workflow steps and self-approval.
- Scheduled launches publish without a midnight deploy, and the site revalidates when they go out.
- Every save is a row in `content_versions`, so an older version can be compared and restored.

## Related Skills

- [typescript](/skills/typescript): typed content model and workflow code
- [hono](/skills/hono): content and preview API
- [postgresql](/skills/postgresql): entries, versions and the transactional save
- [redis](/skills/redis): preview tokens and pub/sub updates
- [zod](/skills/zod): per-content-type validation
- [nextjs](/skills/nextjs): site rendering, Draft Mode and revalidation
