---
name: n8n
description: >-
  n8n is a fair-code workflow automation platform with a visual editor, webhook and schedule triggers, JavaScript and Python code nodes and 1500+ integrations, self-hosted or in n8n Cloud. Use when a user asks to automate business workflows, connect APIs visually, build integrations between apps, self-host a Zapier alternative, receive webhooks, or create data pipelines with a visual editor.
license: Apache-2.0
compatibility: 'Docker with Compose (self-hosted) or n8n Cloud; n8n 2.x'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: automation
  repository: https://github.com/n8n-io/n8n
  tags: "n8n, workflow, automation, integration, low-code"
---

# n8n

## Overview

n8n is a workflow automation tool you can run yourself or use as n8n Cloud. Workflows are graphs of nodes: triggers (Webhook, Schedule, app events), 1500+ integration nodes, flow logic (IF, Switch, Merge), HTTP Request, and Code nodes. The current stable release is 2.44.6 (the docs track stable and beta separately). The source is "fair-code" under the Sustainable Use License, not an OSI open-source license: free to self-host for internal business use, but reselling it as a hosted service needs a commercial agreement. This skill was checked against the n8n documentation and the `n8n-hosting` repository; the Docker setup was not started here.

## Instructions

### Step 1: Self-host with Docker Compose

Authentication changed in n8n 1.0/2.x: the old `N8N_BASIC_AUTH_*` variables are gone. The first visit to the editor asks you to create the owner account, so do not look for a password in the compose file. Put secrets in an `.env` file next to `compose.yaml` and keep it out of git.

```yaml
# compose.yaml — n8n + PostgreSQL behind a reverse proxy that terminates TLS
services:
  postgres:
    image: postgres:18
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      retries: 10
  n8n:
    image: docker.n8n.io/n8nio/n8n:2.44.6   # pin a version; update on purpose
    restart: always
    ports: ["127.0.0.1:5678:5678"]          # publish to the proxy only, not the internet
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_WEBHOOK_URL: https://n8n.acme-shop.dev/
      N8N_PROXY_HOPS: "1"
      GENERIC_TIMEZONE: Europe/Berlin
      TZ: Europe/Berlin
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: "true"
    volumes: [n8n_data:/home/node/.n8n]
    depends_on:
      postgres: {condition: service_healthy}
volumes:
  n8n_data:
  pgdata:
```

```console
$ printf 'POSTGRES_PASSWORD=%s\nN8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 24)" > .env
$ docker compose up -d
$ docker compose logs -f n8n     # wait for "Editor is now accessible via"
```

- `N8N_ENCRYPTION_KEY` encrypts stored credentials. Set it once; if it is lost or changed, saved credentials cannot be decrypted. Back it up with the volume.
- `N8N_WEBHOOK_URL` (n8n 2.30+; the old name `WEBHOOK_URL` is deprecated from 2.35) must be the public URL, otherwise webhook URLs shown in the editor point to localhost. The reverse proxy must forward `X-Forwarded-For`, `-Host` and `-Proto`.
- Quick local try-out without Postgres: `docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n`, then open http://localhost:5678.
- Update by raising the image tag, `docker compose pull`, `docker compose up -d`.

### Step 2: Webhook trigger

A Webhook node has two URLs. The test URL (`/webhook-test/<path>`) works only while you press "Listen for Test Event" and shows the data in the editor. The production URL (`/webhook/<path>`) is registered when the workflow is published, and runs appear in the Executions tab. Setting path `order-received` gives:

```console
$ curl -s -X POST https://n8n.acme-shop.dev/webhook/order-received \
    -H 'Content-Type: application/json' \
    -d '{"order_id": "A-10432", "customer": "Maria.Lopez@acme-shop.dev", "total": 149.90}'
{"message":"Workflow was started"}
```

The JSON body arrives under `$json.body` in later nodes (the request headers and query are siblings: `$json.headers`, `$json.query`). Protect public webhooks with the node's Authentication option (header or basic auth) so strangers cannot trigger the workflow.

### Step 3: Code node

The Code node runs in "Run Once for All Items" (default) or "Run Once for Each Item" mode. In all-items mode, read input with `$input.all()` and return an array of `{ json: {...} }`:

```javascript
// Code node (JavaScript), mode: Run Once for All Items
return $input.all().map(item => {
  const order = item.json.body;
  return {
    json: {
      orderId: order.order_id,
      email: order.customer.toLowerCase(),
      total: order.total,
      isLarge: order.total > 100,
    },
  };
});
```

- Python was Pyodide-based in 1.x and the Pyodide runtime is removed in 2.0. Native Python runs through task runners in external mode (stable in 2.x; the compose file above has none, so add the `n8nio/runners` service from the `n8n-hosting` repository first) and only offers `_items` (all-items mode) and `_item` (per-item mode); n8n's other `$` helpers are not available there.
- On self-hosted n8n you can allow extra npm modules via environment settings; on Cloud only `crypto` and `moment` are available.

### Step 4: Build, publish and manage

1. Build the flow in the editor, run it with "Execute workflow" and check each node's output.
2. Click Publish to activate triggers (in 2.x "publish" replaced "activate").
3. Back up and move workflows with the CLI inside the container:

```console
$ docker compose exec n8n n8n export:workflow --all --output=/home/node/.n8n/workflows.json
$ docker compose exec n8n n8n import:workflow --input=/home/node/.n8n/workflows.json
```

## Examples

### Example 1: Large orders to Slack and a spreadsheet

User request: "When our shop sends an order, post it to #sales if it is over 100 euros and always log it in Google Sheets."

Workflow: Webhook (POST, path `order-received`, header auth) -> Code node above -> IF (`{{ $json.isLarge }}` is true) -> Slack "Send a message" to `#sales` with text `New order {{ $json.orderId }}: {{ $json.total }} EUR`; the Code node output also goes to Google Sheets "Append row" on the sales sheet. Credentials for Slack and Google are created once under Credentials and picked in each node. Result: after a `curl` like the one in Step 2 the Executions tab shows a green run, the Slack message appears, and one new row lands in the sheet.

### Example 2: Nightly cleanup from a schedule

User request: "Every night at 02:00 delete leads older than 90 days from our CRM and email me a count."

Workflow: Schedule Trigger (cron `0 2 * * *`, timezone from `GENERIC_TIMEZONE`) -> HTTP Request GET to the CRM's leads endpoint with a Header Auth credential -> Code node that keeps items where `Date.now() - new Date($json.created_at) > 90*24*3600*1000` -> HTTP Request DELETE per item -> Send Email with `{{ $input.all().length }} leads removed`. Run it manually once with the delete step disabled to check the count before publishing.

## Guidelines

- Never expose the editor without TLS and the owner login; do not publish port 5678 on all interfaces unless a proxy is in front. Keep `.env` and the encryption key out of git.
- Pin the image tag and read the release notes before upgrading; n8n ships a minor version most weeks, and 2.0 removed several 1.x features (Pyodide Python, basic-auth variables).
- Use PostgreSQL, not the default SQLite, for anything beyond experiments, and keep the `/home/node/.n8n` volume (it holds the encryption key).
- Since 2.0, `N8N_BLOCK_ENV_ACCESS_IN_NODE` defaults to `true`, so expressions and Code nodes cannot read environment variables; leave it that way and store API keys in Credentials instead of hard-coding them in nodes.
- High volume or long runs: use queue mode with workers and external task runners (see the `n8n-hosting` repository), and prune old executions.
- n8n is not the right tool for heavy data processing or sub-second request handling; call a service from a node instead.
