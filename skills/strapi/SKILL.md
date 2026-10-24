---
name: strapi
description: >-
  Strapi is an open-source headless CMS built on Node.js that turns content types
  you model in an admin panel into REST and GraphQL APIs, with roles, a media
  library and plugins. Use when setting up a Strapi 5 project, modeling content
  types, querying the REST API from a Next.js or other frontend, customizing
  controllers and routes, or migrating from Strapi 4.
license: Apache-2.0
compatibility: 'Node.js 20+ (Strapi 5.59 supports 20 to 26); SQLite, PostgreSQL or MySQL'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  repository: https://github.com/strapi/strapi
  tags:
    - headless-cms
    - api
    - content
    - self-hosted
    - rest
---

# Strapi — Open-Source Headless CMS

## Overview

Strapi lets editors manage content in an admin panel while developers consume it through generated REST (and optional GraphQL) endpoints. This skill targets **Strapi 5** (5.59 at the time of writing). Version 5 changed the API shape from version 4: entries are **documents** addressed by a string `documentId`, responses are **flat** (no `attributes` wrapper), `publishedAt` filtering is replaced by a `status` parameter, and the Entity Service is deprecated in favor of the Document Service API. Code written for v4 will break.

## Instructions

### Project setup

```bash
npx create-strapi@latest newsroom-cms     # prompts: TypeScript (default), database, example data
cd newsroom-cms
npm run develop                           # admin at http://localhost:1337/admin
```

Non-interactive: `npx create-strapi@latest newsroom-cms --non-interactive --skip-cloud` (TypeScript, SQLite, npm dependencies installed). Other flags: `--js`, `--dbclient postgres|mysql|sqlite`, `--use-pnpm`, `--no-example`. Create the first admin user in the browser on first start. Secrets (`APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`) live in `.env`; set production values and keep the file out of git. `npm run develop` is for development (auto-reload, Content-Type Builder enabled); production uses `npm run build` then `npm run start`.

### Content types

Model them in the Content-Type Builder (development mode only; it writes schema files under `src/api/`, so commit them):

- **Collection types** hold many entries (articles, products); **single types** hold one (homepage, site settings).
- **Components** are reusable field groups (SEO, hero) that you attach to content types or to dynamic zones.
- Each collection type `article` gets routes under `/api/articles`:

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/articles` | list |
| POST | `/api/articles` | create (body `{ "data": { ... } }`) |
| GET | `/api/articles/:documentId` | read one |
| PUT | `/api/articles/:documentId` | update |
| DELETE | `/api/articles/:documentId` | delete |

Single types are `/api/homepage` (no id). New endpoints are closed: in the admin go to Settings, Users & Permissions, Roles, Public (or Authenticated) and tick `find`/`findOne`, or send an API token created under Settings, API Tokens as `Authorization: Bearer <token>`.

### Querying the REST API

```typescript
const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL ?? "http://localhost:1337";
const headers = { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` };

// Strapi 5: flat documents, published versions by default
export async function getArticles(page = 1, pageSize = 10) {
  const params = new URLSearchParams({
    "populate[0]": "cover",
    "populate[1]": "author",
    sort: "publishedAt:desc",
    "pagination[page]": String(page),
    "pagination[pageSize]": String(pageSize),
  });
  const res = await fetch(`${STRAPI_URL}/api/articles?${params}`, {
    headers,
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Strapi responded ${res.status}`);
  const { data, meta } = await res.json();
  // data[i] = { id, documentId, title, slug, publishedAt, cover: {...}, author: {...} }
  return { articles: data, pagination: meta.pagination };
}

