---
title: Deploy an Edge API with Cloudflare Workers and Hono
slug: deploy-edge-api-with-cloudflare-workers-and-hono
description: Build and deploy a globally distributed API on Cloudflare Workers using Hono as the web framework, D1 as the database, and R2 for file storage — with sub-50ms response times worldwide.
skills:
  - cloudflare-workers
  - hono
  - zod
category: devops
tags:
  - cloudflare
  - edge
  - serverless
  - api
  - performance
---

# Deploy an Edge API with Cloudflare Workers and Hono

Dani is the sole backend engineer at a 5-person startup building an image annotation tool. Their Express API runs on a single `us-east-1` EC2 instance, and customers in Tokyo and São Paulo see 400ms+ latencies. The $150/month server bill hurts too — most of it pays for idle compute between traffic bursts. He wants to move to a serverless edge platform where cold starts are invisible, latency is under 50ms everywhere, and the bill scales to zero during off-hours.

## Step 1 — Scaffold the Hono App with Typed Cloudflare Bindings

Hono's type system integrates directly with Cloudflare's environment bindings, so every database query, storage call, and secret access is fully typed.

```typescript
// src/index.ts — Application entry point.
// The Env type tells Hono about every Cloudflare binding (D1, R2, secrets),
// so c.env.DB is typed as D1Database, not `any`.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { annotationRoutes } from "./routes/annotations";
import { imageRoutes } from "./routes/images";
import { authMiddleware } from "./middleware/auth";

type Env = {
  Bindings: {
    DB: D1Database;            // SQLite at the edge
    IMAGES: R2Bucket;          // Object storage for uploaded images
    JWT_SECRET: string;        // Wrangler secret
    ALLOWED_ORIGINS: string;   // Comma-separated origins
  };
};

const app = new Hono<Env>();

// Global middleware stack
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS.split(",");
  return cors({ origin: origins })(c, next);
});

// Public routes
app.get("/health", (c) => c.json({ status: "ok", region: c.req.raw.cf?.colo }));

// Protected routes
app.use("/api/*", authMiddleware);
app.route("/api/images", imageRoutes);
app.route("/api/annotations", annotationRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Global error handler
app.onError((err, c) => {
  console.error(`[${c.get("requestId")}] ${err.message}`, err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
```

The `cf?.colo` property on the request exposes which Cloudflare data center handled the request — useful for debugging latency and verifying edge deployment.

## Step 2 — Set Up D1 Database with Migrations

D1 is Cloudflare's edge SQLite database. Migrations run via Wrangler CLI, and read replicas automatically distribute to edge locations close to users.

```toml
# wrangler.toml — Cloudflare Workers configuration.
# compatibility_date pins the Workers runtime version to avoid surprise behavior changes.

name = "annotation-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "annotation-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "annotation-images"

[vars]
ALLOWED_ORIGINS = "https://app.example.com,https://staging.example.com"
```

```sql
-- migrations/0001_initial.sql — Database schema.
-- D1 uses SQLite, so JSON operations use json_extract() rather than Postgres JSONB.

CREATE TABLE images (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,        -- R2 object key for retrieval
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,           -- User ID from JWT
  created_at TEXT DEFAULT (datetime('now')),
  metadata TEXT DEFAULT '{}'           -- JSON blob for EXIF, tags, etc.
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  x REAL NOT NULL,                    -- Normalized coordinates (0.0 to 1.0)
  y REAL NOT NULL,                    -- so they're resolution-independent
  width REAL NOT NULL,
  height REAL NOT NULL,
  confidence REAL,                    -- ML model confidence, null for manual annotations
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_images_uploaded_by ON images(uploaded_by);
```

Normalized coordinates (0.0 to 1.0) instead of pixel values mean annotations remain valid regardless of how the image is displayed — full resolution, thumbnail, or zoomed.

## Step 3 — Build the Image Upload Route with R2 Storage

