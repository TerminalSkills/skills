---
title: "Migrate from Client-Side Rendering to SSR/SSG for SEO and Performance"
slug: migrate-csr-to-ssr-ssg
description: "Transform a client-side React app into a high-performance, SEO-optimized site using Server-Side Rendering and Static Site Generation to improve Core Web Vitals and search rankings."
skills: [ssr-migration, frontend-design, docker-helper]
category: development
tags: [ssr, ssg, seo, performance, react, nextjs, web-vitals, migration]
---

# Migrate from Client-Side Rendering to SSR/SSG for SEO and Performance

## The Problem

Elena, front-end lead at a 55-person B2B SaaS company, watches their marketing site's Search Console rankings slide month after month. Their React SPA (built with Vite) serves an empty `<div id="root">` and shows a blank screen for several seconds while JavaScript downloads and runs. PageSpeed Insights gives the mobile page 31/100, with Largest Contentful Paint at 7.1 seconds, nearly triple the 2.5-second threshold for a "good" score.

The SEO damage is visible: product pages rank on page 3-4 despite better content than competitors, and the titles, descriptions and Open Graph tags are set by JavaScript after load, so link previews and some crawlers see none of them. The outside SEO consultant's report says it plainly: "content that depends on JavaScript is the first thing to go wrong; render it on the server."

Conversion on the marketing pages has dropped as bounce rates climbed, and the sales team hears "your website feels slow" in demos.

## The Solution

The **ssr-migration** skill drives the React-to-Next.js move (App Router, one route at a time), **frontend-design** keeps the rebuilt pages stable and responsive while they are re-created as server components, and **docker-helper** packages the result. Marketing, product and blog pages become static (SSG with incremental regeneration); pages that depend on the visitor become server-rendered. The code in this page was built and run with Next.js 16 (Node 20.9 or newer) and React 19.

## Step-by-Step Walkthrough

### Step 1: Audit Performance and Plan the Migration Strategy

```text
Audit our React SPA's performance and SEO issues. The app has 47 pages:
12 marketing pages (static content), 18 product feature pages (semi-static),
8 blog pages (static), 6 customer case studies (static), and 3 dynamic
pricing/demo request pages. Measure Core Web Vitals (LCP, INP, CLS), check
what a crawler sees without JavaScript, and decide SSG, ISR or SSR per page type.
```

Run the audit with Lighthouse or PageSpeed Insights, and check crawlability with `curl -s https://yoursite.com/pricing | grep -c "<h1"`: if the HTML a crawler downloads has no headline, nothing indexable ships with the page. The current Core Web Vitals targets are LCP at 2.5 seconds or less, INP (Interaction to Next Paint, which replaced First Input Delay) at 200 milliseconds or less, and CLS under 0.1.

| Metric (mobile) | Elena's baseline | Target |
|-----------------|------------------|--------|
| Largest Contentful Paint | 7.1s | 2.5s or less |
| Interaction to Next Paint | 480ms | 200ms or less |
| Cumulative Layout Shift | 0.23 | 0.1 or less |
| JavaScript downloaded | 847 KB | as little as possible |

The plan splits the 47 pages: 44 become static with revalidation (marketing, product features, blog, case studies), and 3 (pricing, demo request, the logged-in dashboard) render per request.

### Step 2: Migrate to Next.js with Static Generation

```text
Create a Next.js App Router project next to the SPA and move the marketing,
product and blog routes into it one at a time, rendering as static with
revalidation. Add per-page metadata, canonical URLs, JSON-LD, a sitemap and
robots.txt. Serve the routes not yet migrated through a rewrite to the old app.
```

A Vite or CRA app cannot be converted in place, so the new project grows beside it and takes over route by route. A product page as a server component, with ISR and metadata:

```tsx
// app/products/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProducts, getProductBySlug } from "@/lib/products";

export const revalidate = 86400; // regenerate at most once per day

// Known products are pre-rendered at build time; unknown slugs render on first request, then are cached
export async function generateStaticParams() {
  return (await getAllProducts()).map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.summary,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.summary, type: "website" },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.summary };
  return (
    <main>
      <h1>{product.name}</h1>
      <p>{product.summary}</p>
      {/* escape "<" so content can never close the script tag */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </main>
  );
}
```

