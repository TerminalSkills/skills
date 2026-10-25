---
name: docusaurus
description: >-
  Build documentation websites with Docusaurus. Use when a user asks to create
  a documentation site, build a developer portal, set up API docs, create a
  knowledge base, add versioned documentation, build a static docs site with
  search, create a blog alongside docs, or migrate from GitBook or ReadTheDocs.
  Covers project setup, docs structure, versioning, custom pages, blog,
  Algolia search, MDX components, and deployment.
license: Apache-2.0
compatibility: 'Node.js 20+ for Docusaurus 3.10 (any hosting platform)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "docusaurus, documentation, docs, static-site, mdx"
  repository: https://github.com/facebook/docusaurus
---

# Docusaurus

## Overview

Docusaurus is a static site generator built by Meta specifically for documentation websites. It provides document versioning, sidebar navigation, full-text search (via Algolia), MDX support (React components in Markdown), i18n, and a blog — all out of the box. Used by React, Babel, Jest, Prettier, and hundreds of open-source projects for their documentation.

## Instructions

### Step 1: Project Setup

```bash
# Create new Docusaurus project (3.10.2 on 2026-10-24); without --javascript/--typescript
# the CLI stops to ask which language to use
npx create-docusaurus@latest my-docs classic --javascript

cd my-docs

# Start development server
npm start

# Build for production (output in build/)
npm run build

# Project structure:
# docs/          — documentation pages (Markdown/MDX)
# blog/          — blog posts
# src/pages/     — custom React pages
# src/css/       — custom styles
# static/        — static assets (images, files)
# docusaurus.config.js — main configuration (the 3.x template uses ESM `export default`;
#   the CommonJS `module.exports` form below also builds)
# sidebars.js    — sidebar navigation structure
```

### Step 2: Write Documentation

```markdown
---
id: getting-started
title: Getting Started
sidebar_position: 1
description: Quick start guide for installing and configuring the SDK
tags: [quickstart, installation]
---

# Getting Started

Install the SDK via npm:

```bash
npm install @mycompany/sdk
```

## Configuration

Create a config file in your project root:

```javascript
// sdk.config.js — SDK configuration
export default {
  apiKey: process.env.SDK_API_KEY,
  region: 'us-east-1',
}
```

:::tip
You can also set configuration via environment variables.
:::

:::warning
Never commit your API key to version control.
:::

:::info
For a complete list of options, see the [Configuration Reference](./configuration).
:::
```

### Step 3: Configure Sidebar Navigation

```javascript
// sidebars.js — Define the documentation sidebar structure
/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: ['getting-started', 'installation', 'configuration'],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/authentication',
        'guides/data-fetching',
        'guides/error-handling',
        'guides/deployment',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/client', 'api/hooks', 'api/utilities'],
    },
  ],
}

module.exports = sidebars
```

### Step 4: Site Configuration

```javascript
// docusaurus.config.js — Main site configuration
/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'My SDK Documentation',
  tagline: 'Build amazing things with our SDK',
  url: 'https://docs.mycompany.com',
  baseUrl: '/',
  organizationName: 'mycompany', projectName: 'docs', // required by `npm run deploy` (GitHub Pages)
  onBrokenLinks: 'throw',
  // top-level onBrokenMarkdownLinks is deprecated since 3.9; it moved here:
  markdown: { hooks: { onBrokenMarkdownLinks: 'warn' } },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    ['classic', {
      docs: {
        sidebarPath: './sidebars.js',
        editUrl: 'https://github.com/mycompany/docs/tree/main/',
        showLastUpdateTime: true,    // reads git history: the build fails outside a git repository
        showLastUpdateAuthor: true,  // and CI checkouts need fetch-depth: 0 for correct dates
      },
      blog: {
        showReadingTime: true,
        blogSidebarCount: 10,
      },
      theme: { customCss: './src/css/custom.css' },
    }],
  ],

  themeConfig: {
    navbar: {
      title: 'My SDK',
      logo: { alt: 'Logo', src: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/blog', label: 'Blog', position: 'left' },
        { type: 'docsVersionDropdown', position: 'right' },
        { href: 'https://github.com/mycompany/sdk', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Docs', items: [{ label: 'Getting Started', to: '/docs/getting-started' }] },
        { title: 'Community', items: [{ label: 'Discord', href: 'https://github.com/mycompany/sdk/discussions' }] },
      ],
    },
    algolia: {
      appId: process.env.ALGOLIA_APP_ID,          // from your DocSearch application
      apiKey: process.env.ALGOLIA_SEARCH_API_KEY, // the public search-only key, never the admin key
      indexName: 'mycompany-sdk-docs',
    },
  },
}

module.exports = config
```