Uploads go directly to R2 (Cloudflare's S3 competitor) with zero egress fees. The route validates the file, generates a unique key, and stores metadata in D1.

```typescript
// src/routes/images.ts — Image upload and retrieval routes.
// Files stream directly to R2 without buffering the entire body in memory,
// which keeps the Worker's 128MB memory limit safe even for large images.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Env = {
  Bindings: {
    DB: D1Database;
    IMAGES: R2Bucket;
  };
  Variables: {
    userId: string;
  };
};

export const imageRoutes = new Hono<Env>();

const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB — Workers have a 100MB request limit

imageRoutes.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("image") as File | null;

  if (!file || !file.type.startsWith("image/")) {
    return c.json({ error: "A valid image file is required" }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "Image must be under 10MB" }, 400);
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const ext = file.name.split(".").pop() || "png";
  const r2Key = `uploads/${c.get("userId")}/${id}.${ext}`;

  // Stream the file directly to R2 — no full-body buffering
  await c.env.IMAGES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: c.get("userId") },
  });

  // Store metadata in D1
  const result = await c.env.DB.prepare(
    `INSERT INTO images (id, filename, r2_key, width, height, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(id, file.name, r2Key, 0, 0, c.get("userId"))  // width/height extracted async later
    .first();

  // Extract dimensions in the background (doesn't block the response)
  c.executionCtx.waitUntil(extractAndUpdateDimensions(c.env, id, r2Key));

  return c.json({ image: result }, 201);
});

imageRoutes.get(
  "/:id",
  zValidator("param", z.object({ id: z.string().length(32) })),
  async (c) => {
    const { id } = c.req.valid("param");

    const image = await c.env.DB.prepare(
      "SELECT * FROM images WHERE id = ? AND uploaded_by = ?"
    )
      .bind(id, c.get("userId"))
      .first();

    if (!image) return c.json({ error: "Image not found" }, 404);

    return c.json({ image });
  }
);

// Presigned URL for direct image access (1 hour expiry)
imageRoutes.get("/:id/url", async (c) => {
  const id = c.req.param("id");

  const image = await c.env.DB.prepare(
    "SELECT r2_key FROM images WHERE id = ? AND uploaded_by = ?"
  )
    .bind(id, c.get("userId"))
    .first<{ r2_key: string }>();

  if (!image) return c.json({ error: "Image not found" }, 404);

  const object = await c.env.IMAGES.get(image.r2_key);
  if (!object) return c.json({ error: "File missing from storage" }, 500);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
```

The `c.executionCtx.waitUntil()` call lets the response return immediately (201 Created) while dimension extraction runs in the background. The user sees their upload instantly; metadata fills in asynchronously.

## Step 4 — Build the Annotation CRUD Routes

Annotations are the core domain. Each route validates input with Zod, queries D1, and returns typed responses.

```typescript
// src/routes/annotations.ts — Annotation management routes.
// All coordinates are normalized (0-1) for resolution independence.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Env = {
  Bindings: { DB: D1Database };
  Variables: { userId: string };
};

export const annotationRoutes = new Hono<Env>();

const CreateAnnotationInput = z.object({
  image_id: z.string().length(32),
  label: z.string().min(1).max(100),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.001).max(1),   // Minimum 0.1% of image dimension
  height: z.number().min(0.001).max(1),
  confidence: z.number().min(0).max(1).optional(),
});

const BulkCreateInput = z.object({
  annotations: z.array(CreateAnnotationInput).min(1).max(500),
});

