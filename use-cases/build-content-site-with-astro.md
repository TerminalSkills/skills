---
title: Build a Content Site with Astro
slug: build-content-site-with-astro
description: Build a developer documentation site with Astro that scores 100 on every Lighthouse metric, ships zero JavaScript for static pages, and hydrates only the interactive search and code playground components.
skills:
  - astro
  - vite
category: development
tags:
  - static-site
  - performance
  - documentation
  - seo
  - content
---

# Build a Content Site with Astro

Ravi maintains developer documentation for a 50-person API company. The docs site is a Next.js app that ships 380KB of JavaScript to render what is essentially static Markdown. Every page load flashes white, Lighthouse performance scores hover around 60, and the team spends more time debugging hydration mismatches than writing docs. He wants a site that loads instantly, renders perfectly without JavaScript, and only uses client-side code where it genuinely adds value — the search bar and the interactive API playground.

## Step 1 — Set Up Content Collections with Type-Safe Schemas

Content Collections turn a folder of Markdown files into a queryable, type-safe data layer. Every document is validated against a Zod schema at build time — a missing `title` or invalid `category` breaks the build, not the production site.

```typescript
// src/content/config.ts — Content collection schemas.
// Astro validates every Markdown file against these schemas at build time.
// A typo in frontmatter fails the build instead of rendering a broken page.

import { defineCollection, z, reference } from "astro:content";

const docs = defineCollection({
  type: "content",  // Markdown/MDX files
  schema: z.object({
    title: z.string().min(5).max(120),
    description: z.string().min(20).max(300),
    category: z.enum([
      "getting-started",
      "guides",
      "api-reference",
      "sdks",
      "integrations",
      "troubleshooting",
    ]),
    order: z.number().int().min(0),           // Sort order within category
    lastUpdated: z.date(),
    author: reference("authors"),              // Reference to authors collection
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    deprecated: z.boolean().default(false),
    deprecatedMessage: z.string().optional(),
  }),
});

const authors = defineCollection({
  type: "data",  // JSON/YAML files
  schema: z.object({
    name: z.string(),
    title: z.string(),
    avatar: z.string().url(),
    github: z.string().optional(),
  }),
});

const changelogs = defineCollection({
  type: "content",
  schema: z.object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    date: z.date(),
    highlights: z.array(z.string()).min(1),
    breaking: z.boolean().default(false),
  }),
});

export const collections = { docs, authors, changelogs };
```

```markdown
---
# src/content/docs/authentication/api-keys.md
title: "API Key Authentication"
description: "Generate, rotate, and manage API keys for server-to-server authentication with rate limiting and scope controls."
category: content
order: 2
lastUpdated: 2025-01-15
author: "ravi"
tags: ["auth", "api-keys", "security"]
---

# API Key Authentication

API keys are the simplest way to authenticate server-to-server requests...
```

The `reference("authors")` field creates a typed relationship between docs and authors. When rendering a doc page, Astro resolves the reference automatically — no manual lookups, no "author not found" errors in production.

## Step 2 — Build the Documentation Layout with Navigation

The layout renders entirely to HTML at build time. The sidebar navigation is generated from the content collection, sorted by category and order — no client-side JavaScript needed to render a table of contents.

