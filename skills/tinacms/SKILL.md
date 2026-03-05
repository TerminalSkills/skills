---
name: tinacms
description: Expert guidance for TinaCMS, the open-source headless CMS that stores content in Git (Markdown/MDX/JSON) and provides visual editing capabilities. Helps developers set up TinaCMS with Next.js, define content schemas, and build visual editing experiences where editors can see changes in real time.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
  - cms
  - headless-cms
  - git-backed
  - markdown
  - visual-editing
---

# TinaCMS — Git-Backed Visual CMS


## Overview


TinaCMS, the open-source headless CMS that stores content in Git (Markdown/MDX/JSON) and provides visual editing capabilities. Helps developers set up TinaCMS with Next.js, define content schemas, and build visual editing experiences where editors can see changes in real time.


## Instructions

### Schema Definition

Define your content structure in a type-safe schema:

```typescript
// tina/config.ts — TinaCMS configuration with content schemas
import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH || "main",
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID!,
  token: process.env.TINA_TOKEN!,

  build: {
    outputFolder: "admin",        // Admin UI served at /admin
    publicFolder: "public",
  },

  media: {
    tina: {
      mediaRoot: "uploads",       // Store uploaded images in /public/uploads
      publicFolder: "public",
    },
  },

  schema: {
    collections: [
      {
        name: "post",
        label: "Blog Posts",
        path: "content/posts",            // Store as Markdown files in this directory
        format: "mdx",                     // mdx | md | json
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,                 // Used as the display name in the CMS
            required: true,
          },
          {
            type: "string",
            name: "description",
            label: "Description",
            ui: {
              component: "textarea",       // Multi-line text input
            },
          },
          {
            type: "datetime",
            name: "publishedAt",
            label: "Published Date",
            required: true,
          },
          {
            type: "image",
            name: "heroImage",
            label: "Hero Image",
          },
          {
            type: "string",
            name: "category",
            label: "Category",
            options: ["engineering", "product", "culture", "tutorial"],
          },
          {
            type: "object",
            name: "author",
            label: "Author",
            fields: [
              { type: "string", name: "name", label: "Name", required: true },
              { type: "image", name: "avatar", label: "Avatar" },
              { type: "string", name: "role", label: "Role" },
            ],
          },
          {
            type: "rich-text",
            name: "body",
            label: "Content",
            isBody: true,                  // Maps to the MDX body content
            templates: [
              // Custom MDX components available in the visual editor
              {
                name: "Callout",
                label: "Callout Box",
                fields: [
                  {
                    type: "string",
                    name: "type",
                    label: "Type",
                    options: ["info", "warning", "tip", "danger"],
                  },
                  {
                    type: "rich-text",
                    name: "children",
                    label: "Content",
                  },
                ],
              },
              {
                name: "CodeBlock",
                label: "Code Block",
                fields: [
                  { type: "string", name: "language", label: "Language" },
                  { type: "string", name: "code", label: "Code", ui: { component: "textarea" } },
                ],
              },
            ],
          },
        ],
      },

      // Page collection — for marketing pages, landing pages
      {
        name: "page",
        label: "Pages",
        path: "content/pages",
        format: "mdx",
        fields: [
          { type: "string", name: "title", label: "Title", isTitle: true, required: true },
          {
            type: "object",
            name: "seo",
            label: "SEO",
            fields: [
              { type: "string", name: "metaTitle", label: "Meta Title" },
              { type: "string", name: "metaDescription", label: "Meta Description" },
              { type: "image", name: "ogImage", label: "OG Image" },
            ],
          },
          {
            type: "object",
            name: "blocks",
            label: "Page Blocks",
            list: true,                   // Repeatable blocks — visual page builder
            templates: [
              {
                name: "hero",
                label: "Hero Section",
                fields: [
                  { type: "string", name: "heading", label: "Heading" },
                  { type: "string", name: "subheading", label: "Subheading" },
                  { type: "image", name: "backgroundImage", label: "Background" },
                  { type: "string", name: "ctaText", label: "CTA Button Text" },
                  { type: "string", name: "ctaLink", label: "CTA Link" },
                ],
              },
              {
                name: "features",
                label: "Features Grid",
                fields: [
                  { type: "string", name: "heading", label: "Section Heading" },
                  {
                    type: "object",
                    name: "items",
                    label: "Feature Items",
                    list: true,
                    fields: [
                      { type: "string", name: "title", label: "Title" },
                      { type: "string", name: "description", label: "Description" },
                      { type: "image", name: "icon", label: "Icon" },
                    ],
                  },
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

### Visual Editing in Next.js

Render content with live visual editing:

```tsx
// app/posts/[slug]/page.tsx — Blog post page with visual editing
import { client } from "@/tina/__generated__/client";
import { useTina } from "tinacms/dist/react";
import { TinaMarkdown } from "tinacms/dist/rich-text";

