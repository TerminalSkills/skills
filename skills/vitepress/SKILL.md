---
name: vitepress
description: >-
  Builds documentation sites with VitePress, the Vite-powered static site generator. Use when a user asks to create docs, configure VitePress themes, add custom pages, deploy to GitHub Pages, or extend with Vue components.
license: Apache-2.0
compatibility: "VitePress 1.6 (stable): Node.js 18+. VitePress 2.0 alpha (vitepress@next): Node.js 22+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["documentation", "static-site", "vite", "vue", "markdown"]
  repository: https://github.com/vuejs/vitepress
---
# VitePress — Vite-Powered Documentation Site

## Overview

VitePress is a static site generator built on Vite and Vue: it turns a folder of Markdown files into a documentation site with a default theme (navigation, sidebar, outline, dark mode), built-in full-text search, i18n and Vue components inside Markdown. The stable release is 1.6.4 and is what `npm add -D vitepress` installs. The documentation at vitepress.dev already describes 2.0, which is still an alpha (`vitepress@next`, Vite 8, Node.js 22+); everything below works on 1.6.

## Instructions

### Setup

```bash
npm add -D vitepress
npx vitepress init        # interactive wizard: docs folder, title, description, theme, TypeScript, npm scripts

# Typical structure with ./docs as the site root:
# docs/
#   .vitepress/
#     config.mts       # Site configuration (.ts, .js and .mjs work too)
#     theme/           # Optional theme customization
#   index.md           # Homepage
#   guide/
#     getting-started.md
#   public/            # Static files copied as-is (logo.svg, favicon.ico)

npx vitepress dev docs       # dev server on http://localhost:5173
npx vitepress build docs     # static site in docs/.vitepress/dist
npx vitepress preview docs   # serve the build on http://localhost:4173
```

The wizard cannot be answered from flags; in a non-interactive session create `docs/.vitepress/config.mts` and `docs/index.md` by hand and add the scripts with `npm pkg set scripts.docs:dev="vitepress dev docs" scripts.docs:build="vitepress build docs" scripts.docs:preview="vitepress preview docs"`. VitePress is ESM-only: name the config `config.mts`/`config.mjs`, or set `"type": "module"` in `package.json`. Add `docs/.vitepress/dist` and `docs/.vitepress/cache` to `.gitignore`.

### Configuration

```typescript
// docs/.vitepress/config.mts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Ledgerline SDK",
  description: "Documentation for the Ledgerline payments SDK",
  cleanUrls: true,                    // /guide/installation instead of /guide/installation.html
  lastUpdated: true,                  // from Git history; CI must fetch it (fetch-depth: 0)
  sitemap: { hostname: "https://docs.ledgerline.dev" },
  themeConfig: {
    logo: "/logo.svg",                // file in docs/public/
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/reference" },
      { text: "Changelog", link: "/changelog" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          collapsed: false,           // collapsible group, open by default
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Authentication", link: "/guide/authentication" },
          ],
        },
      ],
      "/api/": [{ text: "API", items: [{ text: "Reference", link: "/api/reference" }] }],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/ledgerline/ledgerline-sdk" },
    ],
    search: { provider: "local" },      // Built-in full-text search
    editLink: {
      pattern: "https://github.com/ledgerline/ledgerline-sdk/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {                         // shown only on pages without a sidebar
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Ledgerline",
    },
  },
});
```

Links in `nav` and `sidebar` are not validated — a typo there builds fine and ends in a 404. Links inside Markdown pages are: a broken one stops the build with `[vitepress] 1 dead link(s) found.`

### Markdown Features

````markdown
# Page Title

## Code Groups

::: code-group
```ts [TypeScript]
const client = new Ledgerline({ apiKey: process.env.LEDGERLINE_API_KEY });
const charges = await client.charges.list({ limit: 20 });
```

```python [Python]
client = Ledgerline(api_key=os.environ["LEDGERLINE_API_KEY"])
charges = client.charges.list(limit=20)
```
:::

## Custom Containers

::: tip
Use test-mode keys while developing.
:::

::: danger Irreversible
Refunds cannot be undone. The text after the type (tip, info, warning, danger) replaces the default title.
:::

::: details Click to expand
Hidden content that users can reveal.
:::

## Frontmatter

```yaml
---
title: Custom Title
description: SEO description for this page
outline: [2, 3]          # h2 and h3 in the "On this page" outline
next:
  text: Installation
  link: /guide/installation
---
```
````

Frontmatter is the YAML between `---` lines at the very top of the `.md` file (above it is fenced only so the sample page can display it). The homepage uses the `home` layout, configured entirely in frontmatter:

```yaml
---
layout: home
hero:
  name: Ledgerline SDK
  text: Payments in ten lines of code
  actions:
    - { theme: brand, text: Get Started, link: /guide/getting-started }
features:
  - { title: Typed errors, details: One error class per failure mode. }
---
```

`layout: page` renders a Markdown file without the documentation styles, for fully custom pages.

### Vue Components in Markdown

