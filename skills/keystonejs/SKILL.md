---
name: keystonejs
description: >-
  Keystone is an open-source headless CMS and application framework for Node.js that turns a TypeScript schema into a GraphQL API, a Prisma database layer and an Admin UI. Use it to define content schemas, add sessions and role-based access control, write lifecycle hooks, extend the GraphQL API, or upgrade a Keystone 6 project to @keystone-6/core 8 (Prisma 7 adapters, Next 16).
license: Apache-2.0
compatibility: Node.js 20.19+ or 22.12+ (Prisma 7), @keystone-6/core 8.x with Prisma 7, Next.js 16, React 19; SQLite, PostgreSQL or MySQL
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  repository: https://github.com/keystonejs/keystone
  tags: "cms, headless-cms, graphql, admin-ui, database"
---

# KeystoneJS — Headless CMS & Application Framework

## Overview

Keystone describes your data as TypeScript `list()` definitions. From that one file it generates a Prisma schema, a GraphQL API (`/api/graphql`) and an Admin UI. The npm scope is `@keystone-6`; the current line is `@keystone-6/core` 8.x (8.1.0 at the time of writing), which moved to Prisma 7 driver adapters, Next.js 16, React 19, Apollo Server 5 and Express 5. Most older tutorials (and `db.url`, `keystone prisma`, `keystone migrate`, `storage:` at config level, `validateInput`) describe 6.x/7.x and fail on 8.

## Instructions

### Install and run

```bash
npm create keystone-app@latest acme-news     # starter project
cd acme-news && npm run dev                  # keystone dev
```

For an existing project, `@keystone-6/core` now needs these as peer dependencies, installed by you:

```bash
npm install @keystone-6/core @keystone-6/auth @keystone-6/fields-document \
  @prisma/client prisma next react react-dom
npm install @prisma/adapter-pg pg                     # PostgreSQL
# or: @prisma/adapter-better-sqlite3 better-sqlite3   # SQLite
# or: @prisma/adapter-mariadb                         # MySQL
```

The first `keystone dev`/`keystone build` creates `prisma.config.ts`, `schema.prisma`, `schema.graphql` and `generated/` (types in `generated/keystone/types.ts`, Prisma client in `generated/prisma`). Commands: `keystone dev` (pushes the schema to the database), `keystone build`, `keystone start`, `keystone postinstall` (= `build --frozen --no-ui`, fails if `prisma.config.ts` is missing). Set `DATABASE_URL` for `prisma.config.ts` too.

### Configuration, sessions and auth

`db.url` is gone. Pass a Prisma driver adapter through `prismaClientOptions`:

```typescript
// keystone.ts
import { config } from '@keystone-6/core'
import { statelessSessions } from '@keystone-6/core/session'
import { createAuth } from '@keystone-6/auth'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { lists } from './schema'
import { extendGraphqlSchema } from './extensions'
import type { TypeInfo } from './generated/keystone/types'

const { withAuth } = createAuth({
  listKey: 'User',
  identityField: 'email',
  secretField: 'password',
  sessionData: 'id name role',          // copied into session.data on every request
})

export default withAuth<TypeInfo>(
  config<TypeInfo>({
    db: {
      provider: 'sqlite',               // 'postgresql' | 'mysql' | 'sqlite'
      prismaClientOptions: () => ({
        adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./keystone.db' }),
      }),
      async onConnect(context) {        // seed the first admin (createAuth has no initFirstItem any more)
        const sudo = context.sudo()
        if ((await sudo.db.User.count()) > 0) return
        await sudo.db.User.createOne({
          data: { name: 'Admin', email: 'admin@acme-news.dev', password: process.env.ADMIN_PASSWORD!, role: 'admin' },
        })
      },
    },
    lists,
    graphql: { extendGraphqlSchema },   // not a top-level key
    session: statelessSessions({
      maxAge: 60 * 60 * 24 * 30,
      secret: process.env.SESSION_SECRET!,   // at least 32 characters
    }),
    ui: { isAccessAllowed: ({ session }) => session?.data?.role === 'admin' },
  })
)
```

