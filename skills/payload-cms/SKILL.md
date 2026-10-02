---
name: payload-cms
description: >-
  Payload is an open-source, code-first headless CMS and application framework that runs inside a Next.js app, with collections defined in TypeScript.
  Use this skill when defining collections in TypeScript, configuring access control, customizing the admin
  panel, or integrating with Next.js. Trigger words: payload, payload cms, headless cms,
  collections, admin panel, content management, payload fields.
license: Apache-2.0
compatibility: "Requires Node.js 20.9+ and a supported Next.js 15/16 release, with MongoDB, PostgreSQL, or SQLite"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/payloadcms/payload
  category: content
  tags: ["payload-cms", "cms", "headless-cms", "content-management", "nextjs"]
---

# Payload CMS

## Overview

Payload CMS is a code-first headless CMS where collections and fields are defined in TypeScript, auto-generating an admin panel, REST/GraphQL APIs, and TypeScript types. It supports PostgreSQL, MongoDB, and SQLite, and integrates directly into Next.js applications with the Local API.

## Overview

Payload (3.x) is a code-first headless CMS where collections and fields are defined in TypeScript, auto-generating an admin panel, REST/GraphQL APIs, and TypeScript types. It installs into a Next.js app (the admin lives at `/admin` in your own project), supports MongoDB, PostgreSQL and SQLite through separate database adapters, and exposes a Local API that queries the database directly without HTTP.

## Instructions

- **Install.** New project: `npx create-payload-app@latest`. Existing Next.js app: `pnpm i payload @payloadcms/next @payloadcms/richtext-lexical sharp graphql`, plus one adapter (`@payloadcms/db-mongodb`, `@payloadcms/db-postgres` or `@payloadcms/db-sqlite`), copy the `app/(payload)` folder from the official template, and wrap `next.config` with `withPayload` from `@payloadcms/next/withPayload`. The `payload.config.ts` calls `buildConfig({ secret: process.env.PAYLOAD_SECRET, db, editor, collections, globals, sharp })`; the rich-text editor is not bundled, so pass `lexicalEditor()` from `@payloadcms/richtext-lexical`.
- **Collections.** Config objects with `slug`, `fields`, `access`, `hooks`, using field types such as text, richText, relationship, upload, array, group, blocks and select. Run `payload generate:types` after schema changes to refresh `payload-types.ts`, and `payload generate:importmap` after adding custom admin components.
- **Access control.** Functions per operation (`create`, `read`, `update`, `delete`) on the collection and per field, receiving `{ req }` and returning a boolean or a query constraint, for example `({ req: { user } }) => user?.role === 'admin'`. Write reusable functions like `isAdmin` once and import them.
- **Local API.** `const payload = await getPayload({ config })` (config from `@payload-config`) in Server Components, then `payload.find({ collection, where, depth, limit })` and `payload.create(...)`. **The Local API skips access control by default**; pass `overrideAccess: false` and `user` whenever the call runs on behalf of a visitor.
- **Drafts and versions.** `versions: { drafts: true }` adds a `_status` field (`draft` or `published`). Saving with `draft: true` writes only to the versions table; publishing means setting `_status: 'published'`. `autosave` and scheduled publishing are options (scheduling needs the jobs queue). Query unpublished content with `draft: true` and restrict who may read it.
- **Pages from blocks.** A `blocks` field lets editors compose pages from block types you define; share field groups as functions that return field arrays.
- **Admin panel.** Replace components via `admin.components` using path strings, add custom views, and configure `admin.livePreview` with a `url` and breakpoints for real-time preview.
- **Globals** hold singletons such as site settings, header and footer; use relationships rather than manual ID references.
- **Database changes.** MongoDB needs no migrations. For Postgres/SQLite, dev mode pushes schema changes automatically, but production should use `payload migrate:create` and `payload migrate`.

## Examples

### Example 1: Build a blog CMS with Next.js

**User request:** "Set up Payload CMS for a blog with categories, authors, and rich text"

```ts
// src/collections/Posts.ts
import type { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  access: { read: ({ req: { user } }) => (user ? true : { _status: { equals: 'published' } }) },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'content', type: 'richText' },
  ],
}
```

```tsx
// app/(frontend)/blog/page.tsx (Server Component)
const payload = await getPayload({ config })
const { docs } = await payload.find({ collection: 'posts', limit: 10, sort: '-createdAt' })
```

**Result:** `/admin` shows Posts with Save Draft / Publish buttons; the blog page lists only published posts, fully typed.

### Example 2: Create a multi-role content workflow

**User request:** "Set up Payload with editor, reviewer, and admin roles with different permissions"

```ts
// src/access/roles.ts
import type { Access, FieldAccess } from 'payload'

export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'
export const isStaff: Access = ({ req: { user } }) => Boolean(user && ['editor', 'reviewer', 'admin'].includes(user.role))
export const adminOnlyField: FieldAccess = ({ req: { user } }) => user?.role === 'admin'
```

Add `{ name: 'role', type: 'select', options: ['editor', 'reviewer', 'admin'], defaultValue: 'editor', access: { update: adminOnlyField } }` to the Users collection, use `isStaff` for `read`/`create`, and let only reviewers and admins change `_status` to `published` with a `beforeChange` hook that throws otherwise.

**Result:** editors can save drafts, reviewers and admins can publish, and only admins can change roles, through the admin panel, REST, GraphQL and Local API alike.

## Guidelines

- Access control functions are enforced on REST and GraphQL, but not on Local API calls unless `overrideAccess: false` is set; this is the most common source of data leaks.
- Keep `PAYLOAD_SECRET` and the database URL in environment variables; never commit them.
- Enable versions on content collections so edits cannot publish by accident.
- Use relationships instead of storing raw IDs; Payload validates and resolves them (`depth` controls how far).
- Keep admin customizations small; the generated panel covers most needs.
- Check the supported Next.js range in the installation docs before upgrading Next.js; Payload pins to patched versions.
- Payload 2.x (webpack admin, `payload.init()`, Slate editor) is a different architecture; do not mix its snippets with 3.x.
