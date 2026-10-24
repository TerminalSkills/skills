---
title: Build an Image CDN Proxy
slug: build-image-cdn-proxy
description: Build an image proxy with on-the-fly resizing, AVIF/WebP negotiation, HMAC-signed URLs, SSRF protection and a Redis cache, so any size of any product image is served from one original.
skills:
  - typescript
  - redis
  - hono
category: devops
tags:
  - images
  - cdn
  - proxy
  - optimization
  - responsive
---

# Build an Image CDN Proxy

## The Problem

Anya leads frontend at a 20-person e-commerce company with 100,000 product images. Each is stored as a 4000x4000 JPEG of about 3 MB. A phone showing a 200 px thumbnail downloads the whole file, nobody gets WebP or AVIF, the product team uploads images in random sizes, and the CDN caches only the originals. They need an image proxy: request any size and format through URL parameters, resize on the fly, cache the result, pick the format from the browser's `Accept` header, and emit `srcset` for responsive images.

An image proxy is also an open door if it is built carelessly. A prefix check such as `url.startsWith("https://storage.example.com")` also accepts `https://storage.example.com.evil.net`; a proxy that follows redirects can be pointed at internal services; an unsigned URL lets anyone request every size of every image and fill your cache. The version below only ever fetches from one configured origin, signs every URL with HMAC, and does not follow redirects.

## The Solution

A small [Hono](../skills/hono/SKILL.md) service in front of your storage origin:

- `sharp` does the resizing and encoding (AVIF, WebP, JPEG), with an input pixel limit.
- Redis ([redis skill](../skills/redis/SKILL.md)) caches the encoded result for 30 days. For a large catalogue, put a CDN in front as well; the response carries `Cache-Control: immutable` and `Vary: Accept`.
- The query carries a path (not a full URL), the dimensions, an expiry and an HMAC-SHA256 signature over exactly those values.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install hono @hono/node-server ioredis sharp
npm install -D typescript @types/node
```

`sharp` needs Node 20.9 or newer. Set `"type": "module"` in `package.json` (the files use `import` and `.ts` import paths; Node 22.18+ and 24 run `.ts` files directly, older versions need a runner such as `tsx`). Set `STORAGE_URL` (the origin that holds the originals), `IMAGE_SIGN_SECRET` (32+ random characters, e.g. from `openssl rand -hex 32`) and `REDIS_URL` in the environment.

### Step 2: Write the proxy

```typescript
// src/images/proxy.ts — on-the-fly image transforms, HMAC-signed URLs, Redis cache
import { Hono } from "hono";
import { Redis } from "ioredis";
import sharp from "sharp";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);
const ORIGIN = new URL(process.env.STORAGE_URL!).origin; // the only host we will ever fetch from
const SECRET = process.env.IMAGE_SIGN_SECRET!;            // no fallback: fail closed if unset
if (!SECRET || SECRET.length < 32) throw new Error("IMAGE_SIGN_SECRET must be at least 32 characters");

const MAX_DIM = 4000, TTL = 60 * 60 * 24 * 30, MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const FORMATS = ["avif", "webp", "jpeg"] as const;
type Format = (typeof FORMATS)[number];
type Params = { path: string; w?: number; h?: number; q: number; fit: "cover" | "inside"; f?: Format };

// Sign exactly the canonical string that the server later rebuilds from the query.
const canonical = (p: Params, exp: number) => [p.path, p.w ?? "", p.h ?? "", p.q, p.fit, p.f ?? "", exp].join("|");
const sign = (p: Params, exp: number) => createHmac("sha256", SECRET).update(canonical(p, exp)).digest("hex");

export function signedPath(p: Params, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const qs = new URLSearchParams({ path: p.path, q: String(p.q), fit: p.fit, exp: String(exp), sig: sign(p, exp) });
  if (p.w) qs.set("w", String(p.w));
  if (p.h) qs.set("h", String(p.h));
  if (p.f) qs.set("f", p.f);
  return `/img?${qs}`;
}

export function srcSet(path: string, widths = [320, 640, 960, 1280, 1920]): string {
  return widths.map((w) => `${signedPath({ path, w, q: 80, fit: "inside" }, 7 * 86400)} ${w}w`).join(", ");
}

// "Accept: image/avif,image/webp,*/*" -> best format we can produce
const negotiate = (accept = ""): Format => (accept.includes("image/avif") ? "avif" : accept.includes("image/webp") ? "webp" : "jpeg");

