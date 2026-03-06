---
name: vitepress
category: Developer Tools
tags: [documentation, static-site, vite, vue, markdown, docs-as-code]
version: 1.0.0
author: terminal-skills
---

# VitePress — Vite-Powered Documentation Site

You are an expert in VitePress, the Vite-powered static site generator for documentation. You help developers build fast, beautiful documentation sites from Markdown files with Vue component integration, full-text search, i18n, and automatic navigation generation.

## Core Capabilities

### Setup

```bash
npm add -D vitepress
npx vitepress init

# Project structure:
# docs/
#   .vitepress/
#     config.ts        # Site configuration
#     theme/           # Custom theme
#   index.md           # Homepage
#   guide/
#     getting-started.md
#     installation.md
#   api/
#     reference.md

# Development
npx vitepress dev docs
# Build
npx vitepress build docs
```

### Configuration

```typescript
// docs/.vitepress/config.ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "My SDK",
  description: "Documentation for My SDK",
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/reference" },
      { text: "Changelog", link: "/changelog" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Configuration", link: "/guide/configuration" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Authentication", link: "/guide/authentication" },
            { text: "Data Fetching", link: "/guide/data-fetching" },
            { text: "Error Handling", link: "/guide/error-handling" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/org/repo" },
      { icon: "discord", link: "https://discord.gg/xxx" },
    ],
    search: { provider: "local" },      // Built-in full-text search
    editLink: {
      pattern: "https://github.com/org/repo/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
    },
  },
});
```

### Markdown Features

````markdown
# Page Title

## Code Groups

::: code-group
```ts [TypeScript]
const client = new SDK({ apiKey: "xxx" });
const users = await client.users.list();
```

```python [Python]
client = SDK(api_key="xxx")
users = client.users.list()
```

```go [Go]
client := sdk.New("xxx")
users, err := client.Users.List()
```
:::

## Custom Containers

::: tip
This is a helpful tip for users.
:::

::: warning
This feature is experimental and may change.
:::

::: danger
This action cannot be undone. Proceed with caution.
:::

::: details Click to expand
Hidden content that users can reveal.
:::

## Frontmatter

```yaml
---
title: Custom Title
description: SEO description for this page
outline: [2, 3]          # Show h2 and h3 in sidebar outline
prev:
  text: Previous Page
  link: /guide/previous
next:
  text: Next Page
  link: /guide/next
---
```
````

### Vue Components in Markdown

```vue
<!-- docs/.vitepress/theme/components/APIPlayground.vue -->
<template>
  <div class="api-playground">
    <select v-model="method">
      <option>GET</option><option>POST</option><option>PUT</option>
    </select>
    <input v-model="url" placeholder="Enter URL" />
    <button @click="send">Send</button>
    <pre v-if="response">{{ response }}</pre>
  </div>
</template>

<!-- Use in Markdown: -->
<!-- <APIPlayground /> -->
```

## Installation

```bash
npm add -D vitepress
```

## Best Practices

1. **Docs alongside code** — Keep docs in the same repo as code; changes to API and docs happen in the same PR
2. **Auto-generate API reference** — Use TypeDoc or similar to generate API pages from JSDoc/TSDoc comments
3. **Code groups for multi-language** — Show examples in all supported languages side by side
4. **Local search** — Enable built-in local search for small-medium sites; use Algolia DocSearch for large sites
5. **Edit links** — Enable "Edit this page" links; community contributions improve docs faster
6. **Frontmatter for SEO** — Set title and description in frontmatter; VitePress generates proper meta tags
7. **Vue components for interactivity** — Use Vue components for interactive examples, API playgrounds, and calculators
8. **Deploy to Vercel/Netlify** — VitePress generates static HTML; deploy anywhere with zero server costs