annotationRoutes.post(
  "/",
  zValidator("json", CreateAnnotationInput),
  async (c) => {
    const input = c.req.valid("json");

    // Verify the user owns this image
    const image = await c.env.DB.prepare(
      "SELECT id FROM images WHERE id = ? AND uploaded_by = ?"
    )
      .bind(input.image_id, c.get("userId"))
      .first();

    if (!image) return c.json({ error: "Image not found" }, 404);

    const id = crypto.randomUUID().replace(/-/g, "");
    const annotation = await c.env.DB.prepare(
      `INSERT INTO annotations (id, image_id, label, x, y, width, height, confidence, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(id, input.image_id, input.label, input.x, input.y, input.width, input.height, input.confidence ?? null, c.get("userId"))
      .first();

    return c.json({ annotation }, 201);
  }
);

// Bulk create for ML model predictions — up to 500 annotations per request
annotationRoutes.post(
  "/bulk",
  zValidator("json", BulkCreateInput),
  async (c) => {
    const { annotations } = c.req.valid("json");
    const userId = c.get("userId");

    // D1 batch: all inserts run in a single transaction
    const statements = annotations.map((ann) => {
      const id = crypto.randomUUID().replace(/-/g, "");
      return c.env.DB.prepare(
        `INSERT INTO annotations (id, image_id, label, x, y, width, height, confidence, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, ann.image_id, ann.label, ann.x, ann.y, ann.width, ann.height, ann.confidence ?? null, userId);
    });

    const results = await c.env.DB.batch(statements);
    const totalInserted = results.reduce((sum, r) => sum + (r.meta.changes || 0), 0);

    return c.json({
      inserted: totalInserted,
      total: annotations.length,
    }, 201);
  }
);

// List annotations for an image with label filtering
annotationRoutes.get(
  "/by-image/:imageId",
  zValidator("param", z.object({ imageId: z.string().length(32) })),
  zValidator("query", z.object({
    label: z.string().optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
  })),
  async (c) => {
    const { imageId } = c.req.valid("param");
    const { label, minConfidence } = c.req.valid("query");

    let query = "SELECT * FROM annotations WHERE image_id = ? AND created_by = ?";
    const params: unknown[] = [imageId, c.get("userId")];

    if (label) {
      query += " AND label = ?";
      params.push(label);
    }

    if (minConfidence !== undefined) {
      query += " AND confidence >= ?";
      params.push(minConfidence);
    }

    query += " ORDER BY created_at DESC";

    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ annotations: results });
  }
);
```

The D1 `batch()` method wraps multiple statements in a single transaction. For the bulk endpoint — where an ML model might submit 500 annotations at once — this means either all annotations save or none do.

## Step 5 — Deploy and Verify Global Latency

```toml
# wrangler.toml — Add cron trigger for stale image cleanup

[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC
```

```typescript
// src/scheduled.ts — Cron handler for cleanup tasks.
// Runs once per day, deletes orphaned R2 objects and soft-deleted records.

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Delete annotations for images removed more than 30 days ago
    const { meta } = await env.DB.prepare(
      `DELETE FROM images
       WHERE deleted_at IS NOT NULL
       AND deleted_at < datetime('now', '-30 days')`
    ).run();

    console.log(`Cleanup: removed ${meta.changes} expired images`);
  },
};
```

Deployment is a single command: `wrangler deploy`. Cloudflare distributes the Worker to 300+ edge locations automatically. There's no region selection, no capacity planning, no load balancer configuration.

## Results

After migrating from the single EC2 instance to Cloudflare Workers, Dani's metrics shifted dramatically:

- **P95 latency dropped from 420ms to 38ms** globally — Tokyo users went from 380ms to 22ms, São Paulo from 410ms to 31ms. The API runs at the edge closest to each user.
- **Cold start: effectively zero** — Workers use V8 isolates, not containers. The first request of the day is as fast as the millionth.
- **Monthly cost dropped from $150 to $12** — Workers' pay-per-request model means zero cost during off-hours. The 10M free requests/month covers most of the traffic.
- **Deployment time: 3 seconds** — `wrangler deploy` pushes to all 300+ edge locations instantly. No rolling deploys, no health check wait.
- **R2 storage saves $40/month** in egress fees compared to S3 — zero egress regardless of traffic volume.
