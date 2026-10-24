---
name: tinacms
description: >-
  TinaCMS is an open-source headless CMS that keeps content as Markdown, MDX or JSON
  files in your Git repository and gives editors a visual editing interface. Use when
  you need to set up TinaCMS in a Next.js site, define collections and fields in
  tina/config.ts, query content with the generated GraphQL client, or add live
  visual editing for a blog or marketing pages.
license: Apache-2.0
compatibility: "Node.js 22 or 24 (tinacms CLI 4.x); React project, Next.js examples"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  repository: https://github.com/tinacms/tinacms
  tags: ["cms", "headless-cms", "git-backed", "markdown", "visual-editing"]
---

# TinaCMS

## Overview

TinaCMS stores content as files in your repo (Markdown, MDX, JSON) and describes it with a schema in `tina/config.ts`. The CLI turns the schema into a GraphQL API, a typed client in `tina/__generated__/` and an admin UI served from your site at `/admin`. Editing happens either against local files (`tinacms dev`) or through Tina Cloud / a self-hosted backend, where saves are written back to Git.

Versions checked on 2026-10-24: `tinacms` 3.15.0, `@tinacms/cli` 4.0.3 (Node `22.x || 24.x`).

## Instructions

### Install and run

```bash
npx @tinacms/cli@latest init          # adds tinacms, tina/config.ts and scripts to an existing project
npx tinacms dev -c "next dev"          # local admin at http://localhost:3000/admin, local GraphQL on :4001
npx tinacms build && next build        # production build, needs Tina Cloud or self-hosted credentials
npx tinacms build --local --skip-cloud-checks   # offline build with no credentials (CI smoke test)
```

Commit `tina/config.ts` and `tina/tina-lock.json`; the build generates the lock file. `tina/__generated__/client.ts` embeds the `token` from your config, so use the client only in server code.

### Schema

This config was built with `tinacms build --local` and compiles as written:

```typescript
// tina/config.ts
import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH || "main",
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID!,
  token: process.env.TINA_TOKEN!,

  build: { outputFolder: "admin", publicFolder: "public" },   // admin UI at /admin
  media: { tina: { mediaRoot: "uploads", publicFolder: "public" } },

  schema: {
    collections: [
      {
        name: "post",
        label: "Blog Posts",
        path: "content/posts",
        format: "mdx",                              // mdx | md | json
        fields: [
          { type: "string", name: "title", label: "Title", isTitle: true, required: true },
          { type: "string", name: "description", label: "Description", ui: { component: "textarea" } },
          { type: "datetime", name: "publishedAt", label: "Published Date", required: true },
          { type: "image", name: "heroImage", label: "Hero Image" },
          { type: "string", name: "category", label: "Category",
            options: ["engineering", "product", "culture", "tutorial"] },
          {
            type: "rich-text",
            name: "body",
            label: "Content",
            isBody: true,                           // the MDX body
            templates: [                            // MDX components editors can insert
              {
                name: "Callout",
                label: "Callout Box",
                fields: [
                  { type: "string", name: "type", label: "Type", options: ["info", "warning", "tip", "danger"] },
                  { type: "rich-text", name: "children", label: "Content" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "page",
        label: "Pages",
        path: "content/pages",
        format: "mdx",
        fields: [
          { type: "string", name: "title", label: "Title", isTitle: true, required: true },
          {
            type: "object",
            name: "blocks",
            label: "Page Blocks",
            list: true,                             // repeatable blocks
            templates: [
              {
                name: "hero",
                label: "Hero Section",
                fields: [
                  { type: "string", name: "heading", label: "Heading" },
                  { type: "string", name: "ctaText", label: "CTA Button Text" },
                  { type: "string", name: "ctaLink", label: "CTA Link" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});
```

### Querying content

The generated client exposes `queries.<collection>` and `queries.<collection>Connection`. `postConnection` accepts `first`, `last`, `before`, `after`, `sort` (a field name) and `filter` (checked in the generated GraphQL schema).

```typescript
import { client } from "@/tina/__generated__/client";

const { data } = await client.queries.postConnection({ sort: "publishedAt", last: 10 });
const posts = data.postConnection.edges?.map((e) => e?.node) ?? [];

const tutorials = await client.queries.postConnection({ filter: { category: { eq: "tutorial" } } });
const post = (await client.queries.post({ relativePath: "hello.mdx" })).data.post;
```

### Visual editing in the Next.js App Router

`useTina` is a hook, so it must live in a client component. Fetch on the server, pass the result down. Since Next.js 15, `params` is a promise.

```tsx
// app/posts/[slug]/page.tsx  (server component)
import { client } from "@/tina/__generated__/client";
import PostView from "./post-view";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await client.queries.post({ relativePath: `${slug}.mdx` });
  return <PostView {...result} />;
}

export async function generateStaticParams() {
  const res = await client.queries.postConnection();
  return res.data.postConnection.edges?.map((e) => ({ slug: e!.node!._sys.filename })) ?? [];
}
```

```tsx
// app/posts/[slug]/post-view.tsx
"use client";
import { useTina, tinaField } from "tinacms/dist/react";
import { TinaMarkdown } from "tinacms/dist/rich-text";

const components = {
  Callout: (props: { type: string; children: any }) => (
    <aside className={`callout callout-${props.type}`}><TinaMarkdown content={props.children} /></aside>
  ),
};

export default function PostView(props: { data: any; query: string; variables: object }) {
  const { data } = useTina(props);              // live-updates while editing in /admin
  const post = data.post;
  return (
    <article>
      <h1 data-tina-field={tinaField(post, "title")}>{post.title}</h1>
      <div data-tina-field={tinaField(post, "body")}>
        <TinaMarkdown content={post.body} components={components} />
      </div>
    </article>
  );
}
```

## Examples

### Example 1: Add a blog to an existing Next.js site

**User request:** "Add a blog to my Next.js site where my editor can write posts in a browser."

**Actions:** run `npx @tinacms/cli@latest init`, put the `post` collection above in `tina/config.ts`, create `content/posts/hello.mdx` with `title`, `publishedAt` and `category: tutorial` in frontmatter, run `npx tinacms dev -c "next dev"`.

**Result:** the admin opens at `http://localhost:3000/admin`, lists "Blog Posts", and saving an edit rewrites `content/posts/hello.mdx` on disk.

### Example 2: Show only tutorials on the homepage

**User request:** "List the five newest tutorial posts on the homepage."

**Actions:** call `client.queries.postConnection({ filter: { category: { eq: "tutorial" } }, sort: "publishedAt", last: 5 })` in a server component and map `edges`.

**Result:** an array of five `node` objects with `title`, `description` and `_sys.filename` for the links.

## Guidelines

- A build without `--local` needs a Tina Cloud client ID and token (or a self-hosted backend); put them in environment variables (`NEXT_PUBLIC_TINA_CLIENT_ID`, `TINA_TOKEN`), never in the repo.
- Changing the schema changes the generated types: rerun `tinacms dev` or `tinacms build` and commit `tina-lock.json`.
- `useTina` and `tinaField` run only in client components; keep data fetching in server components.
- Use the generated client rather than hand-written GraphQL: it is typed from your schema.
- Prefer `format: "mdx"` when editors need components; use `md` or `json` when they do not.
- Node versions outside 22 and 24 are not supported by the current CLI.
- Tina is a good fit for content that developers also keep in Git; for content that non-technical teams edit through workflows, approvals and many locales, compare a database-backed CMS.
