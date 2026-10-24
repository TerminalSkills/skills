---
name: contentful
description: >-
  Contentful is an API-first headless CMS: content lives in typed content models and is served through the Content Delivery API (published, CDN), the Content Preview API (drafts) and the Content Management API (writes). Use when a user wants to fetch Contentful entries in a website or app, type them in TypeScript, render rich text, resolve linked entries and assets, preview drafts, write or publish entries from a script, or trigger rebuilds with webhooks.
license: Apache-2.0
compatibility: "Node.js 20+, contentful 11.x, contentful-management 12.x, a Contentful space with API keys"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  repository: https://github.com/contentful/contentful.js
  tags: ["headless-cms", "contentful", "content-api", "cdn", "typescript"]
---

# Contentful

## Overview

Contentful stores structured content in a space. You define content types (a blog post, an author), editors create entries, and your code reads them over REST (or GraphQL). Reads of published content use the Delivery API on `cdn.contentful.com`; unpublished drafts use the Preview API on `preview.contentful.com` with a separate token; writes use the Management API with a personal access token or an app token. The `contentful` package (v11) is the read client, `contentful-management` (v12) the write client, and `@contentful/rich-text-react-renderer` turns rich text fields into React.

## Instructions

### Install and configure

```bash
npm install contentful @contentful/rich-text-react-renderer @contentful/rich-text-types
npm install contentful-management      # only for scripts that create or publish entries
```

Keep the space ID and tokens in environment variables: `CONTENTFUL_SPACE_ID`, `CONTENTFUL_DELIVERY_TOKEN`, `CONTENTFUL_PREVIEW_TOKEN` (server-side only), `CONTENTFUL_MANAGEMENT_TOKEN` (scripts only, never in browser code).

### Typed Delivery API client

Since v10 the client is typed through entry skeletons: describe each content type once with `contentTypeId` and `fields`, then pass the skeleton to `getEntries<...>`. The `content_type` query parameter is required when you filter on `fields.*`.

```typescript
// src/lib/contentful.ts: Contentful client and typed queries
import * as contentful from "contentful";

export type AuthorSkeleton = {
  contentTypeId: "author";
  fields: {
    name: contentful.EntryFieldTypes.Text;
  };
};

export type BlogPostSkeleton = {
  contentTypeId: "blogPost";
  fields: {
    title: contentful.EntryFieldTypes.Text;
    slug: contentful.EntryFieldTypes.Symbol;
    excerpt: contentful.EntryFieldTypes.Text;
    body: contentful.EntryFieldTypes.RichText;
    featuredImage: contentful.EntryFieldTypes.AssetLink;
    author: contentful.EntryFieldTypes.EntryLink<AuthorSkeleton>;
    tags: contentful.EntryFieldTypes.Array<contentful.EntryFieldTypes.Symbol>;
    publishDate: contentful.EntryFieldTypes.Date;
  };
};

const preview = process.env.CONTENTFUL_PREVIEW === "true";

export const client = contentful.createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  environment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
  accessToken: preview
    ? process.env.CONTENTFUL_PREVIEW_TOKEN!
    : process.env.CONTENTFUL_DELIVERY_TOKEN!,
  host: preview ? "preview.contentful.com" : "cdn.contentful.com",
});

export async function getBlogPosts(limit = 10) {
  const response = await client.withoutUnresolvableLinks.getEntries<BlogPostSkeleton>({
    content_type: "blogPost",
    order: ["-fields.publishDate"],
    limit,
    include: 2,
    "fields.slug[exists]": true,
  });
  return response.items;
}

export async function getBlogPostBySlug(slug: string) {
  const response = await client.withoutUnresolvableLinks.getEntries<BlogPostSkeleton>({
    content_type: "blogPost",
    "fields.slug": slug,
    include: 3,
    limit: 1,
  });
  return response.items[0] ?? null;
}

```

Notes on the queries: `include` sets how many levels of linked entries and assets are resolved. `withoutUnresolvableLinks` removes links to entries that are unpublished or deleted instead of leaving raw link objects, so `post.fields.author` is either a resolved entry or absent. In v11 asset files are optional (`asset.fields.file?.url`) because an asset may have no file in the requested locale.

You can generate the skeletons from your content model instead of writing them: `npx cf-content-types-generator -s $CONTENTFUL_SPACE_ID -t $CONTENTFUL_MANAGEMENT_TOKEN -e master -o src/@types/generated` (a community tool that targets contentful.js 10 and later).

### Rich text rendering

