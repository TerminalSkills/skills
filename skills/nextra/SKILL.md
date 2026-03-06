---
name: nextra
description: >-
  Build documentation and content sites with Nextra, the Next.js-based static site generator. Use when a user asks to create docs sites, configure Nextra themes, add MDX content, set up search, or deploy Nextra projects.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["documentation", "next-js", "mdx", "static-site", "docs-as-code"]
---
# Nextra — Next.js Documentation Framework

## Overview

You are an expert in Nextra, the Next.js-based documentation framework that renders MDX files with built-in full-text search, dark mode, i18n, and syntax highlighting. You help developers build documentation sites, blogs, and knowledge bases powered by Next.js with React component support in Markdown.

## Instructions

### Setup

```bash
npx create-next-app my-docs --example https://github.com/shuding/nextra-docs-template
cd my-docs && npm run dev

# Or add to existing Next.js project
npm install nextra nextra-theme-docs
```

### Configuration

```javascript
// next.config.mjs
import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
  defaultShowCopyCode: true,
  search: { codeblocks: true },        // Search inside code blocks too
});

export default withNextra({
  reactStrictMode: true,
});
```

```tsx
// theme.config.tsx
import { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 800 }}>My SDK</span>,
  project: { link: "https://github.com/org/repo" },
  chat: { link: "https://discord.gg/xxx" },
  docsRepositoryBase: "https://github.com/org/repo/tree/main/docs",
  footer: { text: "MIT License © 2026" },
  useNextSeoProps() {
    return { titleTemplate: "%s — My SDK Docs" };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="icon" href="/favicon.ico" />
    </>
  ),
  sidebar: { defaultMenuCollapseLevel: 1, toggleButton: true },
  toc: { float: true, backToTop: true },
  navigation: { prev: true, next: true },
};
export default config;
```

### MDX Pages

```mdx
---
title: Getting Started
description: Quick start guide for My SDK
---

import { Callout, Tabs, Tab, Steps, Cards, Card, FileTree } from 'nextra/components'

# Getting Started

<Callout type="info">
  This guide assumes you have Node.js 18+ installed.
</Callout>

## Installation

<Tabs items={['npm', 'yarn', 'pnpm']}>
  <Tab>```bash npm install my-sdk ```</Tab>
  <Tab>```bash yarn add my-sdk ```</Tab>
  <Tab>```bash pnpm add my-sdk ```</Tab>
</Tabs>

## Quick Start

<Steps>
### Install the SDK
```bash
npm install my-sdk
```

### Initialize the client
```typescript
import { SDK } from "my-sdk";
const client = new SDK({ apiKey: process.env.API_KEY });
```

### Make your first request
```typescript
const users = await client.users.list();
console.log(users);
```
</Steps>

## Project Structure

<FileTree>
  <FileTree.Folder name="src" defaultOpen>
    <FileTree.File name="index.ts" />
    <FileTree.Folder name="lib">
      <FileTree.File name="client.ts" />
      <FileTree.File name="auth.ts" />
    </FileTree.Folder>
  </FileTree.Folder>
  <FileTree.File name="package.json" />
</FileTree>

## Related Resources

<Cards>
  <Card title="API Reference" href="/api" />
  <Card title="Examples" href="/examples" />
  <Card title="Changelog" href="/changelog" />
</Cards>
```

### Auto-Navigation

```markdown
## File-based routing
pages/
  index.mdx           → /
  getting-started.mdx  → /getting-started
  guide/
    _meta.json         → Sidebar order and labels
    installation.mdx   → /guide/installation
    configuration.mdx  → /guide/configuration
  api/
    _meta.json
    reference.mdx      → /api/reference

## _meta.json — Control sidebar order
{
  "installation": "Installation",
  "configuration": "Configuration",
  "authentication": "Authentication",
  "-- Separator": { "type": "separator", "title": "Advanced" },
  "plugins": "Plugins",
  "migration": "Migration Guide"
}
```

## Installation

```bash
npm install nextra nextra-theme-docs
```

## Examples

**Example 1: User asks to set up nextra**

User: "Help me set up nextra for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure nextra
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with nextra**

User: "Create a dashboard using nextra"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **MDX for interactivity** — Use React components in docs (tabs, callouts, interactive examples); MDX makes this seamless
2. **_meta.json for organization** — Control sidebar order and labels with `_meta.json`; don't rely on alphabetical file ordering
3. **Built-in search** — Nextra includes FlexSearch-based full-text search; no Algolia setup needed for small-medium sites
4. **Next.js features** — You get SSR, ISR, API routes, and the full Next.js ecosystem; useful for interactive docs
5. **Code block features** — Enable `defaultShowCopyCode`, filename labels, and line highlighting in code blocks
6. **Dark mode built-in** — Nextra's docs theme includes dark mode toggle; all components adapt automatically
7. **i18n support** — Built-in internationalization; create locale folders (en/, ja/, zh/) with the same structure
8. **Deploy on Vercel** — One-click deployment; automatic preview deployments for every PR with documentation changes
