---
title: Migrate a Wix Site to a Next.js App
slug: migrate-a-wix-site-to-nextjs
description: "Rebuild a closed Wix website as a React/Next.js app — inventory the live site, extract content, design tokens, and assets, scaffold Next.js, and migrate the Wix CMS-backed dynamic pages without losing SEO."
skills:
  - wix-to-react
  - nextjs
  - tailwindcss
  - web-scraper
category: development
tags:
  - wix
  - nextjs
  - react
  - migration
  - web-scraping
  - seo
---

# Migrate a Wix Site to a Next.js App

## The Problem

A consulting firm built its website on Wix three years ago. It is a 9-page marketing site plus a `/team` section that is a Wix **dynamic page** — a repeater bound to a "Team" CMS collection, so each consultant gets a URL like `/team/dana-okafor`. The site ranks well on Google for the firm's service keywords.

The pain has compounded. The Wix Business plan costs $32/month and the editor is slow to load. Marketing wants an A/B test on the homepage hero, but Wix's editor offers no clean way to fork a layout. Engineering wants the site in the same Git repo and CI pipeline as the rest of the product, with real components they can unit-test. And nobody on the team can move fast inside Wix's drag-and-drop canvas — a one-line copy change means clicking through the editor and republishing.

The instinct is "just export the site to code." But **Wix has no source-code export** — there is no button that hands you the HTML/CSS/JS, and the rendered DOM is deeply nested generated markup that is useless to import. The team is stuck: they own the content and the design, but not in any form they can move. Worse, the `/team` page isn't static — its data lives in a Wix collection — so a naive copy-paste would lose the dynamic content entirely, and any URL changes during the move would tank the hard-won SEO.

## The Solution

Use the **wix-to-react** skill to recreate the site as a Next.js app instead of trying to export it. The skill treats the live Wix site as a *reference*, not a source: it inventories every page from the auto-generated sitemap, drives a headless browser (**web-scraper**) over each URL to capture rendered content, computed design tokens, and asset URLs, then scaffolds a clean **nextjs** + **tailwindcss** app where each page becomes real components.

The dynamic `/team` page is handled by exporting the Wix "Team" collection to CSV from the dashboard and converting it to local MDX, so the data survives the move. SEO is preserved deliberately — the original URL slugs are kept, per-page meta and Open Graph tags are carried into Next's `metadata` export, and a crawl confirms parity before DNS cutover. The result is a Git-tracked, component-based site with no Wix subscription.

## Step-by-Step Walkthrough

### Step 1: Inventory the site from the sitemap

```text
Migrate our Wix site at https://www.lumen-consulting.com to Next.js. It's 9 static
pages plus a /team section that's a Wix dynamic page bound to a Team collection.
Start by listing every page we need to rebuild.
```

The skill pulls Wix's auto-generated sitemap and lists pages, separating static from dynamic:

```bash
curl -s https://www.lumen-consulting.com/sitemap.xml | grep -oP '(?<=<loc>)[^<]+'
# https://www.lumen-consulting.com/
# https://www.lumen-consulting.com/services
# https://www.lumen-consulting.com/team
# https://www.lumen-consulting.com/team/dana-okafor
# https://www.lumen-consulting.com/team/marcus-bl
# ...
```

It also checks whether **Velo (Dev Mode)** is enabled — if it were, the team could export the collection and page code via the Wix CLI instead of scraping. Here it is not, so the skill falls back to extraction.

### Step 2: Extract content, design tokens, and assets

The skill runs a Playwright pass over every URL, saving the rendered HTML, collecting the real `static.wixstatic.com` image URLs (stripped of their transform suffix to get originals), and reading computed styles into a token file:

```bash
node extract.mjs https://www.lumen-consulting.com
# extracted/home.html, extracted/_services.html, ...
# extracted/_assets.txt   → 41 image URLs to self-host
# extracted/_tokens.json  → { colors: ["#0f172a", "#14b8a6", ...], fonts: [...], sizes: [...] }
```

Every asset is downloaded into `public/` because Wix CDN URLs carry transforms and can block hotlinking. The saved HTML is treated as a layout-and-copy reference, never imported verbatim.

### Step 3: Export the dynamic collection

The firm wants off Wix entirely, so the Team collection is exported from the dashboard (Content Manager → Team → Export → CSV) and converted to MDX:

```text
content/team/dana-okafor.mdx
---
name: Dana Okafor
role: Principal, Operations
photo: /team/dana-okafor.jpg
order: 1
---
Dana leads operational turnarounds for mid-market manufacturers...
```

### Step 4: Scaffold Next.js and map the routes

```bash
npx create-next-app@latest lumen-site --ts --tailwind --app --eslint
```

Static pages become `app/services/page.tsx`, etc. The dynamic page becomes `app/team/[slug]/page.tsx` reading the MDX with `generateStaticParams`. The extracted `_tokens.json` is poured into `tailwind.config` so the two brand colors, teal accent, and type scale match the original pixel-for-pixel.

### Step 5: Rebuild pages as components and preserve SEO

Each page is decomposed into `Header`, `Hero`, content sections, and `Footer`, with the shared header/footer living in `layout.tsx`. Critically, the skill keeps the original slugs and carries SEO metadata across:

```tsx
// app/team/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const member = await getMember(params.slug);
  return {
    title: `${member.name} — Lumen Consulting`,
    description: member.role,
    openGraph: { images: [member.photo] },
  };
}
```

A 301 redirect map covers any path that changed, `sitemap.xml` and `robots.txt` are regenerated, and a crawl of old-vs-new confirms no page is missing before DNS is switched and the Wix plan is cancelled.

## Real-World Example

The Lumen Consulting migration took two days. The extraction pass captured all 9 static pages plus 6 team-member dynamic pages and downloaded 41 images in one run. The `_tokens.json` revealed the "brand" was actually 11 near-duplicate grays and 3 teals — consolidated to 4 grays and 1 teal in `tailwind.config`, which made the rebuilt site more consistent than the original.

The `/team` collection exported cleanly to 6 MDX files, so adding a seventh consultant is now a one-file pull request instead of a trip through the Wix editor. After cutover, Lighthouse scores went from 64 to 98 on mobile performance (Wix's bundle was the bottleneck), and because the slugs were preserved and 301s were in place for the two pages that were renamed, Search Console showed no ranking drop over the following month. Monthly hosting moved from the $32 Wix plan to the firm's existing Vercel account at no marginal cost.

## Related Skills

- **wix-to-react** — the core skill: inventory, extract, scaffold, rebuild, and migrate dynamic Wix features (CMS, Stores, Blog, Forms) either fully off Wix or via the `@wix/sdk` headless backend.
- **nextjs** — the target framework; App Router routes, Server Components, and `metadata` exports for SEO.
- **tailwindcss** — translate the extracted design tokens into a constrained theme and rebuild responsive layouts.
- **web-scraper** — drive the headless browser that captures rendered content, computed styles, and asset URLs from the live Wix site.
