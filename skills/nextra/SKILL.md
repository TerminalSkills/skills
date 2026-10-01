---
name: nextra
description: >-
  Builds documentation and content sites with Nextra, the Next.js-based static site generator. Use when a user asks to create docs sites, configure Nextra themes, add MDX content, set up search, or deploy Nextra projects.
license: Apache-2.0
compatibility: "Nextra 4.x: Next.js 14+ (App Router only), React 18+, Node.js 18+ (Next.js 16 needs Node.js 20.9+)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["documentation", "next-js", "mdx", "static-site", "docs-as-code"]
  repository: https://github.com/shuding/nextra
---
# Nextra — Next.js Documentation Framework

## Overview

Nextra is a content framework on top of Next.js: it renders Markdown and MDX files as a documentation site or blog with a generated sidebar, table of contents, syntax highlighting, dark mode, i18n, and static full-text search. Nextra 4 (current: 4.6.1) works only with the App Router. The `pages/` directory, `theme.config.tsx`, `_meta.json` and the FlexSearch index of Nextra 2–3 no longer exist — tutorials and templates written for those versions do not apply.

## Instructions

### Setup

There is no working one-command starter for v4 (the old `nextra-docs-template` repository still targets Next.js 13), so install by hand:

```bash
mkdir ledgerline-docs && cd ledgerline-docs
npm init -y
# ESM package, and a zod version the docs theme works with (see Guidelines)
npm pkg set type=module overrides.zod=4.3.6
npm install next react react-dom nextra nextra-theme-docs
npm install -D pagefind
npm pkg set scripts.dev="next" scripts.build="next build" scripts.start="next start" \
  scripts.postbuild="pagefind --site .next/server/app --output-path public/_pagefind"
```

In an existing Next.js App Router project, only `nextra`, `nextra-theme-docs` and `pagefind` are new. Add `_pagefind/` to `.gitignore`: the search index is generated after every build.

### Configuration

Four files replace the old `theme.config.tsx`:

```javascript
// next.config.mjs
import nextra from "nextra";

const withNextra = nextra({
  defaultShowCopyCode: true,          // Copy button on every code block
  search: { codeblocks: false },      // Keep code blocks out of the search index
});

export default withNextra({
  reactStrictMode: true,
});
```

```javascript
// mdx-components.js — required; exposes the theme's components to MDX
import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";

export function useMDXComponents(components) {
  return { ...getThemeComponents(), ...components };
}
```

```jsx
// app/layout.jsx — theme options are props of Layout, Navbar and Footer
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: { default: "Ledgerline SDK", template: "%s — Ledgerline SDK Docs" },
};

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={<Navbar logo={<b>Ledgerline SDK</b>} projectLink="https://github.com/ledgerline/sdk" />}
          footer={<Footer>MIT {new Date().getFullYear()} © Ledgerline</Footer>}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/ledgerline/sdk/tree/main/docs"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
```

```jsx
// app/[[...mdxPath]]/page.jsx — one catch-all route that serves everything in content/
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

export async function generateMetadata(props) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
}

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props) {
  const params = await props.params;
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
```

Other `Layout` props: `banner`, `editLink`, `feedback`, `toc`, `navigation`, `darkMode`, `i18n`, `nextThemes`. `Navbar` also takes `chatLink` and `logoLink`.

### MDX Pages

````mdx
---
title: Getting Started
description: Install the Ledgerline SDK and create your first invoice
---

import { Callout, Cards, FileTree, Steps, Tabs } from 'nextra/components'

# Getting Started

<Callout type="info">
  This guide assumes Node.js 20 or newer.
</Callout>

> [!WARNING]
>
> Test-mode keys start with `ll_test_`. Never ship them to the browser.

<Tabs items={['npm', 'pnpm']}>
  <Tabs.Tab>
    ```bash
    npm install @ledgerline/sdk
    ```
  </Tabs.Tab>
  <Tabs.Tab>
    ```bash
    pnpm add @ledgerline/sdk
    ```
  </Tabs.Tab>
</Tabs>

<Steps>
### Create the client

```ts filename="src/ledgerline.ts" {3}
import { Ledgerline } from "@ledgerline/sdk";

export const ledgerline = new Ledgerline({ apiKey: process.env.LEDGERLINE_API_KEY });
```

### Create an invoice

```ts
const invoice = await ledgerline.invoices.create({ customer: "cus_8Qw2", amount: 4900 });
```
</Steps>

<FileTree>
  <FileTree.Folder name="src" defaultOpen>
    <FileTree.File name="ledgerline.ts" />
  </FileTree.Folder>
  <FileTree.File name="package.json" />
</FileTree>

<Cards>
  <Cards.Card title="Webhooks" href="/guide/webhooks" />
  <Cards.Card title="Changelog" href="https://github.com/ledgerline/sdk/releases" />
</Cards>
````

Front matter becomes the page's Next.js metadata, so `title` fills the `%s` in the layout's title template. `Callout` accepts `default`, `info`, `warning`, `error` and `important`; GitHub alert syntax (`> [!NOTE]`, `> [!WARNING]`) renders the same boxes.

