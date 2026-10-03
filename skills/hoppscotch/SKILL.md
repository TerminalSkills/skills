---
name: hoppscotch
description: >-
  Hoppscotch is an open-source API client for sending and testing REST,
  GraphQL, WebSocket, SSE, Socket.IO and MQTT requests from the browser,
  desktop app or a self-hosted server. Use when a user asks to test or debug
  API endpoints, organize requests into collections, run API tests in CI with
  the hopp CLI, self-host Hoppscotch, or find an open-source Postman
  alternative.
license: Apache-2.0
compatibility: "Web app (hoppscotch.io), desktop app, or self-hosted with Docker and PostgreSQL; CLI needs Node.js 22+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - hoppscotch
    - api-testing
    - postman
    - rest
    - graphql
  repository: https://github.com/hoppscotch/hoppscotch
---

# Hoppscotch

## Overview

Hoppscotch is an open-source API development tool and a lighter alternative to Postman. It sends REST, GraphQL, WebSocket, Server-Sent Events, Socket.IO and MQTT requests, with collections, environments, pre-request scripts, tests and code-snippet generation. It runs as a web app at hoppscotch.io (no account needed for quick requests), as a desktop app, or as a self-hosted instance (Community Edition is MIT licensed; Enterprise adds SSO, SCIM and audit features). Releases are date-versioned; the latest checked is 2026.9.0, and the `@hoppscotch/cli` package is 0.31.x and still labelled alpha.

## Instructions

### Step 1: Send a request and keep it

In the app choose a method, enter the URL, add headers, params, auth or a body, and press Send. Save the request into a collection. Use environments for values that change between servers: a variable `baseUrl` is referenced in URLs, headers and bodies as `<<baseUrl>>`. Browser requests are subject to CORS, so on the web app switch the interceptor to the Hoppscotch Agent (or use the desktop app, which has a native interceptor).

Import from Postman, Insomnia, OpenAPI or HAR through the Importer. Imported Postman scripts are converted only after you consent, and some `pm.*` features (for example `pm.collectionVariables`) are not supported.

### Step 2: Scripts

Pre-request scripts and test scripts are JavaScript. The `hopp` namespace is the current API (experimental sandbox, on by default); the older `pw` namespace still works for existing scripts, and the docs advise against bulk-migrating them yet.

```javascript
// Pre-request: fetch a token once, then attach it to this request
if (!hopp.env.get("accessToken")) {
  const res = await fetch(hopp.env.get("baseUrl") + "/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: hopp.env.get("clientId"),
      client_secret: hopp.env.get("clientSecret"),
    }),
  });
  hopp.env.set("accessToken", (await res.json()).access_token);
}
hopp.request.setHeader("Authorization", "Bearer " + hopp.env.get("accessToken"));
```

```javascript
// Test script
hopp.test("order is created", () => {
  hopp.expect(hopp.response.statusCode).toBe(201);
  const order = hopp.response.body.asJSON();
  hopp.expect(order.items).toHaveLength(2);
});
```

Other helpers: `hopp.env.set/get/delete/reset`, `hopp.env.global.*`, `hopp.request.setUrl/setMethod/setParam/setBody`, `hopp.response.headers/responseTime`, `hopp.cookies.*`. The legacy equivalents are `pw.env.get/set/unset`, `pw.response.status`, `pw.test`, `pw.expect`. There is no `pw.api` helper; use `fetch` for extra HTTP calls (prefer the Agent or Native interceptor in the app).

### Step 3: Run collections from the CLI

```bash
npm install -g @hoppscotch/cli       # requires Node.js 22+; build tools (python3, make, g++) on Linux
hopp --version

# a collection file exported from the app, with an exported environment file
hopp test -e staging.json orders-api.json
hopp test -e staging.json -d 500 orders-api.json --reporter-junit reports/orders-junit.xml

# several rounds with CSV data (header row = variable names)
hopp test orders-api.json --iteration-count 3 --iteration-data customers.csv

# a collection stored in a team workspace (personal workspace collections cannot be run this way)
hopp test clxsntdgh0000lcx9fnits2h8 --token "$HOPP_TOKEN" --server https://hoppscotch.brewline.dev
```

