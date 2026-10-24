---
name: xano
description: >-
  Xano is a no-code/low-code backend platform for building REST APIs, a PostgreSQL database and user authentication without server code. Use when someone asks to "build a backend with Xano", "create a Xano API", "write XanoScript", "add login and signup to Xano", "connect a frontend to Xano", or "manage a Xano workspace from the CLI". Covers tables, API endpoints, auth, background tasks, webhooks, and the Xano CLI and Developer MCP for working with AI agents.
license: Apache-2.0
compatibility: "A Xano account and workspace. The Xano CLI and Developer MCP need Node.js 20.12+ (the CLI's engines field)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - no-code-backend
    - api-builder
    - database
    - auth
    - xanoscript
---

# Xano — No-Code Backend Builder

## Overview

Xano hosts a PostgreSQL database, REST APIs built from step-by-step "function stacks", authentication, background tasks, webhooks and MCP servers. You build in the visual editor, in XanoScript (a text language that every visual object also has), or with an AI agent. Docs: https://docs.xano.com (an index for agents is at https://docs.xano.com/llms.txt).

Two ways an agent can work with Xano:

- **Local files.** The Xano CLI (`@xano/cli`) pulls a workspace down as `.xs` XanoScript files and pushes changes back; the Developer MCP (`@xano/developer-mcp`) gives the agent XanoScript docs and syntax validation.
- **Plain HTTP.** Every API group has a base URL; any frontend calls it with `fetch`.

## Instructions

### Tables

Every table starts with an `id` field (`int` or `uuid`; the primary key type cannot be changed later). Tables are created in the dashboard or as XanoScript. Table and field syntax from the docs:

```text
table "user" {
  auth = true
  schema {
    int id
    timestamp created_at?=now
    text name filters=trim
    email? email filters=trim|lower
    password? password filters=min:8|minAlpha:1|minDigit:1
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree|unique", field: [{name: "email", op: "asc"}]}
  ]
}
```

`auth = true` marks the table as one whose rows can log in. Other field types include `text`, `int`, `decimal`, `bool`, `timestamp`, `enum`, `json`, `uuid`, and lists such as `text[]`.

### API endpoints

An endpoint (`query` in XanoScript) has inputs, a `stack` of functions, and a `response`. This signup endpoint is from the docs:

```text
query "auth/signup" verb=POST {
  input {
    text name?
    email email? filters=trim|lower
    text password?
  }
  stack {
    db.get user {
      field_name = "email"
      field_value = $input.email
    } as $user

    precondition ($user == null) {
      error_type = "accessdenied"
      error = "This account is already in use."
    }

    db.add user {
      data = {
        created_at: "now"
        name      : $input.name
        email     : $input.email
        password  : $input.password
      }
    } as $user

    security.create_auth_token {
      table = "user"
      extras = {}
      expiration = 86400
      id = $user.id
    } as $authToken
  }
  response = {authToken: $authToken}
}
```

Listing records: `db.query user { return = {type: "list"} } as $users`, then `response = $users`. A list endpoint should take page inputs and return a paginated result.

### Authentication

Enable authentication on a table (table menu, Settings), then set an endpoint's authentication to that table so it requires a token. Tokens are JWE tokens. In an API group, "Add API Endpoint" then "Authentication" adds the pre-built `login`, `signup` and `auth/me` endpoints; `login` and `signup` return an `authToken`.

### Calling Xano from a frontend

Each API group has its own base URL, shown in the dashboard, such as `https://x8ki-letl-twmt.n7.xano.io/api:Qm3vT9aP`. The part after `api:` is generated, so copy the URL rather than guessing it. Keep it in an environment variable.

```typescript
const AUTH_BASE = process.env.NEXT_PUBLIC_XANO_AUTH_URL!;   // base URL of the auth API group
const APP_BASE = process.env.NEXT_PUBLIC_XANO_APP_URL!;     // base URL of the app API group

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const { authToken } = await res.json();
  return authToken;
}

export async function listPosts(token: string, page = 1) {
  const res = await fetch(`${APP_BASE}/posts?page=${page}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

For typed clients, enable combined Swagger/OpenAPI docs in Xano, download the JSON, and have the agent generate the client from it.

### Local development with the CLI and MCP

```bash
npm install -g @xano/cli
xano auth                       # browser sign-in, saves a profile
xano workspace pull -d ./shop-backend
claude mcp add xano -- npx -y @xano/developer-mcp
```

Edit the `.xs` files (the XanoScript Language Server VS Code extension highlights and validates them). Paid plans push through a sandbox first; free plans have no sandbox and push straight to the workspace with `xano workspace push -d ./shop-backend --dry-run`, then without `--dry-run`.

```bash
xano sandbox push -d ./shop-backend --dry-run   # preview
xano sandbox push -d ./shop-backend
xano sandbox review                              # promote in the browser
```

Changes made in the visual builder do not appear locally until you pull again. Ephemeral tenants (`xano-cli/ephemeral` in the docs) give an agent a disposable environment to test in.

### Webhooks, tasks and external calls

- **Incoming webhooks:** a POST endpoint that uses Get All Raw Input to read whatever the sender posts. Verify the sender's signature before trusting the payload.
- **Background tasks:** logic plus a schedule (once or repeating); no inputs or response. A task must be enabled and published.
- **External API Request** function: call another service from a stack. Keep keys in workspace environment variables, not in the stack.

## Examples

### Example 1: Signup and login for a Next.js app

**User request:** "Add email and password accounts to my Xano backend and call them from Next.js."

Steps: enable authentication on the `user` table, create an API group named `auth`, add the pre-built Login, Signup and auth/me endpoints, copy the group's base URL into `NEXT_PUBLIC_XANO_AUTH_URL`, and use `login()` above. Result: `login()` returns an `authToken` string, and `GET /auth/me` with an `Authorization: Bearer` header carrying the token returns the user row; a wrong password returns a non-2xx response.

### Example 2: Review an AI-written endpoint before it ships

**User request:** "Have Claude add a `GET /orders` endpoint with paging to my Xano workspace, but don't touch production."

```bash
xano workspace pull -d ./shop-backend
claude mcp add xano -- npx -y @xano/developer-mcp
# the agent writes shop-backend/api/orders/list_orders_get.xs, validated by the MCP
xano sandbox push -d ./shop-backend --dry-run
xano sandbox push -d ./shop-backend
xano sandbox review
```

Result: the dry run lists the one new endpoint; after the push you test it against the sandbox and promote it in the browser.

## Guidelines

1. Design tables first; Xano can generate CRUD endpoints for them.
2. Keep business rules in function stacks or custom functions, not in the frontend.
3. Use Xano's built-in auth; mark every private endpoint with the auth table.
4. Add page inputs to every list endpoint; unbounded queries get slow.
5. Validate inputs (type, required, filters) on every endpoint, especially public ones.
6. Use Addons for related data in list queries. Raw SQL is available through the Direct Database Query function on plans that include it; check the plan first.
7. Split endpoints into API groups (auth, app, webhooks); each group has its own base URL and can be given its own settings.
8. Set instance API rate limits (docs: Instances, API Rate Limit) and restrict public endpoints.
9. Back up before pushing schema changes: a pushed table change can alter or drop data. Use the sandbox and review the diff.
10. Never put secret keys in client code or in a function stack; use environment variables.