In Next.js 15 and 16, `params` is a Promise, which is why it is awaited. Set `metadataBase` in the root layout so canonical and Open Graph URLs resolve to absolute addresses. The sitemap and robots rules are plain files that Next.js turns into `/sitemap.xml` and `/robots.txt`:

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";
import { getAllProducts } from "@/lib/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.example.com";
  return [{ url: base }, ...(await getAllProducts()).map((p) => ({ url: `${base}/products/${p.slug}` }))];
}
```

For urgent content changes, the CMS calls a webhook that revalidates one path. The secret is compared in constant time and the slug is validated:

```ts
// app/api/revalidate/route.ts
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = secret.length > 0 && given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return new Response("Bad slug", { status: 400 });
  revalidatePath(`/products/${slug}`);
  return Response.json({ revalidated: slug });
}
```

`next build` prints `●` next to each pre-rendered product page, and `curl -s localhost:3000/products/lead-scoring` returns the title, canonical link and JSON-LD in the first response, with no JavaScript needed.

### Step 3: Server-Render the Dynamic Pages and Fix Core Web Vitals

```text
Make the pricing page render per request from the visitor's cookie. Then get
LCP, INP and CLS into the "good" range: stable image sizes, a prioritized hero
image, less client JavaScript, and a mobile-first layout with skeleton states.
```

A route that reads request data is rendered on each request automatically:

```tsx
// app/pricing/page.tsx
import { cookies } from "next/headers";

export default async function Pricing() {
  const plan = (await cookies()).get("plan")?.value ?? "starter";
  return <main><h1>Pricing</h1><p>Your current plan: {plan}</p></main>;
}
```

The metrics map to specific changes, guided by the frontend-design skill (mobile first, semantic HTML, real content when testing, skeletons instead of spinners):

- **LCP:** the hero uses `next/image` with `preload` (in Next.js 16 it replaces the deprecated `priority` prop), so it is preloaded and served resized. Next.js serves WebP by default; AVIF is opt-in through `images.formats` in `next.config.ts`. HTML arrives with the content already in it.
- **INP:** components are server components by default, so only interactive pieces (a pricing slider, a demo form) carry `"use client"` and ship JavaScript. Heavy browser-only widgets load with `next/dynamic` from a Client Component.
- **CLS:** `width` and `height` on every image reserve its space, skeletons match the final dimensions, and animations stay on `transform` and `opacity`.

```tsx
<Image src="/hero.png" alt="Product overview" width={1200} height={630} preload />
```

Hydration errors are the typical migration bug: anything that differs between server and client (`new Date()` in render, `window` checks, `localStorage` at module level) belongs in a `useEffect` or a client-only component. The ssr-migration skill has the audit commands that find these before the move.

### Step 4: Deploy and Measure

```text
Package the Next.js app as a Docker image, run it behind a reverse proxy,
and set up before/after measurement for LCP, INP and indexed pages.
```

Next.js can emit a minimal server with `output: "standalone"` in `next.config.ts`. The docker-helper image builds it in one stage and runs it in another, as a non-root user:

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Add a `.dockerignore` with `node_modules`, `.next` and `.env*`, and publish the port on loopback behind nginx or Caddy: `docker run -d -p 127.0.0.1:3000:3000 -e REVALIDATE_SECRET marketing-site`. `HOSTNAME=0.0.0.0` is for the container; the published port is what controls exposure. Put a CDN in front: static assets under `/_next/static` are fingerprinted and safe to cache for a year, and ISR pages already send `s-maxage` with `stale-while-revalidate`.

Measure with real-user data rather than lab runs alone: the Core Web Vitals report and the Pages indexing report in Search Console, plus the field data in PageSpeed Insights. Compare 28 days before and after, and run the old and new versions side by side with a traffic split if you want a conversion comparison.

## Real-World Example

Elena's team migrates the 47 pages over six weeks, route by route, with the SPA still serving everything not yet moved. The first week is the audit and the Next.js project; the next four move marketing, product, blog and case-study routes to static rendering with revalidation; the last two cover the pricing and demo pages, the Docker image and the redirects from the old URLs.

The numbers below are Elena's own results from her production site, not benchmarks you should expect: mobile PageSpeed went from 31 to the 90s, LCP from 7.1s to about 1.2s, and the pages Google had indexed rose from under a quarter of the site to nearly all of it over the following quarter. Her team now ships a marketing page by merging a pull request: the content is in the first HTML response, the preview cards work in Slack and LinkedIn, and sales stopped hearing about site speed in demos.

## Related Skills

- [ssr-migration](/skills/ssr-migration) - incremental CSR to SSR/SSG migration, hydration fixes, deployment
- [frontend-design](/skills/frontend-design) - responsive, accessible layout and component design for the rebuilt pages
- [docker-helper](/skills/docker-helper) - the multi-stage image for the Next.js standalone server
