---
name: wix-to-react
description: >-
  Convert a Wix website into a React or Next.js application. Use when a user
  asks to migrate off Wix, rebuild a Wix site in React, export a Wix site to
  code, escape Wix's no-code editor, or move from Wix to a custom frontend.
  Wix has no native code export, so this covers inventorying the site,
  extracting content/design/assets, scaffolding a React/Next.js app, rebuilding
  pages and components, and migrating dynamic features (Wix CMS collections,
  Stores, Blog, Forms) — either fully off Wix or by keeping Wix as a headless
  backend via @wix/sdk. Trigger words: Wix to React, migrate off Wix, export
  Wix, Wix to Next.js, rebuild Wix site, Wix headless.
license: Apache-2.0
compatibility: "Node.js 18+. React 18+ / Next.js 14+. Optional: @wix/sdk for headless data, Playwright for extraction."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["wix", "react", "nextjs", "migration", "web-scraping"]
---

# Wix to React

## Overview
Wix is a closed no-code platform with **no source-code export** — you cannot download the components, so "converting to React" means *recreating* the site, not transpiling it. This skill covers the realistic path: inventory the live site, extract its content, design tokens, and assets, scaffold a React/Next.js app, rebuild each page as components, and migrate dynamic features.

There are two end states — choose one up front:

- **Full migration** — leave Wix entirely. Content moves to a new CMS (Sanity, Contentful, MDX), commerce to a new backend (Shopify, Medusa), forms to your own handler. No Wix subscription.
- **Headless** — keep Wix as the data backend (CMS collections, Stores, Bookings stay in Wix) and build only the React frontend with `@wix/sdk`. Less migration work, keeps the Wix dashboard for non-technical editors.

Recommend **Next.js** over plain React: Wix sites are server-rendered and SEO-indexed, so SSG/SSR is needed to preserve rankings.

## Instructions

### 1. Inventory the Wix site
Determine scope before touching code:

```bash
# Full page list — Wix auto-generates a sitemap
curl -s https://www.example.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+'
# Wix often splits it: pages, blog posts, store products
curl -s https://www.example.com/sitemap.xml | grep -oP 'sitemap-[^<]+'
```

Identify, per page: static vs **dynamic page** (Wix repeater bound to a collection, URL like `/team/{slug}`), and which Wix apps are used — Stores, Bookings, Blog, Forms, Members, Events. Check whether **Velo (Dev Mode)** is enabled: if so, the owner can export backend/page code and `wix-data` collections via the Wix CLI/Git integration, which is far cleaner than scraping.

### 2. Extract content, design tokens, and assets
For sites without API access, drive a headless browser over the sitemap and capture the rendered DOM, computed design tokens, and Wix media URLs:

```javascript
// extract.mjs — node extract.mjs https://www.example.com
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";

const base = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

await mkdir("extracted", { recursive: true });
const assets = new Set();
const tokens = { colors: new Set(), fonts: new Set(), sizes: new Set() };

for (const url of urls) {
  await page.goto(url, { waitUntil: "networkidle" });
  // Wix media lives on static.wixstatic.com — collect originals to self-host
  for (const src of await page.$$eval("img", (els) => els.map((e) => e.currentSrc || e.src)))
    if (src.includes("wixstatic.com")) assets.add(src.split("/v1/")[0]); // strip transform → original
  // Computed design tokens from real elements
  const t = await page.evaluate(() => {
    const out = { colors: [], fonts: [], sizes: [] };
    for (const el of document.querySelectorAll("h1,h2,h3,p,a,button,div")) {
      const s = getComputedStyle(el);
      out.colors.push(s.color, s.backgroundColor);
      out.fonts.push(s.fontFamily);
      out.sizes.push(s.fontSize);
    }
    return out;
  });
  for (const k of Object.keys(tokens)) t[k].forEach((v) => v && tokens[k].add(v));
  const slug = new URL(url).pathname.replace(/\//g, "_") || "home";
  await writeFile(`extracted/${slug}.html`, await page.content());
}

await writeFile("extracted/_assets.txt", [...assets].join("\n"));
await writeFile("extracted/_tokens.json", JSON.stringify(
  Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, [...v]])), null, 2));
await browser.close();
```

Download every asset URL locally (Wix CDN links can rotate and block hotlinking) and feed `_tokens.json` into the Tailwind theme. The saved HTML is a **reference for layout and copy, not source to import** — Wix's DOM is deeply nested generated markup; rebuild clean components instead of pasting it.

### 3. Export dynamic data
**With Wix Headless** — create a Headless project in the Wix dashboard, get an OAuth client ID, then read collections, products, or posts directly:

```javascript
// lib/wix.js
import { createClient, OAuthStrategy } from "@wix/sdk";
import { items } from "@wix/data";
import { products } from "@wix/stores";

export const wix = createClient({
  modules: { items, products },
  auth: OAuthStrategy({ clientId: process.env.WIX_CLIENT_ID }),
});

// app/team/page.jsx — a former Wix dynamic page, now a Server Component
export default async function Team() {
  const { items: team } = await wix.items.query("Team").find();
  return team.map((m) => <MemberCard key={m._id} {...m.data} />);
}
```