```astro
---
// src/layouts/DocsLayout.astro — Documentation page shell.
// Everything here renders to static HTML. The only JavaScript
// on the page comes from explicitly hydrated island components.

import { getCollection } from "astro:content";
import { ViewTransitions } from "astro:transitions";
import Navigation from "@/components/Navigation.astro";
import TableOfContents from "@/components/TableOfContents.astro";
import SearchButton from "@/components/SearchButton";
import Footer from "@/components/Footer.astro";

interface Props {
  title: string;
  description: string;
  headings: { depth: number; slug: string; text: string }[];
  lastUpdated?: Date;
}

const { title, description, headings, lastUpdated } = Astro.props;

// Fetch all non-draft docs for sidebar navigation
const allDocs = await getCollection("docs", ({ data }) => !data.draft);

// Group by category and sort by order within each group
const categories = Object.groupBy(allDocs, (doc) => doc.data.category);
const sortedCategories = Object.entries(categories).map(([name, docs]) => ({
  name,
  docs: docs!.sort((a, b) => a.data.order - b.data.order),
}));
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} — Acme API Docs</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={`${title} — Acme API Docs`} />
    <meta property="og:description" content={description} />
    <ViewTransitions />
  </head>
  <body class="min-h-screen bg-white dark:bg-gray-950">
    <header class="sticky top-0 z-50 border-b bg-white/80 backdrop-blur dark:bg-gray-950/80">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <a href="/" class="text-xl font-bold">Acme Docs</a>
        <!-- Search is the one interactive component in the header -->
        <SearchButton client:idle />
      </div>
    </header>

    <div class="mx-auto max-w-7xl px-6 lg:grid lg:grid-cols-[250px_1fr_200px] lg:gap-8">
      <!-- Left sidebar: static navigation -->
      <aside class="hidden lg:block py-8">
        <Navigation categories={sortedCategories} currentPath={Astro.url.pathname} />
      </aside>

      <!-- Main content -->
      <main class="py-8 prose prose-gray dark:prose-invert max-w-none">
        <h1>{title}</h1>
        {lastUpdated && (
          <p class="text-sm text-gray-500">
            Last updated: {lastUpdated.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
        <slot />
      </main>

      <!-- Right sidebar: table of contents -->
      <aside class="hidden xl:block py-8">
        <TableOfContents headings={headings} />
      </aside>
    </div>

    <Footer />
  </body>
</html>
```

The `<SearchButton client:idle />` directive is the island architecture in action. The search button component hydrates only after the browser finishes critical work (using `requestIdleCallback`). The rest of the page — navigation, content, table of contents, footer — is pure HTML with zero JavaScript.

## Step 3 — Add Interactive Islands for Search and Code Playground

Only two components on the entire site need JavaScript: the search modal (powered by Pagefind) and the API playground where users can test endpoints live.

```tsx
// src/components/SearchButton.tsx — React component for search.
// This is the only React on the site. It hydrates with client:idle
// because search isn't needed in the first 100ms of page load.

import { useState, useEffect, useCallback } from "react";

export default function SearchButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  // Load Pagefind lazily — only when search is first opened
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }

    // Pagefind is generated at build time and loaded on demand (~20KB)
    // @ts-ignore — Pagefind is loaded dynamically
    const pagefind = await import("/pagefind/pagefind.js");
    await pagefind.init();
    const response = await pagefind.search(q);
    const loaded = await Promise.all(
      response.results.slice(0, 8).map((r: any) => r.data())
    );
    setResults(loaded);
  }, []);

  useEffect(() => {
    // Cmd+K / Ctrl+K to open search
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-gray-500"
      >
        <span>Search docs...</span>
        <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl dark:bg-gray-900">
            <input
              autoFocus
              type="text"
              placeholder="Search documentation..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
              className="w-full border-b px-4 py-3 text-lg outline-none"
            />
            <ul className="max-h-96 overflow-y-auto p-2">
              {results.map((result, i) => (
                <li key={i}>
                  <a
                    href={result.url}
                    className="block rounded-lg px-3 py-2 hover:bg-gray-100"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="font-medium">{result.meta?.title}</div>
                    <div
                      className="text-sm text-gray-500 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

interface SearchResult {
  url: string;
  meta?: { title?: string };
  excerpt: string;
}
```

```tsx
// src/components/ApiPlayground.tsx — Interactive API tester.
// Hydrated with client:visible — only loads JavaScript when the user
// scrolls down to the playground section (often never, for quick readers).

import { useState } from "react";

interface Props {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  defaultBody?: string;
}

export default function ApiPlayground({ endpoint, method, defaultBody }: Props) {
  const [body, setBody] = useState(defaultBody || "");
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`https://api.example.com${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method !== "GET" && body ? { body } : {}),
      });
      setStatus(res.status);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse(`Error: ${err instanceof Error ? err.message : "Request failed"}`);
      setStatus(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-gray-950 p-4 text-white">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-mono font-bold">
          {method}
        </span>
        <code className="text-sm text-gray-300">{endpoint}</code>
        <button
          onClick={execute}
          disabled={isLoading}
          className="ml-auto rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Try it"}
        </button>
      </div>

      {method !== "GET" && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mb-3 w-full rounded bg-gray-900 p-3 font-mono text-sm text-green-400"
          placeholder="Request body (JSON)"
        />
      )}

      {response && (
        <div className="rounded bg-gray-900 p-3">
          <div className="mb-2 text-xs text-gray-500">
            Status: <span className={status && status < 400 ? "text-green-400" : "text-red-400"}>{status}</span>
          </div>
          <pre className="overflow-x-auto text-sm text-gray-300">{response}</pre>
        </div>
      )}
    </div>
  );
}
```

The API playground uses `client:visible` — it only downloads and hydrates when the user scrolls to it. Readers who find their answer in the text above never load the playground's JavaScript at all.

## Step 4 — Generate Pages from Content Collections

Dynamic routes use `getStaticPaths()` to generate a page for every document at build time. The content is rendered to HTML with syntax highlighting, heading anchors, and custom MDX components — all at build time, shipped as static HTML.

```astro
---
// src/pages/docs/[...slug].astro — Dynamic doc page.
// getStaticPaths() generates a route for every doc in the collection.
// At build time, Astro renders each doc to static HTML.

