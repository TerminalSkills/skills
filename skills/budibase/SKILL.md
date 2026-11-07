---
name: budibase
description: >-
  Budibase is an open-source platform for building internal tools, workflow automations and AI agents on top of your own databases, with a visual builder and a REST API. Use when a user asks to self-host Budibase with Docker, set its secrets, get an API key, create tables and rows through the public API, search or publish a workspace from a script, or back up a self-hosted install with the budi CLI.
license: Apache-2.0
compatibility: "Docker 24+ (self-hosting), 2 CPU cores and 6 GB RAM recommended; Node.js 22.19+ only for the optional budi CLI"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "budibase, internal-tools, low-code, self-hosted, rest-api"
  repository: https://github.com/Budibase/budibase
---

# Budibase — self-hosted internal tools, automations and agents

## Overview

Budibase lets a team build admin panels, forms, approval workflows and AI agents in a browser builder, with data in its own database (Budibase DB, backed by CouchDB) or in an external SQL, REST or Mongo source. An agent cannot click through the builder, so its useful jobs are: deploy and configure the server, create the first admin, and drive the public REST API (workspaces, tables, rows, users, queries) from scripts. The builder itself stays a human task.

Facts checked against Budibase 3.50.0 and docs.budibase.com: the all-in-one image is `budibase/budibase`, the public API lives under `/api/public/v1`, and what older docs call an "app" is now a "workspace" (both `/applications` and `/workspaces` endpoints exist). The repository is GPL v3; client components are MPL; paid features are under the Business Source License. The self-hosted open-source edition is free; some features and usage limits depend on a license, so check budibase.com/pricing before planning many workspaces or users.

## Instructions

### Deploy the all-in-one image

Pin a release tag, bind to loopback, keep data on a volume. Do not use `latest` for anything you keep.

```bash
export BB_DATA=$HOME/budibase-data
mkdir -p "$BB_DATA"
docker run -d --name budibase \
  -p 127.0.0.1:10000:80 \
  -v "$BB_DATA":/data \
  -e BB_ADMIN_USER_EMAIL=admin@ops.local \
  -e BB_ADMIN_USER_PASSWORD="$BB_ADMIN_PASSWORD" \
  --restart unless-stopped \
  budibase/budibase:v3.50.0

curl -s http://127.0.0.1:10000/health          # prints OK when the proxy is up
curl -s http://127.0.0.1:10000/api/system/status
```