For PostgreSQL use `provider: 'postgresql'` with `new PrismaPg({ connectionString: process.env.DATABASE_URL })` from `@prisma/adapter-pg`.

### Schema, access control and hooks

```typescript
// schema.ts
import { list } from '@keystone-6/core'
import { allowAll } from '@keystone-6/core/access'
import { text, relationship, timestamp, select, password, integer } from '@keystone-6/core/fields'
import { document } from '@keystone-6/fields-document'
import type { Lists } from './generated/keystone/types'

type Session = { itemId: string; data: { id: string; name: string; role: 'admin' | 'editor' | 'author' } }
const isSignedIn = ({ session }: { session?: Session }) => !!session
const isAdmin = ({ session }: { session?: Session }) => session?.data.role === 'admin'

export const lists = {
  User: list({
    access: { operation: { query: isSignedIn, create: isAdmin, update: isSignedIn, delete: isAdmin } },
    fields: {
      name: text({ validation: { isRequired: true } }),
      email: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
      password: password({ validation: { isRequired: true, length: { min: 10 } } }),
      role: select({
        type: 'enum',
        options: [
          { label: 'Admin', value: 'admin' },
          { label: 'Editor', value: 'editor' },
          { label: 'Author', value: 'author' },
        ],
        defaultValue: 'author',
        access: { update: isAdmin },     // only admins may change roles
      }),
      posts: relationship({ ref: 'Post.author', many: true }),
    },
  }),
  Post: list({
    access: {
      operation: { query: allowAll, create: isSignedIn, update: isSignedIn, delete: isAdmin },
      filter: {                          // rows the caller may see / change
        query: ({ session }: { session?: Session }) =>
          session?.data.role === 'admin' ? true : { status: { equals: 'published' } },
        update: ({ session }: { session?: Session }) => {
          if (!session) return false
          if (session.data.role !== 'author') return true
          return { author: { id: { equals: session.itemId } } }
        },
      },
    },
    hooks: {
      resolveInput: {
        create: ({ resolvedData, context }) => {
          if (!resolvedData.author && context.session) {
            resolvedData.author = { connect: { id: context.session.itemId } }
          }
          return resolvedData
        },
      },
      validate: {                        // replaces validateInput / validateDelete
        create: ({ resolvedData, addValidationError }) => {
          if (resolvedData.status === 'published' && !resolvedData.content) {
            addValidationError('Cannot publish a post without content')
          }
        },
      },
      afterOperation: {
        update: async ({ item, originalItem }) => {
          if (originalItem.status !== 'published' && item.status === 'published') {
            await fetch(`${process.env.FRONTEND_URL}/api/revalidate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ secret: process.env.REVALIDATION_SECRET, path: `/posts/${item.slug}` }),
            })
          }
        },
      },
    },
    fields: {
      title: text({ validation: { isRequired: true } }),
      slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
      status: select({
        type: 'enum',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
        ],
        defaultValue: 'draft',
        ui: { displayMode: 'segmented-control' },
      }),
      content: document({ formatting: true, links: true, dividers: true, layouts: [[1, 1], [1, 1, 1]] }),
      publishedAt: timestamp(),
      readingTime: integer(),
      author: relationship({ ref: 'User.posts', ui: { displayMode: 'select', labelField: 'name' } }),
    },
  }),
} satisfies Lists
```

Changes that bite when upgrading: relationship `displayMode` is only `select`, `table` or `count`; `isFilterable`/`isOrderable` were replaced by `access.read.filter`/`access.read.order`; `{field}.label` moved to `ui.label`; `ui.defaultFieldMode` became `fieldDefaults.ui.*.fieldMode`; the `password` field's `bcrypt`/`workFactor` options became `kdf`, and bcrypt rejects inputs over 72 bytes.

### Images and files

`storage` is no longer a config-level map. Give each `image()`/`file()` field a storage strategy (`put`, `delete`, `url`) and serve the files yourself, for example with `server.extendExpressApp` and `express.static`. The `examples/assets-local` and `examples/assets-s3` projects in the repository are the reference implementations.

### Custom GraphQL

`graphql.extend` is replaced by the `g` builder from `gWithContext`:

```typescript
// extensions.ts
import { gWithContext } from '@keystone-6/core'
import type { Context } from './generated/keystone/types'

