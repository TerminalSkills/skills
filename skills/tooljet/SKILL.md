---
name: tooljet
description: >-
  ToolJet is an open-source (AGPL-3.0) low-code platform for building internal tools such as admin panels, dashboards and CRUD apps with a drag-and-drop builder, SQL and REST queries, and JavaScript or Python. Use when a user asks to build an internal tool or admin dashboard, connect a database or API to a visual app, write ToolJet queries and event handlers, or self-host ToolJet with Docker or Helm.
license: Apache-2.0
compatibility: "Docker or Kubernetes for self-hosting, PostgreSQL, a modern browser; ToolJet Cloud needs only an account"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/ToolJet/ToolJet
  tags: ["internal-tools", "low-code", "open-source", "admin-panel", "self-hosted"]
---
# ToolJet — Open-Source Low-Code App Builder

## Overview

ToolJet (github.com/ToolJet/ToolJet, docs.tooljet.com) lets you build internal tools in a browser: drag components (tables, forms, charts) onto a canvas, write queries against 80+ data sources, and bind the two with `{{ }}` expressions. Four data sources are always present: ToolJet Database (built-in, hosted with the instance), REST API, Run JavaScript and Run Python. Apps can have several pages, and workflows run background jobs. The community edition is AGPL-3.0; AI app generation and some governance features belong to the paid edition. Most of ToolJet is configured in the web UI, so an agent's job is mainly setup, query code, expressions and deployment.

## Instructions

### Self-host

Quick evaluation on one machine (not for production; data lives in the named volume):

```bash
docker run --name tooljet --restart unless-stopped -p 80:80 \
  --platform linux/amd64 -v tooljet_data:/var/lib/postgresql/13/main \
  tooljet/try:ee-lts-latest
```

Production uses Docker Compose with the `tooljet/tooljet:ee-lts-latest` image (the LTS line; new LTS versions ship every 3 to 5 months, so pin an exact tag from Docker Hub in production). The docs provide a compose file and an `.env` template:

```bash
# Save the two files linked from the Docker page of the ToolJet setup docs
# (docker-compose-db.yaml as docker-compose.yaml, .env.internal.example as .env).
# ToolJet publishes no checksums for them, so read both before using them.
mkdir postgres_data
less docker-compose.yaml .env
# edit .env: set TOOLJET_HOST (with protocol), LOCKBOX_MASTER_KEY, SECRET_KEY_BASE, PG_* and TOOLJET_DB credentials

# Pin the image: resolve the floating tag to its digest once and write the digest into the compose file
docker pull tooljet/tooljet:ee-lts-latest
PINNED=$(docker inspect --format '{{index .RepoDigests 0}}' tooljet/tooljet:ee-lts-latest)
sed -i "s|image: tooljet/tooljet:ee-lts-latest|image: ${PINNED}|" docker-compose.yaml
docker compose up -d
```

Upgrades are then deliberate: pull the tag again, read the release notes, and replace the digest.

Key variables: `TOOLJET_HOST` must include `http://` or `https://`; `LOCKBOX_MASTER_KEY` encrypts stored data-source credentials and `SECRET_KEY_BASE` signs sessions. Generate them with `openssl rand -hex 32` and back them up, because losing `LOCKBOX_MASTER_KEY` makes saved credentials unreadable. The UI is on port 80. For separate worker containers or multiple pods, use an external Redis and set `WORKER=true` on worker containers.

Kubernetes: the docs show a kubectl manifest and a Helm chart (repository `ToolJet/helm-charts` on GitHub); you must provide the PostgreSQL database or keep the chart's bundled one for testing. ToolJet Cloud (tooljet.com) is the hosted alternative.

### Queries and transformations

Queries reference components, other queries and variables with `{{ }}`:

```sql
-- Query name: getOrders (PostgreSQL data source)
SELECT o.id, o.amount, o.created_at, u.email
FROM orders o JOIN users u ON u.id = o.user_id
WHERE o.status = '{{components.statusFilter.value}}'
ORDER BY o.created_at DESC
LIMIT 200;
```

Prefer the data source's parameterized/bind mode for user-controlled values where the connector offers it; interpolating component values into SQL strings is open to injection.

Run JavaScript queries have `moment`, `_` (Lodash) and `axios` available, can read `queries.<name>.data` and must `return` their result:

```javascript
// Query name: ordersForTable (Run JavaScript)
return queries.getOrders.data.map(row => ({
  ...row,
  amount_display: `$${(row.amount / 100).toFixed(2)}`,
  created_display: moment(row.created_at).fromNow(),
}));
```

Bind a table's data to `{{queries.ordersForTable.data}}`.

### Events and actions

Event handlers are configured in the UI (component or query, event, action) or in a Run JavaScript query:

```javascript
// Query name: refundSelectedOrder
const order = components.ordersTable.selectedRow;
if (order.status === 'refunded') {
  actions.showAlert('warning', 'Order already refunded');
  return;
}
await queries.processRefund.run();
actions.showAlert('success', `Refund of $${(order.amount / 100).toFixed(2)} processed`);
await queries.getOrders.run();
await actions.switchPage('orders', [['highlight', order.id]]);
```

`queries.<name>.run()` also takes parameters and callbacks: `queries.getUsers.run({ limit: 10 }, { onSuccess: (data) => {}, onFailure: (error) => {} })` (pass `{}` when there are no parameters). Alert types are `info`, `success`, `warning` and `danger`. Navigation uses `actions.switchPage('orders', [['status', 'open']])`; the query pairs appear in the page URL.

## Examples

### Example 1: Self-host ToolJet for an internal team

**User request:** "Set up ToolJet on our server at https://tools.northwind-logistics.com."

Download the compose file and `.env` template, set `TOOLJET_HOST=https://tools.northwind-logistics.com`, generate `LOCKBOX_MASTER_KEY` and `SECRET_KEY_BASE` with `openssl rand -hex 32`, run `docker compose up -d`, and put a TLS reverse proxy in front. Opening the URL shows the sign-up or onboarding page for the first account. Check with `docker compose ps` that the containers are up.

### Example 2: Orders dashboard with refunds

**User request:** "Build an orders dashboard with a Refund button."

In the app builder add a PostgreSQL data source, create the `getOrders` query above, drop a Table bound to `{{queries.getOrders.data}}`, add `processRefund` (an UPDATE using `{{components.ordersTable.selectedRow.id}}`), and attach the `refundSelectedOrder` Run JavaScript query to the button's On click event. Clicking Refund shows a green alert and the table reloads.

## Guidelines

- ToolJet is AGPL-3.0: self-hosting is free, but modifying and offering it as a service carries source-sharing obligations; check the license against your use.
- Back up the PostgreSQL database and the `.env` secrets; upgrade by changing the image tag and reading the release notes first.
- Use a read-only database user for dashboards that only display data.
- Restrict app access with ToolJet's user groups and permissions; some governance features (SSO, audit logs, git sync) depend on the edition, so confirm in the docs for your plan.
- Query results and component state live in the browser: do not put secrets in expressions; keep them in data-source configuration.
- Version-pin images and avoid `latest` tags in production.
- For heavy business logic or public-facing apps, use a regular codebase; ToolJet targets internal tools.