import { getCollection, getEntry } from "astro:content";
import DocsLayout from "@/layouts/DocsLayout.astro";
import ApiPlayground from "@/components/ApiPlayground";

export async function getStaticPaths() {
  const docs = await getCollection("docs", ({ data }) => !data.draft);
  return docs.map((doc) => ({
    params: { slug: doc.slug },
    props: { doc },
  }));
}

const { doc } = Astro.props;
const { Content, headings } = await doc.render();

// Resolve the author reference to get full author data
const author = await getEntry(doc.data.author);
---

<DocsLayout
  title={doc.data.title}
  description={doc.data.description}
  headings={headings}
  lastUpdated={doc.data.lastUpdated}
>
  {doc.data.deprecated && (
    <div class="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4 mb-6 dark:bg-yellow-900/20">
      <p class="font-medium text-yellow-800 dark:text-yellow-200">
        ⚠️ This page is deprecated. {doc.data.deprecatedMessage}
      </p>
    </div>
  )}

  <Content
    components={{
      /* Custom MDX components — rendered at build time */
    }}
  />

  <!-- Author card — static HTML, no JavaScript -->
  <div class="mt-12 flex items-center gap-3 rounded-lg border p-4">
    <img src={author.data.avatar} alt={author.data.name} class="h-10 w-10 rounded-full" />
    <div>
      <p class="font-medium">{author.data.name}</p>
      <p class="text-sm text-gray-500">{author.data.title}</p>
    </div>
  </div>
</DocsLayout>
```

## Step 5 — Deploy with Pagefind and Sitemap

```javascript
// astro.config.mjs — Production configuration.

import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://docs.example.com",
  integrations: [
    react(),           // For SearchButton and ApiPlayground islands
    tailwind(),
    mdx(),
    sitemap({
      filter: (page) => !page.includes("/draft/"),
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
    },
  },
  vite: {
    build: {
      // Inline small assets to reduce HTTP requests
      assetsInlineLimit: 4096,
    },
  },
});
```

```json
// package.json — Build scripts with Pagefind search index generation.
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && npx pagefind --site dist",
    "preview": "astro preview"
  }
}
```

Pagefind runs after the Astro build and indexes every HTML page in `dist/`. It generates a ~20KB search index that loads on demand when the user opens the search modal. No Algolia subscription, no server-side search API.

## Results

Ravi migrated the docs site over one weekend. The content (120+ Markdown files) transferred directly — only the page templates and components needed rewriting:

- **Lighthouse scores: 60 → 100** across Performance, Accessibility, Best Practices, and SEO. Every page is static HTML with no layout shift, no render-blocking JavaScript, no web font flash.
- **Page weight: 380KB JavaScript → 0KB** for documentation pages. The only JavaScript on the site is the search modal (~20KB, loaded on demand) and the API playground (~8KB, loaded when scrolled into view).
- **First Contentful Paint: 2.1s → 0.4s** — static HTML renders immediately. No JavaScript needs to execute before the user sees content.
- **Build time: 45 seconds** for 120 pages with syntax highlighting, sitemap generation, and Pagefind indexing. Incremental builds during development are instant.
- **SEO improvement**: organic search traffic increased 40% in the first month — faster pages rank higher, and the sitemap integration got new pages indexed within days.
- **Content errors caught at build time**: three docs had invalid frontmatter (wrong category names, missing descriptions) that had been silently broken for months. Zod schemas caught them on the first build.
