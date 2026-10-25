---
name: astro
description: >-
  Assists with building content-driven websites using Astro's island architecture. Use when
  creating static sites, blogs, documentation, or marketing pages that ship zero JavaScript
  by default. Trigger words: astro, static site, island architecture, content collections,
  SSG, hybrid rendering, astro components.
license: Apache-2.0
compatibility: "Node.js 22.12+ for Astro 6; Astro 7 requires Node.js 22.23.4+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/withastro/astro
  tags: "astro, static-site, island-architecture, ssg, content"
---

# Astro

## Overview

Astro is a web framework for building content-driven websites that ships zero JavaScript by default. Its island architecture hydrates only interactive components, achieving excellent Lighthouse scores while supporting React, Vue, Svelte, or any UI framework where interactivity is needed.

## Instructions

- When starting a project, run `npm create astro@latest`, then `npx astro add react` (or `vue`, `svelte`, `tailwind`, `mdx`) to install integrations. Astro 6 and 7 need a recent Node 22 (see `compatibility`); set it in `.nvmrc` and in the host's build settings.
- When creating pages, use file-based routing in `src/pages/` with `.astro`, `.md`, or `.mdx` files, and organize shared structure in `src/layouts/`.
- When adding interactivity, use client directives on framework components: prefer `client:visible` or `client:idle` over `client:load` since most components do not need immediate hydration.
- When managing content, define collections in `src/content.config.ts` (not the old `src/content/config.ts`) with a `loader` (`glob()` or `file()` from `astro/loaders`) and a Zod schema (`import { z } from 'astro/zod'`), then query with `getCollection()` and `getEntry()`. Entries are identified by `entry.id`, and you render one with `render(entry)` imported from `astro:content` (the old `entry.slug` and `entry.render()` no longer exist).
- When choosing rendering modes, default to static (SSG) for marketing and content pages, add a server adapter (`npx astro add node`, `vercel`, `netlify`, `cloudflare`) for on-demand pages, and mark individual pages with `export const prerender = false`. There is no `output: "hybrid"` any more; `output: "server"` makes every page on-demand unless it sets `prerender = true`.
- When optimizing images, use the `<Image>` component from `astro:assets` for automatic format conversion (WebP/AVIF), resizing, and lazy loading instead of raw `<img>` tags.
- When adding page transitions, add `<ClientRouter />` from `astro:transitions` to the shared `<head>` for SPA-like navigation. `<ViewTransitions />` was renamed in Astro 5 and no longer exists: a build that imports it fails with `"ViewTransitions" is not exported`.
- When integrating UI frameworks, install the appropriate integration (`@astrojs/react`, `@astrojs/vue`, `@astrojs/svelte`) and use Astro components for static content, reaching for framework components only when interactivity is required.

A minimal collection that builds on Astro 7 (verified):

```typescript
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({ title: z.string(), date: z.coerce.date(), tags: z.array(z.string()).default([]) }),
});

export const collections = { blog };
```

```astro
---
// src/pages/blog/[id].astro
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}
const { post } = Astro.props;
const { Content } = await render(post);
---
<h1>{post.data.title}</h1>
<Content />
```

A shared layout with page transitions (verified to build on Astro 7):

```astro
---
// src/layouts/Base.astro
import { ClientRouter } from 'astro:transitions';
const { title } = Astro.props;
---
<html lang="en">
  <head><title>{title}</title><ClientRouter /></head>
  <body><slot /></body>
</html>
```

## Examples

### Example 1: Build a blog with Content Collections

**User request:** "Create an Astro blog with type-safe Markdown content"

**Actions:**
1. Define a blog Content Collection with Zod schema for frontmatter (title, date, tags, author)
2. Create dynamic route `src/pages/blog/[id].astro` with `getStaticPaths()`
3. Build blog index page querying `getCollection("blog")` with sorting
4. Add layout with SEO meta tags, navigation, and View Transitions

**Output:** A statically generated blog with validated content, clean URLs, and smooth page transitions.

### Example 2: Add interactive components to a static site

**User request:** "Add a React search component to my Astro documentation site"

**Actions:**
1. Install `@astrojs/react` integration
2. Create the React search component with state and event handling
3. Add the component to the page with `client:idle` directive
4. Pass static data as props from the Astro page frontmatter

**Output:** A documentation site that is fully static except for the interactive search island.

## Guidelines

- Use Astro components (`.astro`) for static content; only use React/Vue/Svelte when interactivity is needed.
- Default to `client:visible` or `client:idle` over `client:load` for hydration directives.
- Define Content Collections with strict Zod schemas to catch content errors at build time. Astro 6 moved to Zod 4: `.default()` values must match the output type, and `z` from `astro:content` is deprecated in favour of `astro/zod`.
- Astro 6 removed automatic support for legacy (v4) collections; migrate to the Content Layer API above rather than relying on `legacy.collectionsBackwardsCompat`.
- Astro 7 uses Vite 8, a Rust compiler and `compressHTML: 'jsx'` by default, reserves `src/fetch.ts`, and removed `@astrojs/db`. Read the upgrade guide at docs.astro.build before bumping a major version.
- Use `astro:assets` `<Image>` over raw `<img>` tags for automatic optimization.
- Keep layouts thin with shared `<head>`, navigation, and footer; put page-specific content in pages.
- Keep the default static output for marketing pages and add `export const prerender = false` only on personalized or dynamic pages (this needs an adapter).
- Enable View Transitions for SPA-like navigation without shipping a router.