Give it 30 to 60 seconds on first start: CouchDB, MinIO, Redis and the apps/worker services all boot inside one container, and `/health` can answer 502 until they are ready. `BB_ADMIN_USER_EMAIL` and `BB_ADMIN_USER_PASSWORD` create the first admin automatically (they appear in the project's own compose file; the default minimum password length is 12). Without them, open the URL and create the admin in the browser.

### Secrets that must be set for real use

The Docker docs list these variables to set before production. If you leave them out, the image generates UUIDs and writes them to a `.env` file in the mounted `/data` volume, so protect that volume.

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs sessions; changing it logs everyone out |
| `INTERNAL_API_KEY` | Internal service key, make it a long random string |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Object storage credentials |
| `REDIS_PASSWORD` | Redis password |
| `COUCHDB_USER`, `COUCHDB_PASSWORD` | CouchDB admin account |
| `CUSTOM_DOMAIN` | A bare domain such as `ops.example.org`; Budibase then requests a TLS certificate for it |

There is no `API_KEY` environment variable. The key for the public API is per user and is created in the UI (next section).

```bash
docker rm -f budibase
docker run -d --name budibase -p 127.0.0.1:10000:80 -v "$BB_DATA":/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e INTERNAL_API_KEY="$(openssl rand -hex 32)" \
  -e MINIO_ACCESS_KEY="$(openssl rand -hex 12)" -e MINIO_SECRET_KEY="$(openssl rand -hex 24)" \
  -e REDIS_PASSWORD="$(openssl rand -hex 24)" \
  -e COUCHDB_USER=bbadmin -e COUCHDB_PASSWORD="$(openssl rand -hex 24)" \
  budibase/budibase:v3.50.0
```

Generate the values once and store them in a secret manager; reuse the same values whenever the container is recreated on the same volume.

### Get an API key and workspace ID

Sign in as a builder, open the user menu in the top right, choose "View API key" and generate one. Regenerating invalidates the old key. Every public API call sends `x-budibase-api-key`. Calls that touch data (tables, rows, queries) also send `x-budibase-app-id` with the workspace ID, which is the part of the builder URL after `/builder/workspace/`. IDs that contain `_dev_` address the development copy; remove `_dev_` to address the published app.

```bash
export BB_URL=http://127.0.0.1:10000/api/public/v1
export BB_API_KEY=...            # copied from the user menu, never commit it
curl -s -X POST "$BB_URL/applications/search" \
  -H "x-budibase-api-key: $BB_API_KEY" -H "Content-Type: application/json" -d '{}'
```

The response is `{"data":[{"_id":"app_dev_...","name":"...","status":"development"}]}`.

### Create tables and rows

The OpenAPI spec (`packages/server/specs/openapi.yaml` in the repository) lists every endpoint: `/applications` and `/workspaces` (create, get, update, delete, search, publish, unpublish, import, export), `/tables`, `/tables/{tableId}/rows` (create, get, update, delete, `/search`), `/views`, `/queries/search` and `/queries/{queryId}`, `/users`, `/roles/assign`, `/metrics`.

```bash
export BB_APP_ID=app_dev_857e6076a995430bbf368aa73aa4079d
curl -s -X POST "$BB_URL/tables" \
  -H "x-budibase-api-key: $BB_API_KEY" -H "x-budibase-app-id: $BB_APP_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Refunds","primaryDisplay":"order_ref","schema":{
        "order_ref":{"type":"string","name":"order_ref","constraints":{"presence":true}},
        "amount":{"type":"number","name":"amount"},
        "status":{"type":"options","name":"status","constraints":{"inclusion":["pending","approved","rejected"]}}}}'
```

Table creation returns `{"data":{"_id":"ta_...","name":"Refunds",...}}`. Then add and search rows with that table ID:

```bash
export BB_TABLE_ID=ta_5f899a336394472981ca343f8a735996
curl -s -X POST "$BB_URL/tables/$BB_TABLE_ID/rows" \
  -H "x-budibase-api-key: $BB_API_KEY" -H "x-budibase-app-id: $BB_APP_ID" \
  -H "Content-Type: application/json" \
  -d '{"order_ref":"ORD-10482","amount":129.9,"status":"pending"}'

curl -s -X POST "$BB_URL/tables/$BB_TABLE_ID/rows/search" \
  -H "x-budibase-api-key: $BB_API_KEY" -H "x-budibase-app-id: $BB_APP_ID" \
  -H "Content-Type: application/json" \
  -d '{"query":{"string":{"status":"pending"}}}'
```

Search supports `string` (prefix match), `fuzzy` (substring), `range`, `equal`, `notEqual` and `allOr: true` for OR logic; see the `rowSearch` schema in the spec for the full list. Row writes return `{"data":{"_id":"ro_ta_...","type":"row",...}}`.

### Publish a workspace

```bash
curl -s -X POST "$BB_URL/applications/$BB_APP_ID/publish" \
  -H "x-budibase-api-key: $BB_API_KEY" -H "x-budibase-app-id: $BB_APP_ID"
# {"data":{"status":"SUCCESS"}}
```

### Docker Compose and the budi CLI

For more than a trial, the project ships a multi-container compose file (`hosting/docker-compose.yaml`) with separate apps, worker, proxy, CouchDB, MinIO and Redis services; its variables are `JWT_SECRET`, `INTERNAL_API_KEY`, `API_ENCRYPTION_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `REDIS_PASSWORD`, `COUCH_DB_USER`, `COUCH_DB_PASSWORD`, `MAIN_PORT` plus LiteLLM settings for the agent features. The `budi` CLI wraps the compose setup and is published as `@budibase/cli` (3.50.0 on npm).

```bash
npm install -g @budibase/cli
mkdir -p "$HOME/budibase-compose" && cd "$HOME/budibase-compose" || exit 1
budi hosting --init       # writes the compose files and pulls images
budi hosting --start
budi hosting --status
budi hosting --stop
budi backups --help       # export or import a whole self-hosted install as .tar.gz
```

## Examples

### Example 1: Stand up a private Budibase for an ops team

Request: "Run Budibase on this server so the support team can build a refunds tool. Keep it off the public internet for now."

```bash
mkdir -p "$HOME/budibase-data"
docker run -d --name budibase -p 127.0.0.1:10000:80 -v "$HOME/budibase-data":/data \
  -e BB_ADMIN_USER_EMAIL=ops-admin@northwind-shop.test \
  -e BB_ADMIN_USER_PASSWORD="$BB_ADMIN_PASSWORD" \
  budibase/budibase:v3.50.0
sleep 60 && curl -s http://127.0.0.1:10000/health
```

Result: `OK` is printed, the admin can log in at `http://127.0.0.1:10000`, and the data lives in `~/budibase-data`. Next step is a reverse proxy or `CUSTOM_DOMAIN` plus a firewall rule before anyone outside the host uses it.

### Example 2: Seed a Refunds table from a script

Request: "Create a Refunds table in the Refund Desk workspace and load today's three pending refunds."

```bash
curl -s -X POST "$BB_URL/applications/search" -H "x-budibase-api-key: $BB_API_KEY" \
  -H "Content-Type: application/json" -d '{"name":"Refund Desk"}'
# take data[0]._id as BB_APP_ID, then create the table as shown above
for ref in ORD-10482:129.90 ORD-10483:42.00 ORD-10490:310.25; do
  curl -s -X POST "$BB_URL/tables/$BB_TABLE_ID/rows" \
    -H "x-budibase-api-key: $BB_API_KEY" -H "x-budibase-app-id: $BB_APP_ID" \
    -H "Content-Type: application/json" \
    -d "{\"order_ref\":\"${ref%%:*}\",\"amount\":${ref##*:},\"status\":\"pending\"}"
done
```

Result: three `{"data":{"_id":"ro_ta_...",...}}` responses; the rows show up in the builder's Data tab and a row search with `status = pending` returns all three.

## Guidelines

- Pin the image to a release tag (`v3.50.0`), not `latest`; upgrade by changing the tag and keeping the `/data` volume.
- Bind to `127.0.0.1` and put TLS and authentication in front before exposing it. Never publish MinIO, CouchDB or Redis ports.
- Treat the API key as the user's full login: it carries that user's roles. Create a dedicated builder user for automation and keep the key in an environment variable or secret manager.
- Licensed features and limits vary by plan; if an API call is rejected with a usage-limit error, check the plan rather than retrying.
- Before retrying a failed create call, search for the name first so a half-finished request does not leave duplicates.
- The old `apps` wording appears in many tutorials; use the `workspaces` endpoints for new scripts if your version has them, and `/applications` if not.
- `BB_ADMIN_USER_*` only seeds the first admin; change that password after login.
- Not the right tool when you need a public-facing website or a large custom frontend; use a code-first framework. For a comparable visual builder see the appsmith and tooljet skills.
- The agent and AI features need a model provider configured in the builder; do not assume they work offline.
