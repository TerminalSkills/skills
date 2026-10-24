---
name: sanity
description: >-
  Sanity is a headless CMS that stores structured content in a hosted Content Lake, edited in a
  React-based Studio and queried with GROQ. Use when defining Sanity schemas, writing GROQ queries,
  configuring Sanity Studio, rendering Portable Text, or wiring Sanity into Next.js with next-sanity,
  Draft Mode and visual editing. Trigger words: sanity, groq, sanity studio, portable text, content
  lake, sanity schema, next-sanity.
license: Apache-2.0
compatibility: "Sanity 6 and next-sanity 13 need Node.js 22.12+, React 19 and Next.js 16; the Content Lake is hosted"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  tags: ["sanity", "cms", "groq", "headless-cms", "nextjs"]
  repository: https://github.com/sanity-io/sanity
---

# Sanity

## Overview

Sanity keeps content as JSON documents in a hosted Content Lake. You define document types in code, edit them in Sanity Studio (a React app you own and deploy), and read them from any frontend with GROQ through `@sanity/client`. Rich text is stored as Portable Text (structured JSON, not HTML). For Next.js, `next-sanity` bundles the client, a live-content helper (`defineLive`), Draft Mode and the visual-editing overlay. Versions checked: `sanity` 6.20.0, `@sanity/client` 8.11.0, `next-sanity` 13.4.0 (npm, October 2026).

## Instructions

### Create a Studio or add Sanity to an app

```bash
npm create sanity@latest -- --dataset production --template clean --typescript --output-path studio
cd studio && npm run dev          # Studio on http://localhost:3333
npx sanity@latest init            # inside an existing Next.js project: detects it and embeds the Studio
```

Current packages require Node.js 22.12 or later (`next-sanity` also accepts 20.19+). Datasets are public by default; use a private dataset or a read token for anything sensitive.

### Schemas

Define types with `defineType` and `defineField` from `sanity`, and register them in `sanity.config.ts` under `schema.types`. Studio plugins are tools such as `structureTool()` (from `sanity/structure`, replaces the old desk tool) and `presentationTool()` (from `sanity/presentation`).

```typescript
import {defineType, defineField, defineArrayMember} from 'sanity'

export const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(90)}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title'}, validation: (rule) => rule.required()}),
    defineField({name: 'cover', type: 'image', options: {hotspot: true}}),
    defineField({name: 'author', type: 'reference', to: [{type: 'author'}]}),
    defineField({name: 'body', type: 'array', of: [defineArrayMember({type: 'block'}), defineArrayMember({type: 'image'})]}),
  ],
})
```

Model content for reuse: use references for shared documents and objects for page-builder blocks. After changing schemas run `npx sanity schemas extract` and `npx sanity typegen generate` to get typed query results.

### GROQ

```groq
*[_type == "post" && defined(slug.current)] | order(publishedAt desc)[0...10]{
  _id, title, "slug": slug.current, "author": author->name
}
```

Project only the fields you need; `->` follows a reference. Wrap queries in `defineQuery` (from `groq` or `next-sanity`) so TypeGen can type them. The client is `createClient({projectId, dataset, apiVersion, useCdn})` from `@sanity/client`. Always pin `apiVersion` to a date. Since API version 2025-02-19 the client's default perspective is `published`; use `perspective: 'drafts'` with a token to read drafts. `useCdn: true` suits published reads in the browser or high-traffic pages; use `false` when fresh data is required (static generation, webhook-triggered revalidation, preview).

### Images and Portable Text

```typescript
import {createImageUrlBuilder} from '@sanity/image-url'
const builder = createImageUrlBuilder(client)
export const urlFor = (source: any) => builder.image(source)
// urlFor(post.cover).width(1200).height(630).auto('format').url()
```

The package is `@sanity/image-url` (not `sanity-image-url`); install it with `npm i @sanity/image-url` (`sanity` depends on it for the Studio, but `next-sanity` does not install it). Hotspot and crop data are applied automatically when you pass the image object. Render Portable Text with `@portabletext/react` (`<PortableText value={post.body} />`, `components` prop for custom blocks).