`-e` accepts an environment file or, with a token, an environment id. Create the personal access token in the app under settings; keep it in a CI secret. Exit code is non-zero if any test fails, so the command works as a CI gate. GraphQL requests in a collection run as HTTP POSTs; subscriptions cannot run in the CLI and are reported as errors.

### Step 4: Self-host

Community Edition needs PostgreSQL and a `.env` file (values unquoted) with at least `DATABASE_URL`, a 32-character `DATA_ENCRYPTION_KEY`, `WHITELISTED_ORIGINS`, the `VITE_BASE_URL` / `VITE_ADMIN_URL` URLs and the three `VITE_BACKEND_*` URLs, plus an auth provider (see the Community Edition prerequisites page). The all-in-one image runs the app on 3000, admin dashboard on 3100 and backend on 3170:

```bash
docker pull hoppscotch/hoppscotch
docker run -p 3000:3000 -p 3100:3100 -p 3170:3170 --env-file .env --restart unless-stopped hoppscotch/hoppscotch
```

Before the first start the database needs its tables: open a shell in the image (`docker run -it --entrypoint sh --env-file .env hoppscotch/hoppscotch`) and run `pnpm exec prisma migrate deploy`. Then open the admin dashboard on port 3100 to create the admin account. Individual images `hoppscotch/hoppscotch-frontend`, `-backend` and `-admin` exist for split deployments; a Helm chart covers Kubernetes. For the desktop app, enable subpath access (`ENABLE_SUBPATH_BASED_ACCESS=true`) and expose port 3200 of the frontend.

### Step 5: Let an agent drive it (optional)

Hoppscotch ships an MCP server that exposes collections, environments and request execution to an agent. Register it with `claude mcp add -s user hoppscotch -- npx -y @hoppscotch/mcp-server` (Node.js 22+; sign in with a Cloud or self-hosted account).

## Examples

### Example 1: "Smoke-test the orders API in CI before every deploy"

Export the collection `orders-api.json` and the `staging` environment from the app, commit both, and add a CI step:

```bash
npm install -g @hoppscotch/cli
hopp test -e environments/staging.json orders-api.json --reporter-junit reports/orders-junit.xml
```

Result: each request prints its status and time, each `hopp.test` prints a check mark or a failure, and the job fails on the first broken assertion. Verified on a minimal collection against `https://echo.hoppscotch.io`: output ends with `Test Cases: 0 failed 2 passed` and a JUnit file is written.

### Example 2: "Run Hoppscotch for our team on our own server"

Provision PostgreSQL, write `.env` with the URLs of your host, start the AIO container with the command above, run `pnpm exec prisma migrate deploy`, and open port 3100 to sign in as admin. Invite teammates there; shared workspaces then hold collections and environments for everyone, and CI jobs use `--server` and a personal access token.

## Guidelines

- Keep secrets (`clientSecret`, tokens) in secret environment variables, not in exported collection files that go to Git.
- The CLI is alpha and requires Node.js 22 or newer; pin the version in CI and read release notes before upgrading (it follows 0.x versioning, so a minor bump can break).
- Test scripts decide what counts as failure: a 404 is a valid response to the CLI, so assert on `hopp.response.statusCode`.
- Browser CORS errors are an interceptor problem, not an API bug; switch to the Agent or desktop app.
- Self-hosted instances send anonymous telemetry unless you opt out (see the telemetry page); do not expose ports 3100 and 3170 publicly without a reverse proxy and TLS.
- Not a fit for load testing; use a tool such as k6 for that. For heavy mock-server or contract-testing workflows, look at Postman or Bruno.
