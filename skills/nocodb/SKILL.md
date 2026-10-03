---
name: nocodb
description: >-
  NocoDB is an open-source Airtable alternative that turns a database into a spreadsheet-style app with grid, kanban, gallery, calendar and form views, webhooks and a REST API. Use when a user asks to self-host NocoDB with Docker, connect it to PostgreSQL or MySQL, build forms and views, call the NocoDB API with a token, or set up webhooks.
license: Apache-2.0
compatibility: "Docker, optionally an existing PostgreSQL or MySQL database"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["database", "spreadsheet", "airtable-alternative", "open-source", "no-code"]
  repository: https://github.com/nocodb/nocodb
---
# NocoDB — Open-Source Airtable Alternative

## Overview

NocoDB gives a relational database a spreadsheet interface and an auto-generated REST API. It can run on its own metadata database (SQLite or Postgres) or connect to an existing PostgreSQL or MySQL database as an external data source, so your tables stay in your database. Teams use it for internal tools, intake forms, kanban boards and lightweight CRMs. It runs as `nocodb/nocodb` on Docker, on port 8080, with a hosted cloud edition too. Newer builds also ship workflows, interfaces and an MCP server; this skill covers the self-hosted core: install, views, API and webhooks. Some token and permission features are only in the Cloud and licensed editions, noted below.

## Instructions

### 1. Run it

SQLite, for a quick trial (data persists in the mounted folder):

```bash
docker run -d --name noco \
  -v "$(pwd)"/nocodb:/usr/app/data/ \
  -p 8080:8080 \
  nocodb/nocodb:latest
```

With Postgres as the metadata store (keep the JWT secret fixed, otherwise logins break when the container is recreated):

```bash
docker run -d --name noco \
  -v "$(pwd)"/nocodb:/usr/app/data/ \
  -p 8080:8080 \
  -e NC_DB="pg://db.internal:5432?u=nocodb&p=${NOCODB_DB_PASSWORD}&d=nocodb_meta" \
  -e NC_AUTH_JWT_SECRET="${NOCODB_JWT_SECRET}" \
  nocodb/nocodb:latest
```

Open `http://localhost:8080`; the first account to sign up becomes the super admin. The official quickstart installer writes a Compose stack (NocoDB, a worker, Postgres, Redis) into `nocodb/`; download and read it rather than piping it to a shell. For production use that multi-container layout, put NocoDB behind HTTPS and pin an image tag instead of `latest`.

`NC_DB` is NocoDB's own metadata database. To work on your business data, add it inside the UI as an external data source (base settings, Data Sources) with a read-write database user.

### 2. Views

Grid (sort, filter, group, hide fields, CSV import and export), Kanban (stack by a single-select field), Gallery (cover-image cards), Calendar (date fields) and Form (public shareable link, required fields, conditional visibility). Lookup, rollup and link fields give relations without writing joins. Roles are set per base (viewer, commenter, editor, creator, owner).

### 3. API tokens and REST API

Create a token under Account Settings, API Tokens. Fine-grained tokens (scoped to bases and permission categories, with expiry) are recommended; on Community Edition tokens are unscoped. Send the token as `xc-token: ...` or `Authorization: Bearer ...`. Token strings are shown once.

Find the IDs in the UI: base ID starts with `p`, table ID with `m`, view ID with `v`. The v3 data API:

```bash
export NC_URL=http://localhost:8080 NC_TOKEN=...   # token from the UI

# list: page/pageSize, sort with - for descending, where with quoted values allowed
curl -G "$NC_URL/api/v3/data/pk3h1xmj0g2bq7d/mw8s2nqz4tv1c6e/records" \
  -H "xc-token: $NC_TOKEN" \
  --data-urlencode 'where=(Status,eq,Active)' \
  --data-urlencode 'sort=-CreatedAt' --data-urlencode 'pageSize=20'

# create: values go inside "fields"; a single object or an array is accepted
curl -X POST "$NC_URL/api/v3/data/pk3h1xmj0g2bq7d/mw8s2nqz4tv1c6e/records" \
  -H "xc-token: $NC_TOKEN" -H "Content-Type: application/json" \
  -d '[{"fields": {"Title": "Renew TLS certificate", "Status": "Active"}}]'
```

Responses are `{"records": [{"id": 10, "fields": {...}}]}`. Other routes: `PATCH` and `DELETE` on `/records`, `GET /records/{recordId}`, `POST /records/upsert`, `GET /count`. The older v2 API (`/api/v2/tables/{tableId}/records`, responses with `list` and `pageInfo`, `limit`/`offset` parameters) still exists. The default rate limit is 5 requests per second per user; HTTP 429 means wait 30 seconds. Endpoint reference: data-apis-v3.nocodb.com and meta-apis-v3.nocodb.com; a Swagger UI is available per base.

### 4. Webhooks

Per table, Tools, Webhooks. Webhook v3 has three record events, after insert, after update and after delete, each covering single and bulk operations, plus a "Send everything" trigger and field-level triggers (fire only when `Status` changes). Payloads carry a version field; the older v2 webhook model with separate bulk events is deprecated.

## Examples

### Example 1: "Put a spreadsheet UI on our Postgres orders database"

```bash
docker run -d --name noco -v "$(pwd)"/nocodb:/usr/app/data/ -p 8080:8080 \
  -e NC_AUTH_JWT_SECRET="${NOCODB_JWT_SECRET}" nocodb/nocodb:latest
```

Sign up, create a base, add an external data source with the orders database host, port, database and a dedicated user. Result: the `orders` and `customers` tables appear as grids; a kanban view stacked by `status` shows the pipeline; no data is copied.

### Example 2: "Collect support requests from a public form and push them to Slack"

Create a `Requests` table (Title, Email, Priority single-select, Status), add a Form view, enable sharing and copy the public link. Add a webhook on "After insert" pointing at your Slack incoming-webhook URL. Result: each submission becomes a row and triggers a POST with the inserted records in the payload; verify with `curl -G` on the v3 records endpoint using `where=(Status,eq,New)`.

## Guidelines

- Set `NC_AUTH_JWT_SECRET` and keep it stable; back up the `/usr/app/data` volume and the metadata database.
- External sources: use a database user with only the privileges NocoDB needs; schema changes made in the UI are real DDL.
- Public form and shared-view links need no login; do not expose tables with private data through them.
- Use scoped tokens with an expiry where the edition allows; never commit tokens, load them from environment variables.
- Pin the image tag in production and read the release notes before upgrading, since metadata migrations run on start.
- The v3 `where` syntax differs slightly from v2: values may be quoted, and a v2 call can opt in by prefixing the clause with `@`.
- Not a replacement for an application backend with complex business logic or transactions across many tables.
