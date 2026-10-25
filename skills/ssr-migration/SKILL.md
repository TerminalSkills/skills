---
name: ssr-migration
description: >-
  Migrate client-side rendered (CSR) React/Vue applications to server-side
  rendering (SSR) or static site generation (SSG) using Next.js, Nuxt, or
  Astro. Use when you need to improve SEO, reduce time-to-first-byte, fix
  blank page issues for crawlers, or improve Core Web Vitals. Covers
  incremental adoption, data fetching patterns, hydration debugging, and
  deployment configuration. Trigger words: SSR, SSG, server-side rendering,
  static generation, Next.js migration, SEO, hydration, TTFB, Core Web Vitals.
license: Apache-2.0
compatibility: "Node.js 20.9+ for Next.js 16 (22.12+ for Astro 7, 22.22+ for Nuxt 4). React 19 for the Next.js App Router, Vue 3 for Nuxt."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "ssr, ssg, nextjs, performance, seo"
---

# SSR Migration

## Overview
This skill guides the migration of client-side rendered single-page applications to server-side rendering or static site generation. It covers the incremental migration strategy (not a rewrite), identifying which pages benefit from SSR vs SSG vs CSR, fixing hydration mismatches, adapting data fetching patterns, and configuring deployment for SSR workloads.

## Instructions

### 1. Audit the current CSR application
Identify what needs to change before migrating:

```bash
# Check for SSR-incompatible patterns:
# 1. Direct window/document access at module level
grep -rn "window\." src/ --include="*.tsx" --include="*.ts" | grep -v "typeof window"

# 2. Browser-only libraries imported at top level
grep -rnE "from ['\"](chart\.js|swiper|mapbox-gl|leaflet)" src/

# 3. localStorage/sessionStorage usage outside useEffect
grep -rn "localStorage\|sessionStorage" src/ --include="*.tsx"

# 4. Dynamic imports that should stay client-only
grep -rn "React.lazy\|dynamic(" src/ --include="*.tsx"
```

Classify each page by rendering strategy:
- **SSG** — content changes rarely, same for all users (marketing pages, blog posts, docs)
- **SSR** — content changes frequently or is user-specific (dashboards, search results)
- **CSR** — highly interactive, no SEO need (admin panels, internal tools)

### 2. Set up Next.js App Router alongside existing code
Migrate incrementally using the Next.js App Router (Next.js 16 is current). A Vite or CRA single-page app cannot be converted in place: create the Next.js project next to it, move one route at a time, and serve the rest through a rewrite until the old app is empty. Versions 15 and 16 changed three defaults this skill relies on: `params`/`searchParams` are Promises, `cookies()`/`headers()` are async, and `fetch` responses are not cached unless you ask (`next: { revalidate }` or `cache: "force-cache"`).

```typescript
// app/products/page.tsx — SSG with revalidation
export const revalidate = 3600; // Regenerate every hour

async function getProducts() {
  const res = await fetch("https://api.northwind-shop.com/products", {
    next: { revalidate: 3600 },
  });
  return res.json();
}

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <main>
      <h1>Products</h1>
      <ProductGrid products={products} />
    </main>
  );
}

// app/products/[id]/page.tsx — SSG with dynamic params
export async function generateStaticParams() {
  const products = await fetch("https://api.northwind-shop.com/products").then(r => r.json());
  return products.map((p: { id: string }) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await fetch(`https://api.northwind-shop.com/products/${id}`, {
    next: { revalidate: 3600 },
  }).then(r => r.json());
  return <ProductDetail product={product} />;
}
```

### 3. Handle hydration mismatches
The most common migration bugs are hydration errors:

```typescript
// BAD — different output on server vs client
function Greeting() {
  return <p>Current time: {new Date().toLocaleTimeString()}</p>;
}

// GOOD — defer client-only content
"use client";
import { useState, useEffect } from "react";

function Greeting() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    setTime(new Date().toLocaleTimeString());
  }, []);
  return <p>Current time: {time ?? "Loading..."}</p>;
}
```

### 4. Migrate data fetching patterns

```typescript
// BEFORE (CSR): useEffect + useState
function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData);
  }, []);
  if (!data) return <Spinner />;
  return <DashboardView data={data} />;
}

// AFTER (SSR): Server Component with async/await
import { cookies } from "next/headers";