### Next.js (App Router) with live content and visual editing

Environment: `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, and a server-only `SANITY_API_READ_TOKEN` with the Viewer role. Add the frontend origin (for example `http://localhost:3000`) as a CORS origin with credentials: `npx sanity cors add http://localhost:3000 --credentials`.

```typescript
// src/sanity/lib/client.ts
import {createClient} from 'next-sanity'
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-02-01',
  useCdn: true,
  stega: {studioUrl: 'http://localhost:3333'},
})

// src/sanity/lib/live.ts
import {defineLive} from 'next-sanity/live'
import {client} from './client'
export const {sanityFetch, SanityLive} = defineLive({
  client,
  serverToken: process.env.SANITY_API_READ_TOKEN,
  browserToken: process.env.SANITY_API_READ_TOKEN,
})
```

- Fetch in server components with `sanityFetch({query, params})` instead of `client.fetch`; it handles caching, perspective (published vs drafts in Draft Mode) and stega encoding. Pass `stega: false` in `generateMetadata` and `generateStaticParams`, because invisible characters break titles and URLs.
- In the root layout render `<SanityLive />` and, only when `(await draftMode()).isEnabled`, `<VisualEditing />` from `next-sanity/visual-editing`.
- Enable route: `export const {GET} = defineEnableDraftMode({client: client.withConfig({token: process.env.SANITY_API_READ_TOKEN})})` from `next-sanity/draft-mode`, at `/api/draft-mode/enable`; add a route that calls `(await draftMode()).disable()`.
- In the Studio, `presentationTool({resolve, previewUrl: {initial: 'http://localhost:3000', previewMode: {enable: '/api/draft-mode/enable'}}})` shows the site beside the editor; `resolve` maps document types to URLs with `defineLocations`.
- next-sanity 13 changed `<SanityLive>`: the `revalidateSyncTags` prop became `action`, and `refreshOnFocus`, `refreshOnMount`, `refreshOnReconnect` and the `useDraftModePerspective` hook were removed. By default published pages are no longer guaranteed to update within seconds of a publish; read `MIGRATE-v12-to-v13.md` in the next-sanity repository before upgrading from 12.

## Examples

### Example 1: Add a blog post type and list posts in Next.js

**User request:** "Add a post type with title, slug and author to our Studio and list the latest 10 posts on /blog."

Add the `post` type above to `schemaTypes`, then:

```tsx
// src/app/blog/page.tsx
import {defineQuery} from 'next-sanity'
import {sanityFetch} from '@/sanity/lib/live'

const POSTS_QUERY = defineQuery(`*[_type == "post" && defined(slug.current)] | order(_createdAt desc)[0...10]{_id, title, "slug": slug.current}`)

export default async function Blog() {
  const {data: posts} = await sanityFetch({query: POSTS_QUERY})
  return <ul>{posts.map((p) => <li key={p._id}><a href={`/blog/${p.slug}`}>{p.title}</a></li>)}</ul>
}
```

Result: published posts render on /blog and update when editors publish.

### Example 2: Let editors click-to-edit in preview

**User request:** "Editors should see our site next to the Studio and click a headline to edit it."

Steps: set `stega.studioUrl` in the client; create the `defineLive` helper; add `<SanityLive />` and the conditional `<VisualEditing />` to the root layout; add the `/api/draft-mode/enable` route; add `presentationTool` to `sanity.config.ts`; add the CORS origin. Open the Presentation tool: the page loads in an iframe, and each text field becomes clickable.

## Guidelines

- Never expose a write token to the browser; the read token for `browserToken` must be Viewer-only.
- Pin `apiVersion` to a date and change it deliberately.
- Run `npx sanity deploy` (hosted Studio) or deploy the embedded Studio route; datasets are managed with `npx sanity datasets`.
- Do not use stega-encoded strings as URLs, slugs or metadata; clean them with `stegaClean` from `@sanity/client/stega`.
- Prefer references over copied data, and GROQ projections over fetching whole documents.