```vue
<!-- docs/.vitepress/theme/components/ApiPlayground.vue -->
<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{ baseUrl: string }>();
const path = ref("/v1/charges");
const response = ref("");
async function send() {
  const res = await fetch(props.baseUrl + path.value);
  response.value = JSON.stringify(await res.json(), null, 2);
}
</script>

<template>
  <div class="api-playground">
    <input v-model="path" aria-label="Request path" />
    <button @click="send">Send</button>
    <pre v-if="response">{{ response }}</pre>
  </div>
</template>
```

Register it once in the theme entry, which is also where the default theme is restyled:

```typescript
// docs/.vitepress/theme/index.ts
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import ApiPlayground from "./components/ApiPlayground.vue";
import "./custom.css";   // e.g. :root { --vp-c-brand-1: #0f766e; --vp-c-brand-2: #0d9488; }

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("ApiPlayground", ApiPlayground);
  },
} satisfies Theme;
```

Any page can then use `<ApiPlayground base-url="https://api.ledgerline.dev" />`. For a component needed on one page only, import it in a `<script setup lang="ts">` block placed right after that page's frontmatter.

### Deploy to GitHub Pages

A project site is served from `https://ledgerline.github.io/ledgerline-sdk/`, so set `base: "/ledgerline-sdk/"` in the config (not needed for a custom domain or a `ledgerline.github.io` repository). In the repository settings choose **Pages → Build and deployment → Source: GitHub Actions**, then add:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0          # needed for lastUpdated
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - uses: actions/configure-pages@v4
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

On Netlify, Vercel or Cloudflare Pages the settings are: build command `npm run docs:build`, output directory `docs/.vitepress/dist`.

## Examples

### Example 1: Start a docs site for an SDK

User: "Add a documentation site to our SDK repo under docs/, with a sidebar and search."

```bash
npm add -D vitepress
mkdir -p docs/.vitepress docs/guide docs/public
# write docs/.vitepress/config.mts (Configuration above), docs/index.md and the pages the sidebar links to
npm pkg set scripts.docs:dev="vitepress dev docs" scripts.docs:build="vitepress build docs" scripts.docs:preview="vitepress preview docs"
npm run docs:build
```

```
  vitepress v1.6.4

✓ building client + server bundles...
✓ rendering pages...
✓ generating sitemap...
build complete in 1.80s.
```

`docs/.vitepress/dist/` now holds `index.html`, one HTML file per Markdown page (`guide/getting-started.html`), `sitemap.xml` and hashed files under `assets/`. `npm run docs:dev` serves the site with hot reload while writing.

### Example 2: Publish the docs under a sub-path

User: "The docs build fine locally but on GitHub Pages the page has no styles and every link is a 404."

The site is served from `/ledgerline-sdk/` while the assets are requested from `/`. Set the base path and check it locally before pushing:

```bash
# docs/.vitepress/config.mts → base: "/ledgerline-sdk/"
npx vitepress build docs
npx vitepress preview docs     # prints: Built site served at http://localhost:4173/ledgerline-sdk/
```

Links written as `/guide/installation` in Markdown and in the config are prefixed automatically (`href="/ledgerline-sdk/guide/installation"`); a static `<img src="/logo.svg">` in a page is prefixed too. Only hand-written anchor tags in raw HTML and dynamically bound paths (`:src`, `:href`) need the prefix, via `withBase()` from `vitepress`.

## Guidelines

1. **Docs alongside code** — Keep docs in the same repo as code; changes to API and docs happen in the same PR
2. **Auto-generate API reference** — Use TypeDoc or similar to generate API pages from JSDoc/TSDoc comments
3. **Code groups for multi-language** — Show examples in all supported languages side by side
4. **Local search** — Enable built-in local search for small-medium sites; use Algolia DocSearch (`provider: "algolia"` with `options: { appId, apiKey, indexName }`) for large sites
5. **Edit links** — Enable "Edit this page" links; community contributions improve docs faster
6. **Frontmatter for SEO** — Set title and description in frontmatter; VitePress generates proper meta tags
7. **Vue components for interactivity** — Use Vue components for interactive examples, API playgrounds, and calculators. Pages are rendered on the server at build time: wrap a component that touches `window` or `document` in `<ClientOnly>`
8. **Deploy to Vercel/Netlify** — VitePress generates static HTML; deploy anywhere with zero server costs. `cleanUrls: true` needs a host that serves `/guide/installation.html` for `/guide/installation` without a redirect (GitHub Pages and Netlify do; Vercel needs `"cleanUrls": true` in `vercel.json`)
9. **Mustaches are Vue code** — `{{ customer.id }}` in prose or in inline code is evaluated as a Vue expression and breaks the page; wrap it in a `span` element carrying the `v-pre` attribute, or put it in a fenced code block
10. **Preview is not a production server** — `vitepress preview` listens on all network interfaces (1.6 has no option to change that: `--host` is ignored, only `--port` works) and exists only for checking a build; `vitepress --help` and `--version` are not implemented and start the dev server instead
11. **Do not minify the HTML at the host** — options such as "Auto Minify" strip comments Vue needs and cause hydration mismatches