export const app = new Hono();

app.get("/img", async (c) => {
  const u = c.req.query();
  const dim = (v?: string) => (v ? Math.min(Math.max(parseInt(v, 10) || 0, 1), MAX_DIM) : undefined);
  const p: Params = {
    path: u.path ?? "", w: dim(u.w), h: dim(u.h),
    q: Math.min(Math.max(parseInt(u.q ?? "80", 10) || 80, 1), 100),
    fit: u.fit === "cover" ? "cover" : "inside",
    f: FORMATS.find((x) => x === u.f),
  };
  const exp = Number(u.exp);
  const given = Buffer.from(u.sig ?? "", "hex"), want = Buffer.from(sign(p, exp), "hex");
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || given.length !== want.length || !timingSafeEqual(given, want))
    return c.text("invalid or expired signature", 403);
  // The path is joined to a fixed origin, so the caller can never choose the host.
  const source = new URL(p.path, ORIGIN);
  if (source.origin !== ORIGIN || !p.path.startsWith("/")) return c.text("bad path", 400);

  const format = p.f ?? negotiate(c.req.header("accept"));
  const key = "img:" + createHash("sha256").update(`${source.href}|${p.w}|${p.h}|${p.q}|${p.fit}|${format}`).digest("hex");
  let out = await redis.getBuffer(key);
  if (!out) {
    const res = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return c.text("source unavailable", 502);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_SOURCE_BYTES) return c.text("source too large", 413);
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_SOURCE_BYTES) return c.text("source too large", 413);
    let img = sharp(input, { limitInputPixels: 80_000_000 }).rotate(); // honour EXIF orientation
    if (p.w || p.h) img = img.resize({ width: p.w, height: p.h, fit: p.fit, withoutEnlargement: true });
    out = await (format === "avif" ? img.avif({ quality: p.q }) : format === "webp" ? img.webp({ quality: p.q }) : img.jpeg({ quality: p.q, mozjpeg: true })).toBuffer();
    await redis.setex(key, TTL, out);
  }
  return c.body(new Uint8Array(out), 200, {
    "Content-Type": `image/${format}`,
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept", // the same URL returns different bytes per Accept header
  });
});
```

### Step 3: Serve it on loopback and put TLS in front

```typescript
// src/images/server.ts
import { serve } from "@hono/node-server";
import { app } from "./proxy.ts";

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" });
```

Let your reverse proxy or CDN expose it publicly. Behind a CDN, cache on the full URL and respect `Vary: Accept`, or pass a fixed `f=` in the signed URL so the cache key does not depend on the header.

### Step 4: Generate URLs in the page

```typescript
import { signedPath, srcSet } from "./proxy.ts";

const img = `<img src="${signedPath({ path: "/p/1234.jpg", w: 640, q: 80, fit: "inside" })}"
  srcset="${srcSet("/p/1234.jpg")}" sizes="(max-width: 640px) 100vw, 640px">`;
```

Signing happens on your server, so the secret never reaches the browser. Signed URLs expire, so cache the rendered HTML for less than the signing TTL, or sign with a long TTL for catalogue pages.

### Step 5: Check the behaviour

Request one signed URL with `Accept: image/avif,image/webp,*/*`, then `image/webp,*/*`, then `*/*`: you should get AVIF, WebP and JPEG. Change `w=640` to `w=641` and expect 403; a path of `//evil.example/x.jpg` must give 400; an expired signature must give 403.

## Real-World Example

Anya's team puts the proxy behind their CDN and moves the product listing to `srcset` with 320, 640 and 960 px widths. Nothing is pre-generated: the first request for each size is encoded and cached, later ones are served from cache. They measure page weight and image bytes for a sample of listing pages before and after in their own analytics, and compare AVIF and WebP sizes on their own photos, since the savings depend on the images.

Before launch they check three things: Redis `maxmemory` with an `allkeys-lru` policy so thumbnails cannot exhaust memory, a rate limit on cache misses (each miss costs CPU), and that the storage origin is not reachable with a different host header.

## Related Skills

- [typescript](../skills/typescript/SKILL.md) -- strict types for the params and the signed-URL contract
- [redis](../skills/redis/SKILL.md) -- binary values with `getBuffer`/`setex`, TTLs and eviction policy
- [hono](../skills/hono/SKILL.md) -- the HTTP layer and the Node adapter