### Auto-Navigation

```text
content/
  _meta.js               Sidebar order and labels for this folder
  index.mdx              → /
  getting-started.mdx    → /getting-started
  about.mdx              → /about
  legal.mdx              → /legal
  guide/
    _meta.js
    webhooks.mdx         → /guide/webhooks
```

```javascript
// content/_meta.js — keys are file or folder names; unlisted pages are appended alphabetically.
// A key with no matching page (other than separators and href links) fails the build.
export default {
  index: "Introduction",
  "getting-started": "Getting Started",
  "---": { type: "separator", title: "Guides" },
  guide: "Guide",
  changelog: { title: "Changelog", href: "https://github.com/ledgerline/sdk/releases" },
  legal: { display: "hidden" },                    // reachable by URL, not listed
  about: { title: "About", type: "page" },         // shown in the top navigation instead of the sidebar
};
```

To serve the content under a prefix, set `contentDirBasePath: "/docs"` in `nextra()` move the catch-all route to `app/docs/[[...mdxPath]]/page.jsx` and change its import to `../../../mdx-components`. Pages can also live directly in `app/` as `page.mdx` files, mixed with ordinary React routes.

## Examples

**Example 1: A new docs site**

User: "Set up a Nextra docs site for our SDK with search."

Run the Setup commands, create the four Configuration files and the `content/` tree from Auto-Navigation, then build:

```bash
npm run build
```

```text
Route (app)
┌ ○ /_not-found
└   /[[...mdxPath]]
  ├ ● /about
  ├ ● /getting-started
  ├ ● /guide/webhooks
  └ ● [+2 more paths]

> ledgerline-docs@1.0.0 postbuild
> pagefind --site .next/server/app --output-path public/_pagefind

Running Pagefind v1.5.2 (Extended)
  Indexed 1 language
  Indexed 5 pages
```

`npm run start` serves the site; the search box in the top navigation queries the index in `public/_pagefind`. Under `npm run dev` search stays unavailable until a build has produced that index.

**Example 2: Static export for GitHub Pages or nginx**

User: "We host the docs as plain files — no Node server."

```javascript
// next.config.mjs
import nextra from "nextra";

const withNextra = nextra({ defaultShowCopyCode: true });

export default withNextra({
  output: "export",
  images: { unoptimized: true },   // required for a static export
});
```

```bash
npm pkg set scripts.postbuild="pagefind --site .next/server/app --output-path out/_pagefind"
npm run build
```

The site lands in `out/` (`index.html`, `getting-started.html`, `guide/`, `404.html`, `_pagefind/`). Pages are `.html` files, so the host has to map `/getting-started` to `getting-started.html`: nginx needs `try_files $uri $uri.html $uri/ =404;` in its `location /` block, and GitHub Pages published from a branch needs an empty `out/.nojekyll` file, otherwise Jekyll drops `_next/` and `_pagefind/`.

## Guidelines

1. **Pin zod until the theme is fixed** — `nextra-theme-docs` 4.6.1 with zod 4.4 or newer fails on every page with `Invalid input: expected nonoptional, received undefined → at children` (issue #5008, open as of October 2026). The `overrides.zod=4.3.6` entry in Setup avoids it; remove the override once a release fixes the issue.
2. **ESM package** — `npm init -y` writes `"type": "commonjs"`, and Next.js 16 then rejects `mdx-components.js` and the MDX files with a module-format error. Set `"type": "module"`.
3. **Turbopack and MDX plugins** — Next.js 16 builds with Turbopack, which only accepts serializable Nextra options. Function plugins in `mdxOptions.remarkPlugins` / `rehypePlugins` stop the build with "does not have serializable options"; build with `next build --webpack` when you need them.
4. **_meta.js for organization** — Control sidebar order and labels with `_meta.js` (or `_meta.ts`); `_meta.json` is no longer read
5. **Search needs the postbuild step** — Pagefind indexes the built HTML; no index means an empty search. For a static export the output path is `out/_pagefind`.
6. **Coming from Nextra 3** — rename `pages/` to `content/`, move `theme.config` values into `Layout`/`Navbar`/`Footer` props, replace `useNextSeoProps` with the Next.js `metadata` export, add `mdx-components.js`, import `nextra-theme-docs/style.css`, and write `Tabs.Tab`/`Cards.Card` (`nextra/components` exports no standalone `Tab` or `Card`).
7. **Code block features** — Enable `defaultShowCopyCode`, filename labels, and line highlighting in code blocks
8. **Dark mode built-in** — Nextra's docs theme includes dark mode toggle; all components adapt automatically
9. **i18n support** — Docs theme only: list `locales` under `i18n` in `next.config.mjs`, keep one folder per locale in `content/` (`content/en`, `content/ja`), put the layout under `app/[lang]/`, and pass `i18n` to `Layout` for the language menu. Automatic language redirects do not work with a static export.
10. **When not to use it** — Nextra ties the site to Next.js and React. For docs with no interactive components and no existing Next.js app, a plain static generator has fewer moving parts.