// Components for custom MDX blocks
const components = {
  Callout: ({ type, children }: any) => (
    <div className={`callout callout-${type}`}>
      {type === "tip" && "💡"}
      {type === "warning" && "⚠️"}
      {type === "danger" && "🚨"}
      {type === "info" && "ℹ️"}
      <TinaMarkdown content={children} />
    </div>
  ),
  CodeBlock: ({ language, code }: any) => (
    <pre><code className={`language-${language}`}>{code}</code></pre>
  ),
};

// Server component: fetch data at build/request time
export default async function PostPage({ params }: { params: { slug: string } }) {
  const { data, query, variables } = await client.queries.post({
    relativePath: `${params.slug}.mdx`,
  });

  return <PostClient data={data} query={query} variables={variables} />;
}

// Client component: enables visual editing when in Tina admin
function PostClient({ data, query, variables }: any) {
  // useTina enables real-time editing — changes appear instantly
  const { data: tinaData } = useTina({ query, variables, data });
  const post = tinaData.post;

  return (
    <article>
      {post.heroImage && <img src={post.heroImage} alt={post.title} />}
      <h1>{post.title}</h1>
      <p>{post.description}</p>
      <div className="author">
        {post.author?.avatar && <img src={post.author.avatar} alt="" />}
        <span>{post.author?.name}</span>
        <time>{new Date(post.publishedAt).toLocaleDateString()}</time>
      </div>
      {/* TinaMarkdown renders rich-text with custom components */}
      <TinaMarkdown content={post.body} components={components} />
    </article>
  );
}

// Generate static paths for all posts
export async function generateStaticParams() {
  const posts = await client.queries.postConnection();
  return posts.data.postConnection.edges?.map((edge) => ({
    slug: edge?.node?._sys.filename,
  })) ?? [];
}
```

### Querying Content

Use the auto-generated GraphQL client:

```typescript
// src/lib/content.ts — Query content using Tina's generated client
import { client } from "@/tina/__generated__/client";

// Get all blog posts (sorted by date)
async function getAllPosts() {
  const response = await client.queries.postConnection({
    sort: "publishedAt",
    last: 100,              // Get latest 100 posts
  });

  return response.data.postConnection.edges?.map((edge) => ({
    slug: edge?.node?._sys.filename,
    title: edge?.node?.title,
    description: edge?.node?.description,
    publishedAt: edge?.node?.publishedAt,
    category: edge?.node?.category,
    author: edge?.node?.author,
  })) ?? [];
}

// Get posts filtered by category
async function getPostsByCategory(category: string) {
  const response = await client.queries.postConnection({
    filter: {
      category: { eq: category },
    },
  });
  return response.data.postConnection.edges?.map((e) => e?.node) ?? [];
}

// Get a single post by filename
async function getPost(slug: string) {
  const response = await client.queries.post({
    relativePath: `${slug}.mdx`,
  });
  return response.data.post;
}
```

## Installation

```bash
# Add to an existing Next.js project
npx @tinacms/cli@latest init

# This creates:
# - tina/config.ts (schema configuration)
# - tina/__generated__/ (auto-generated client and types)

# Run development server with visual editing
npx tinacms dev -c "next dev"

# Build for production
npx tinacms build && next build
```


## Examples


### Example 1: Setting up Tinacms with a custom configuration

**User request:**

```
I just installed Tinacms. Help me configure it for my TypeScript + React workflow with my preferred keybindings.
```

The agent creates the configuration file with TypeScript-aware settings, configures relevant plugins/extensions for React development, sets up keyboard shortcuts matching the user's preferences, and verifies the setup works correctly.

### Example 2: Extending Tinacms with custom functionality

**User request:**

```
I want to add a custom visual editing in next.js to Tinacms. How do I build one?
```

The agent scaffolds the extension/plugin project, implements the core functionality following Tinacms's API patterns, adds configuration options, and provides testing instructions to verify it works end-to-end.


## Guidelines

1. **Git is your database** — Content lives in Markdown/JSON files in your repo; every edit creates a git commit
2. **Use MDX for rich content** — MDX lets editors use custom React components (callouts, embeds, interactive elements)
3. **Define templates for blocks** — Page builder patterns (hero, features, CTA) give editors flexibility without code
4. **Type-safe queries** — Tina generates TypeScript types from your schema; use the generated client, not raw GraphQL
5. **Visual editing in dev** — Run `tinacms dev` locally for real-time editing preview; editors see changes as they type
6. **Branch-based workflow** — Editors can work on branches; content changes go through PR review like code
7. **Media in Git LFS** — For repos with many images, use Git LFS to keep the repo size manageable
8. **Self-host for control** — Tina Cloud handles auth and Git; self-host the backend for full control over the editing API
