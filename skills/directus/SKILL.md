---
name: directus
description: >-
  Build backends and APIs with Directus headless CMS. Use when a user asks to
  create a headless CMS, build a content API without coding, set up a backend
  admin panel, create REST or GraphQL APIs from a database, manage content with
  roles and permissions, build a data platform with auto-generated APIs, or
  replace traditional CMS with a headless solution. Covers data modeling,
  auto-generated REST/GraphQL APIs, roles/permissions, flows (automation),
  file storage, and SDK integration.
license: Apache-2.0
compatibility: 'Docker, or Node.js 22+ (directus 12); any supported SQL database'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/directus/directus
  category: development
  tags:
    - directus
    - cms
    - headless
    - api
---

# Directus

## Overview

Directus is an open-source headless CMS and data platform that wraps any SQL database with auto-generated REST and GraphQL APIs, a visual admin dashboard, role-based access control, file storage, and automation flows. Unlike Strapi (which defines its own schema), Directus mirrors your existing database — add columns in the admin UI or directly in SQL, and the API updates instantly. Use it for content management, internal tools, data APIs, and backend-as-a-service.

## Instructions

### Step 1: Deployment

Current release is Directus 12 (12.4.x, Sept 2026; `directus` on npm needs Node 22+). Pin a version tag in production instead of `latest`. The license is MSCL-1.0 (source-available, converts to GPL-3.0 after four years), not MIT/GPL today; since v12 some features (SSO, custom permission rules) need a license key, see https://directus.com/license.

```bash
# Docker (quickest start, SQLite)
docker run -d --name directus \
  -p 8055:8055 \
  -e SECRET="$DIRECTUS_SECRET" \
  -e ADMIN_EMAIL="admin@acme-studio.io" \
  -e ADMIN_PASSWORD="$DIRECTUS_ADMIN_PASSWORD" \
  -e DB_CLIENT="sqlite3" \
  -e DB_FILENAME="/directus/database/data.db" \
  -v directus_data:/directus/database \
  -v directus_uploads:/directus/uploads \
  directus/directus:12.4.1

# Production: Docker Compose with PostgreSQL (+ Redis cache), as in the official guide
#   services: database (postgis/postgis:17-3.5), cache (redis:7), directus (directus/directus:12.4.1)
#   directus env: SECRET, DB_CLIENT=pg, DB_HOST=database, DB_PORT=5432, DB_DATABASE, DB_USER, DB_PASSWORD,
#   CACHE_ENABLED=true, CACHE_STORE=redis, REDIS=redis://cache:6379, ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL
#   volumes: ./uploads:/directus/uploads  ./extensions:/directus/extensions

# Admin (Data Studio): http://localhost:8055
```

Behind a reverse proxy set `IP_TRUST_PROXY=true` (default is `false` since v12) and `PUBLIC_URL`. Monitoring: `/server/ping` is public; `/server/health` needs authentication since v12. Generate `SECRET` with `openssl rand -base64 32`.

### Step 2: Data Modeling

Create collections (tables) and fields via the admin UI or REST API. Get a static token from a user's profile (Token field) or log in with `POST /auth/login`; requests for fields that do not exist fail with an error since v11.

```bash
# Create a "posts" collection via API
curl -X POST http://localhost:8055/collections \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "collection": "posts",
    "meta": { "icon": "article", "note": "Blog posts" },
    "fields": [
      { "field": "id", "type": "uuid", "meta": { "special": ["uuid"] }, "schema": { "is_primary_key": true } },
      { "field": "title", "type": "string", "meta": { "required": true } },
      { "field": "slug", "type": "string", "meta": { "interface": "input" } },
      { "field": "content", "type": "text", "meta": { "interface": "input-rich-text-html" } },
      { "field": "status", "type": "string", "meta": { "interface": "select-dropdown", "options": { "choices": [{"text":"Draft","value":"draft"},{"text":"Published","value":"published"}] } } },
      { "field": "published_at", "type": "timestamp" }
    ]
  }'
```

### Step 3: Auto-Generated APIs

Once collections exist, Directus auto-generates full CRUD APIs:

```bash
# REST — List all published posts
curl 'http://localhost:8055/items/posts?filter[status][_eq]=published&sort=-published_at&limit=10' \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"

# REST — Get single post with related author
curl 'http://localhost:8055/items/posts/4f1c2a9e-7b3d-4e58-9c61-2d0a8e5b7f10?fields=*,author.name,author.avatar' \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"

# REST — Create post
curl -X POST http://localhost:8055/items/posts \
  -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title": "Launch checklist", "content": "<p>Hello world</p>", "status": "draft"}'

# GraphQL — Same queries
curl -X POST http://localhost:8055/graphql \
  -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ posts(filter: {status: {_eq: \"published\"}}, sort: [\"-published_at\"], limit: 10) { id title content published_at author { name } } }"}'
```

### Step 4: SDK Integration