```tsx
// src/components/RichText.tsx: render Contentful rich text
import { documentToReactComponents, type Options } from "@contentful/rich-text-react-renderer";
import { BLOCKS, INLINES, type Document } from "@contentful/rich-text-types";

const renderOptions: Options = {
  renderNode: {
    [BLOCKS.EMBEDDED_ASSET]: (node) => {
      const file = node.data.target.fields?.file;
      if (!file?.url) return null;
      const width = file.details?.image?.width;     // absent for non-image files
      const height = file.details?.image?.height;
      return (
        <img
          src={`https:${file.url}?w=800&fm=webp&q=80`}
          alt={node.data.target.fields.title ?? ""}
          width={width}
          height={height}
          loading="lazy"
        />
      );
    },
    [BLOCKS.EMBEDDED_ENTRY]: (node) => {
      const entry = node.data.target;
      if (entry.sys.contentType?.sys.id === "codeBlock") {
        return (
          <pre>
            <code className={`language-${entry.fields.language}`}>{entry.fields.code}</code>
          </pre>
        );
      }
      return null;
    },
    [INLINES.HYPERLINK]: (node, children) => (
      <a href={node.data.uri} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  },
};

export function RichText({ document }: { document: Document }) {
  return <div className="prose">{documentToReactComponents(document, renderOptions)}</div>;
}
```

Embedded entries and assets only render if the query resolved them: use `include: 2` or more on the page query. Replace the `<img>` with your framework's image component if you use one, and allow the `images.ctfassets.net` host in its config.

### Image transformations

Asset URLs accept query parameters (`w`, `h`, `q`, `fm`, `fit`, `f`) so the CDN resizes and re-encodes on the fly:

```typescript
import type { Asset } from "contentful";
type ImageOptions = { width?: number; height?: number; quality?: number; format?: "webp" | "avif" | "jpg" | "png"; fit?: "pad" | "fill" | "scale" | "crop" | "thumb"; focus?: "face" | "center" | "top" | "bottom" };
export function contentfulImageUrl(asset: Asset, o: ImageOptions = {}): string {
  const file = asset.fields.file;
  if (!file?.url) throw new Error("Asset has no file in this locale");
  const url = new URL(`https:${file.url}`);
  if (o.width) url.searchParams.set("w", String(o.width));
  if (o.height) url.searchParams.set("h", String(o.height));
  if (o.quality) url.searchParams.set("q", String(o.quality));
  if (o.format) url.searchParams.set("fm", o.format);
  if (o.fit) url.searchParams.set("fit", o.fit);
  if (o.focus) url.searchParams.set("f", o.focus);
  return url.toString();
}
```

### Preview and pagination

Set `host: "preview.contentful.com"` with the preview token (the `preview` flag in the client above) to see drafts; never use that client for public pages. For long lists, `client.getEntriesWithCursor({ limit: 100 })` returns `pages.next` to pass as `pageNext` on the next call, instead of `skip` offsets.

### Localization

Fetch one locale with `locale: "de-DE"` in the query. To get every locale, use the modifier `client.withAllLocales.getEntries(...)`, which changes each field to an object keyed by locale code (`post.fields.title["de-DE"]`). Locale codes come from the space settings, so use the exact codes (`en-US`, not `en`).

### Writing with the Management API

```typescript
// scripts/create-draft.ts
import { createClient } from "contentful-management";

const cma = createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN! });
const scope = { spaceId: process.env.CONTENTFUL_SPACE_ID!, environmentId: "master" };

async function main() {
  const entry = await cma.entry.create(
    { ...scope, contentTypeId: "blogPost" },
    { fields: { title: { "en-US": "Launch notes" }, slug: { "en-US": "launch-notes" } } },
  );
  const published = await cma.entry.publish({ ...scope, entryId: entry.sys.id }, entry);
  console.log("published version", published.sys.publishedVersion);
}

main().catch((error) => { console.error(error); process.exit(1); });
```

Management API field values are always keyed by locale. Publishing fails if a required field is empty or a linked entry is unpublished. Test content-model changes in a separate environment (a sandbox copy of `master`) before applying them to `master`.

## Examples

### Example 1: "Show my five latest posts with the author's name on the homepage"

Add the skeletons and client above, then:

```typescript
const posts = await getBlogPosts(5);
for (const post of posts) {
  console.log(post.fields.title, "by", post.fields.author?.fields.name);
}
```

The request goes to `/spaces/<space>/environments/master/entries?content_type=blogPost&order=-fields.publishDate&limit=5&include=2&...` with an `Authorization: Bearer` header carrying the delivery token, and each author comes back already resolved from the `includes` section.

### Example 2: "Render the article body, including embedded images"

Fetch with `getBlogPostBySlug("launch-notes")` (it uses `include: 3`) and render `<RichText document={post.fields.body} />`. Each embedded asset becomes an `<img>` on the `images.ctfassets.net` host with `?w=800&fm=webp&q=80` appended, and links open in a new tab.

## Guidelines

- Use the Delivery token for production reads and the Preview token only on preview routes or server-side draft mode; keep both, and the Management token, out of client bundles.
- Prefer `withoutUnresolvableLinks` for public pages; otherwise unpublished linked entries appear as bare `{ sys: { type: "Link" } }` objects and break rendering.
- Keep `limit` and `include` as small as the page allows, and cache responses or build statically instead of fetching on every request; the Delivery API is rate limited.
- Trigger rebuilds or cache revalidation from a Contentful webhook on publish and unpublish events; check the shared secret header you configured before acting on the request.
- Make content-model changes in a separate environment first, then promote them, because removing a field breaks every query that selects it.
- Do not use the Management API for page rendering: it is slower, rate limited and not cached.