### Step 5: Document Versioning

```bash
# Create a new version snapshot (freezes current docs/)
npm run docusaurus docs:version 1.0

# Directory structure after versioning:
# docs/                       — "next" (unreleased) docs
# versioned_docs/version-1.0/ — frozen v1.0 docs
# versioned_sidebars/         — frozen v1.0 sidebars

# Users can switch between versions via the dropdown.
# Once a version exists, the unreleased docs/ folder is served under /docs/next
```

### Step 6: MDX Components

```mdx
---
title: Interactive Examples
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# Installation

<Tabs>
  <TabItem value="npm" label="npm" default>
    ```bash
    npm install @mycompany/sdk
    ```
  </TabItem>
  <TabItem value="yarn" label="yarn">
    ```bash
    yarn add @mycompany/sdk
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm add @mycompany/sdk
    ```
  </TabItem>
</Tabs>

## Custom Components

export const Highlight = ({children, color}) => (
  <span style={{ backgroundColor: color, padding: '4px 8px', borderRadius: '4px', color: '#fff' }}>
    {children}
  </span>
)

Status: <Highlight color="#25c2a0">Stable</Highlight> <Highlight color="#1877F2">v2.0+</Highlight>
```

### Step 7: Deploy

```bash
# Build static site
npm run build
# Output in build/ — deploy anywhere (Vercel, Netlify, GitHub Pages, S3)

# GitHub Pages deployment
GIT_USER=mycompany npm run deploy
```

## Examples

### Example 1: Create documentation for an open-source library
**User prompt:** "Set up a documentation site for my npm package. I need a getting started guide, API reference, versioned docs, and a blog for release notes."

The agent will:
1. Scaffold a Docusaurus project with the classic preset.
2. Create the docs structure: intro, getting-started, guides/, api/.
3. Set up sidebars with logical grouping.
4. Add versioning for v1.0.
5. Configure Algolia DocSearch for full-text search.
6. Add GitHub Pages deployment to CI.

### Example 2: Build an internal developer portal
**User prompt:** "We have 5 microservices. Build a single docs site that documents all of them with separate sections, shared architecture diagrams, and an internal blog."

The agent will:
1. Create a multi-instance docs setup (one docs folder per service).
2. Add a shared architecture section with Mermaid diagrams (`@docusaurus/theme-mermaid`, `themes: ['@docusaurus/theme-mermaid']`, `markdown: { mermaid: true }`).
3. Configure internal blog for architecture decisions and RFCs.
4. Deploy behind VPN/auth for internal access only.

## Guidelines

- Use the `classic` preset for most documentation sites — it includes docs, blog, pages, and search out of the box.
- Structure docs in a flat hierarchy when possible — deeply nested sidebars are hard to navigate. 2-3 levels max.
- Enable `showLastUpdateTime` and `showLastUpdateAuthor` (needs a git repo with full history, see Step 4) — it builds trust with readers and helps identify stale docs.
- Run `npm run build` (not only `npm start`) before merging; it is what finds broken links and MDX errors. Set `onBrokenLinks: 'throw'` to catch broken internal links during build. This prevents deploying docs with dead links.
- Use MDX sparingly — most docs should be plain Markdown for contributor accessibility. Save MDX for interactive examples and complex layouts.
- Apply for Algolia DocSearch (free for open-source) for production search. For internal docs, use the local search plugin.
- Two files that map to the same doc id (for example `intro.md` and `intro.mdx`) fail the build; keep one.
- Keep the Algolia search-only key in an environment variable or CI secret; the admin key must never be in the repository.