```javascript
// lib/directus.js — JavaScript SDK for frontend/backend integration
import { createDirectus, rest, readItems, createItem, authentication } from '@directus/sdk'

const client = createDirectus('http://localhost:8055')
  .with(authentication())
  .with(rest())
// await client.login({ email, password })  (object argument since SDK v11+; static token: client.setToken(token))

// Fetch published posts
const posts = await client.request(
  readItems('posts', {
    filter: { status: { _eq: 'published' } },
    sort: ['-published_at'],
    limit: 10,
    fields: ['id', 'title', 'slug', 'content', 'published_at', { author: ['name', 'avatar'] }],
  })
)

// Create a new post
const newPost = await client.request(
  createItem('posts', {
    title: 'Launch checklist',
    content: '<p>Step one</p>',
    status: 'draft',
  })
)
```

### Step 5: Roles, Policies and Permissions

Since Directus 11, permissions belong to **policies**, not roles. A policy (carrying `admin_access`, `app_access`, `enforce_tfa`, `ip_access`) is attached to a role or directly to a user; roles can nest. Permissions are additive across policies. The public (unauthenticated) role has nothing allowed by default.

```bash
# 1. Role
curl -X POST http://localhost:8055/roles \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name": "Viewer"}'
# -> note data.id as ROLE_ID

# 2. Policy, attached to the role through the access table
curl -X POST http://localhost:8055/policies \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name": "Read published posts", "admin_access": false, "app_access": false,
       "roles": ["3b6d0f2a-91c4-4a7e-8d52-6c1f0a9e4b27"]}'
# -> note data.id as POLICY_ID

# 3. Permission on the policy: read published posts only
curl -X POST http://localhost:8055/permissions \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "policy": "a8e41c70-5d2b-4f93-b0c6-17d9e2f3a845",
    "collection": "posts",
    "action": "read",
    "permissions": { "status": { "_eq": "published" } },
    "fields": ["id", "title", "content", "published_at"]
  }'
```

Replace the two UUIDs with the ids returned by the first two calls. In the Data Studio this is Settings > Access Policies.

### Step 6: Flows (Automation)

Directus Flows are visual automation pipelines triggered by events, webhooks, schedules or manual buttons (built-in, like Zapier). A flow is a trigger plus chained operations (send email, request URL, run script, update items...). Build the operations in Settings > Flows; the API call below creates only the trigger, and a flow without operations does nothing.

```bash
curl -X POST http://localhost:8055/flows \
  -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "name": "Notify on Publish",
    "trigger": "event",
    "options": { "type": "action", "scope": ["items.update"], "collections": ["posts"] },
    "accountability": "all",
    "status": "active"
  }'
```

Since 12.3, update/delete operations with an empty query no longer touch every item; pass `{"limit": -1}` explicitly if you really want that.

## Examples

### Example 1: Build a content API for a marketing website
**User prompt:** "I need a CMS backend for our marketing site — blog posts, team members, case studies, and FAQ. Non-technical editors should be able to manage content through a visual dashboard."

The agent will:
1. Deploy Directus with Docker + PostgreSQL.
2. Create collections for posts, team_members, case_studies, and faqs.
3. Set up relational fields (posts → author, case studies → tags).
4. Configure a public role with read-only access for the frontend.
5. Connect the Next.js/Astro frontend using the Directus SDK.

### Example 2: Build an internal tool for operations data
**User prompt:** "Our ops team tracks orders, suppliers, and inventory in spreadsheets. Build a proper backend with an admin panel where they can manage everything."

The agent will:
1. Deploy Directus pointing at the existing PostgreSQL database.
2. Directus auto-detects existing tables and generates APIs + admin UI.
3. Create roles: admin (full access), manager (CRUD), viewer (read-only).
4. Set up flows for notifications (new order → Slack alert).

## Guidelines

- Directus mirrors your database schema — it does not own it. You can add columns via Directus admin or directly in SQL, and both stay in sync. This makes it safe for existing databases.
- Use Directus as a backend-as-a-service for content-heavy apps. For complex business logic (multi-step workflows, custom calculations), extend with custom endpoints or use a separate API layer.
- Configure the `PUBLIC` role carefully — it defines what unauthenticated users can access. For a public blog, allow read access to published posts only.
- File uploads go to local storage by default. In production, configure S3, Cloudflare R2, or Google Cloud Storage for scalability.
- Version 12 breaking changes to check when upgrading from 11: `IP_TRUST_PROXY` defaults to false, `/server/health` needs auth, `?version=main` became `?version=published`, update/delete-by-query respect read permissions (12.4), imports capped at 50 MB, Docker images use bundled pm2 and no npm/npx at runtime. Upgrading from 10 to 11 moved permissions from roles to policies. Full lists: https://directus.com/docs/releases/breaking-changes
- Directus supports PostgreSQL, MySQL, MariaDB, MS SQL, SQLite, CockroachDB, and OracleDB (MySQL 5.7 is no longer supported). PostgreSQL is recommended for production.