**Without Headless** — export each Wix CMS collection to CSV from the dashboard (Content Manager → collection → Export), or scrape the dynamic pages from step 2, and import into your chosen CMS or local JSON/MDX.

### 4. Scaffold the React/Next.js app
```bash
npx create-next-app@latest mysite --ts --tailwind --app --eslint
```

Map the inventory to routes: static pages → `app/<page>/page.tsx`; dynamic pages → `app/<section>/[slug]/page.tsx` with `generateStaticParams`; blog → `app/blog/[slug]`. Put the extracted tokens into `tailwind.config` so spacing, colors, and fonts match the original.

### 5. Rebuild pages as components
Decompose each page into Header, Hero, sections, Footer. Reuse the global Header/Footer in a `layout.tsx`. Match responsive behavior with Tailwind breakpoints (`sm:`, `md:`, `lg:`) instead of Wix's per-breakpoint absolute positioning. Recreate Wix's stretched-section layout with `max-w-*` centered containers — do not reproduce its pixel-anchored grid.

### 6. Migrate dynamic features
| Wix app | Full-migration target | Headless target |
|---|---|---|
| CMS collections | Sanity / Contentful / MDX | `@wix/data` |
| Stores | Shopify / Medusa | `@wix/stores` + `@wix/ecom` |
| Blog | MDX / CMS | `@wix/blog` |
| Forms | API route + Resend/email | `@wix/forms` |
| Members | Clerk / Auth.js | `@wix/members` |
| Bookings | Cal.com | `@wix/bookings` |

### 7. Preserve SEO and verify parity
Carry over per-page `<title>`, meta description, Open Graph tags (use Next's `metadata` export), and **keep the exact URL slugs**. Add 301 redirects for any changed paths, regenerate `sitemap.xml` and `robots.txt`, and copy image `alt` text. Then verify: crawl old vs new for missing pages, run Lighthouse on key pages, and visually diff against the live Wix site before cutover. Switch DNS only after parity checks pass.

## Examples

### Example 1: Marketing site with a CMS-backed team page
**Prompt:** "Migrate our Wix business site to Next.js. It's 8 static pages plus a /team page that's a Wix dynamic page bound to a Team collection. We want off Wix completely."

**Agent output:**
- Pulls the page list from `sitemap.xml`, runs the Playwright extractor over all 8 pages plus the dynamic `/team/{slug}` entries, and downloads ~40 images from `static.wixstatic.com` into `public/`.
- Exports the Team collection to CSV from the Wix dashboard and converts it to `content/team/*.mdx`.
- Scaffolds Next.js + Tailwind, writes `tailwind.config` from `_tokens.json` (5 brand colors, 2 fonts), builds shared `Header`/`Footer` in `layout.tsx`, and rebuilds each page as section components.
- Maps `/team` to `app/team/[slug]/page.tsx` reading the MDX, adds `metadata` exports per page with original titles/descriptions, and generates a 301 redirect map. Cancels the Wix plan after a Lighthouse + visual-diff parity check.

### Example 2: Wix Stores shop kept headless
**Prompt:** "Rebuild our Wix store as a React frontend but keep managing products in Wix. ~120 products, a cart, and checkout."

**Agent output:**
- Sets up a Wix Headless project, stores `WIX_CLIENT_ID` in `.env.local`, and wires `@wix/sdk` with `@wix/stores` + `@wix/ecom`.
- Builds `app/shop/page.tsx` and `app/shop/[slug]/page.tsx` as Server Components querying products via the SDK, with ISR (`revalidate = 300`) so inventory stays fresh.
- Implements cart with `@wix/ecom` current-cart APIs in a Client Component, and redirects checkout to Wix's hosted checkout via `@wix/ecom` `redirects` to avoid rebuilding payments.
- Extracts the homepage/marketing pages statically (Example 1 flow) while leaving product data in Wix, so non-technical staff keep using the Wix Stores dashboard.

## Guidelines

- **Only migrate sites you own or are authorized to migrate.** Scraping someone else's Wix site and rebuilding it can violate copyright and Wix's ToS.
- **There is no Wix code export** — treat extracted HTML as a layout/copy reference, never import Wix's generated DOM into React.
- **Decide full-migration vs headless first** — it changes the entire data layer. Headless is faster and keeps the editor; full migration removes the Wix dependency and cost.
- **Self-host assets** — download from `static.wixstatic.com`; those URLs carry transforms and may block hotlinking or rotate.
- **If Velo/Dev Mode is on, use it** — exporting code and `wix-data` collections via the Wix CLI beats scraping.
- **Preserve URLs and SEO** — keep slugs, carry meta/OG tags into Next's `metadata`, add 301s for changed paths, and verify with a crawl before DNS cutover.
- **Rebuild responsively** — replace Wix's absolute, per-breakpoint positioning with flow layout and Tailwind breakpoints; don't replicate its pixel grid.
- **Migrate incrementally** — get static pages live first, then move dynamic features (Stores, Blog, Members) one app at a time.