async function Dashboard() {
  const cookieStore = await cookies();
  const data = await fetch("http://internal-api:8080/dashboard", {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store", // per-user data must never be shared between requests
  }).then(r => r.json());
  return <DashboardView data={data} />;
}
```

### 5. Configure deployment for SSR

```dockerfile
# Dockerfile for Next.js SSR
FROM node:22-alpine AS builder   # pin by digest in production, e.g. node:22-alpine@sha256:<digest>, so the base image is immutable
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

The `.next/standalone` folder only exists when `next.config.ts` sets `output: "standalone"`. Set `HOSTNAME=0.0.0.0` so the container accepts outside connections, and run behind a reverse proxy (nginx, Caddy) rather than exposing Node directly. Static-only pages can instead use `output: "export"` and be served from any CDN, but that mode has no proxy, cookies or on-demand revalidation.

## Examples

### Example 1: Marketing site migration
**Prompt:** "Migrate our React SPA marketing site to Next.js with SSG. We have 12 pages: homepage, 5 product pages, pricing, about, blog listing, blog posts (40 articles), contact, and FAQ."

**Agent output:**
- Creates Next.js App Router structure with static pages for homepage, pricing, about, contact, FAQ
- Blog listing and posts use `generateStaticParams` + ISR (revalidate every 30 minutes)
- Product pages use SSG with on-demand revalidation via webhook
- Identifies 3 components using `window` directly — moves them into a Client Component that loads them with `next/dynamic` and `ssr: false` (that option errors in Server Components)
- Adds `app/sitemap.ts` and `app/robots.ts` (built into Next.js) for the XML sitemap and robots rules

### Example 2: Dashboard with mixed rendering
**Prompt:** "Our React dashboard app needs SSR for the main feed (SEO matters) but the settings and admin pages can stay client-rendered. How do I set this up incrementally?"

**Agent output:**
- Creates `app/(public)/feed/page.tsx` as a Server Component with SSR
- Creates `app/(private)/settings/page.tsx` with `"use client"` directive, keeping existing CSR logic
- Adds a `proxy.ts` file (called `middleware.ts` before Next.js 16) that redirects unauthenticated users before rendering, and re-checks the session inside the data layer, since a proxy alone is not an authorization boundary
- Migrates the feed's `useEffect` data fetching to server-side `fetch` with cookie forwarding
- Keeps the real-time notification widget as a Client Component embedded within the SSR layout

## Guidelines

- **Migrate incrementally** — move one route at a time, not the entire app at once.
- **Start with SSG pages** — they're the easiest win and don't require a Node.js server.
- **Use `"use client"` sparingly** — only for components that genuinely need browser APIs or interactivity.
- **Test hydration in development** — strict mode double-renders to catch mismatches early, and Next.js shows a diff of server and client markup in the error overlay. Typical causes: dates and locales, `Math.random()`, `window` checks during render, and invalid HTML nesting (`<div>` inside `<p>`).
- **Forward cookies for authenticated SSR** — server-side fetch won't include user cookies automatically.
- **Monitor TTFB after migration** — SSR adds server computation time. If TTFB increases, consider caching or ISR.
- **Server Components cannot use hooks or browser APIs** — add `"use client"` at the top of the interactive file. Props passed from a Server to a Client Component must be serializable.
- **Route segment options** such as `export const revalidate` work until you enable Cache Components (`cacheComponents` in `next.config.ts`), which replaces them with the `"use cache"` directive and `cacheLife`.
- **Keep bundle size in check** — SSR doesn't eliminate the need for code splitting. Use dynamic imports for heavy client components.

## Nuxt and Astro

The same plan applies to the other two frameworks in the description.

- **Nuxt 4 (Vue):** pages render on the server by default. Choose a strategy per route in `nuxt.config.ts`: `routeRules: { "/": { prerender: true }, "/blog/**": { isr: 3600 }, "/admin/**": { ssr: false } }`. Replace browser-only code with `<ClientOnly>` or `onMounted`, and fetch with `useFetch`/`useAsyncData` so the payload is not fetched twice.
- **Astro 7:** pages are prerendered to static HTML by default. For on-demand rendering add an adapter (`@astrojs/node`, for example) and set `export const prerender = false` on those pages. Interactive React or Vue components load only with a `client:*` directive such as `client:visible`.