const g = gWithContext<Context>()

export const extendGraphqlSchema = g.extend(base => ({
  query: {
    featuredPosts: g.field({
      type: g.list(g.nonNull(base.object('Post'))),
      args: { limit: g.arg({ type: g.Int, defaultValue: 5 }) },
      resolve: (source, { limit }, context) =>
        context.db.Post.findMany({
          where: { status: { equals: 'published' } },
          orderBy: { publishedAt: 'desc' },
          take: limit ?? undefined,
        }),
    }),
  },
  mutation: {
    publishPost: g.field({
      type: base.object('Post'),
      args: { id: g.arg({ type: g.nonNull(g.ID) }) },
      resolve: (source, { id }, context) =>
        context.db.Post.updateOne({
          where: { id },
          data: { status: 'published', publishedAt: new Date().toISOString() },
        }),
    }),
  },
}))
```

### Migrations

`keystone prisma` and `keystone migrate` were removed in 8. `keystone dev` pushes the schema for local work; for production run the `prisma` CLI directly against the generated `schema.prisma` and `prisma.config.ts` (`npx prisma migrate dev`, `npx prisma migrate deploy`) and commit `migrations/`.

## Examples

### Example 1: Add a blog with roles

**User request:** "Set up Keystone for a blog where authors only edit their own posts and visitors see only published ones."

Create `keystone.ts` and `schema.ts` as above, then run `DATABASE_URL=file:./keystone.db ADMIN_PASSWORD='change-me-0123456' npm run dev` (the generated `prisma.config.ts` reads `DATABASE_URL`; the password must be 10+ characters or the seed fails). Open http://localhost:3000, sign in as the seeded admin and create an author. Result: an anonymous query returns only published posts, and an author's `updatePost` on someone else's post is rejected.

```bash
curl -s localhost:3000/api/graphql -H 'content-type: application/json' \
  -d '{"query":"{ posts { title status } }"}'
# {"data":{"posts":[{"title":"Spring release notes","status":"published"}]}}
```

### Example 2: Upgrade a Keystone 6 project

**User request:** "Our CMS is on @keystone-6/core 6 and `npm update` broke it."

Install the peer dependencies and a Prisma adapter, replace `db.url` with `prismaClientOptions`, move `extendGraphqlSchema` under `graphql`, rename `validateInput` hooks to `validate`, move `storage` onto the `image`/`file` fields, delete `keystone prisma` scripts from `package.json`, then run `npx keystone build`. Fix the TypeScript errors it reports against `generated/keystone/types`; a clean `tsc` plus a successful `authenticateUserWithPassword` mutation means the upgrade works.

## Guidelines

- Never ship `allowAll` on lists that hold private data; define `operation`, `filter` and field-level `access`, and treat `filter` as the way to scope rows per user.
- Keep the Admin UI behind `ui.isAccessAllowed`; the GraphQL API is public unless access rules say otherwise.
- `SESSION_SECRET` must be 32+ characters and come from the environment; stateless cookies cannot be revoked server-side, so keep `maxAge` short for privileged roles or use a session store.
- Keep `@keystar/ui` pinned to the version in `@keystone-6/core`'s peer dependencies if you write custom Admin UI components; the old `@keystone-ui/*` packages are gone.
- `context.sudo()` bypasses access control: use it only in trusted server code such as `onConnect` seeds.
- Prisma errors are no longer returned as `GraphQLError`; set `graphql.apolloConfig.formatError` if you need custom handling.
- Not the right tool when you need a hosted editor with no code, or a REST-first API.