export async function getArticleBySlug(slug: string) {
  const params = new URLSearchParams({ "filters[slug][$eq]": slug, populate: "cover" });
  const res = await fetch(`${STRAPI_URL}/api/articles?${params}`, { headers });
  const { data } = await res.json();
  return data[0] ?? null;
}
```

Rules that differ from v4 and cause most bugs:

- **Relations, media and components are not returned unless populated.** Use `populate[0]=cover` or `populate[author][populate][0]=avatar`; avoid `populate=*` in production and `populate=deep` plugins.
- **Draft and Publish**: the REST API returns the published version by default, so no `publishedAt` filter is needed. Add `status=draft` to read drafts (needs a token allowed to). A `POST` or `PUT` publishes immediately unless you pass `status=draft`.
- Filter with `filters[field][$eq]=value`; other operators include `$eqi`, `$contains`, `$in`, `$notNull`, `$between`. Page size is capped by `api.rest.maxLimit` in `config/api.ts`.
- Build complex query strings with the `qs` library rather than by hand.
- Fetch from server code or a proxy route, never ship a full-access token in browser bundles.

### Custom controllers, routes and the Document Service

Inside Strapi, use `strapi.documents(uid)` (Document Service) instead of `strapi.entityService`.

```typescript
// src/api/article/controllers/article.ts
import { factories } from "@strapi/strapi";

export default factories.createCoreController("api::article.article", ({ strapi }) => ({
  // Custom action: POST /api/articles/:id/views (route below)
  async incrementViews(ctx) {
    const { id: documentId } = ctx.params;
    const article = await strapi.documents("api::article.article").findOne({ documentId });
    if (!article) return ctx.notFound("Article not found");
    const updated = await strapi.documents("api::article.article").update({
      documentId,
      data: { views: (article.views ?? 0) + 1 },
    });
    return { views: updated?.views };
  },
}));
```

```typescript
// src/api/article/routes/01-custom-article.ts  (the 01- prefix loads it before the core routes)
export default {
  type: "content-api",
  routes: [
    {
      method: "POST",
      path: "/articles/:id/views",
      handler: "api::article.article.incrementViews",
    },
  ],
};
```

Grant the new action in Users & Permissions (or the route returns 403). Note that `update` through the Document Service edits the draft by default; pass `status: "published"` to publish while updating. The read-modify-write counter above is not atomic; use a database counter for heavy traffic. Plain JavaScript projects use `require("@strapi/strapi").factories` and `module.exports` instead.

## Examples

### Example 1: "Create a blog backend and publish an article from the command line"

```bash
curl -s -X POST http://localhost:1337/api/articles \
  -H "Authorization: Bearer $STRAPI_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"title":"Launch notes","slug":"launch-notes"}}'
```

Result: HTTP `201 Created` with a JSON body `{"data":{"id":3,"documentId":"hgv1vny5cebq2l3czil1rpb3","title":"Launch notes", ...},"meta":{}}`. Because Draft and Publish is on and no `status` was given, the article is published at once. Read it back with `GET /api/articles/hgv1vny5cebq2l3czil1rpb3`.

### Example 2: "My v4 frontend broke after upgrading to Strapi 5"

Symptoms: `item.attributes` is `undefined`, `/api/articles/12` returns 404, `filters[publishedAt][$notNull]` is redundant. Fixes: read fields directly from `item`, address documents by `documentId` (a string), replace `item.attributes.cover.data.attributes.url` with `item.cover.url`, and replace `strapi.entityService.*` in backend code with `strapi.documents(uid).*`. The official upgrade tool is `npx @strapi/upgrade major` (run it on a clean git tree), followed by manual review of custom code.

## Guidelines

- **Tokens**: use read-only API tokens for frontends; admin credentials never leave the browser admin UI.
- **Webhooks**: configure Settings, Webhooks to call your frontend's revalidation endpoint on `entry.publish` and `entry.update` events.
- **Uploads**: for production, move the media library to S3, Cloudinary or similar with an upload provider, because container disks are ephemeral.
- **Lifecycle hooks** (`beforeCreate`, `afterUpdate` in `lifecycles.ts` or via `strapi.documents.use` middleware) suit slugs and notifications; keep them fast.
- **Permissions**: define Author/Editor/Admin roles in the admin (RBAC); Users & Permissions roles govern the Content API separately.
- **Database**: SQLite is for development; use PostgreSQL or MySQL in production and back up the database and `public/uploads`.
- **Do not edit schemas on a production server**; the Content-Type Builder is disabled there. Change schemas in development and deploy.
