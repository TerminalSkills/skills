---
name: nhost
description: >-
  Nhost is an open-source backend platform built on PostgreSQL, the Hasura
  GraphQL engine, an auth service, S3-compatible file storage and serverless
  functions. Use this skill when asked to set up Nhost, run it locally with the
  Nhost CLI, sign users in with the JavaScript SDK, query the auto-generated
  GraphQL API, upload files, write Nhost functions or define Hasura
  permissions.
license: Apache-2.0
compatibility: "Node.js 18+, Docker and Docker Compose for local development; @nhost/nhost-js v4"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/nhost/nhost
  tags: ["baas", "graphql", "hasura", "postgres", "auth"]
---

# Nhost

## Overview

Nhost bundles Postgres, Hasura (GraphQL), Auth, Storage and Functions behind one project. Develop locally with the Nhost CLI (Docker based), keep configuration, migrations and Hasura metadata in the `nhost/` folder in Git, and deploy to Nhost Cloud or self-host.

The JavaScript SDK is `@nhost/nhost-js` v4 (rewritten in 2025 from OpenAPI specs). The older packages `@nhost/react`, `@nhost/react-apollo`, `@nhost/nextjs` and the v2/v3 `NhostClient({ ... })` style (`nhost.auth.signIn`, `nhost.auth.onAuthStateChanged`, `{ session, error }` return values) are deprecated; do not use them in new code. The npm package called `nhost` (0.1.x) is unrelated and abandoned.

## Instructions

### Local project with the CLI

Docker must be running. Install the CLI with one of:

```bash
npm install -D @nhost/cli          # pinned per project, run with npx nhost
brew install nhost/tap/nhost       # macOS / Linux with Homebrew
```

```bash
npx nhost init          # creates nhost/ (config, migrations, metadata) and functions/
npx nhost up            # starts Postgres, Hasura, Auth, Storage, Functions
npx nhost logs          # follow logs
npx nhost down          # stop the stack
```

Local endpoints (HTTPS on the `local.nhost.run` domain, which resolves to your machine): dashboard `https://local.dashboard.local.nhost.run`, GraphQL `https://local.graphql.local.nhost.run`, auth `https://local.auth.local.nhost.run`, storage `https://local.storage.local.nhost.run`, functions `https://local.functions.local.nhost.run`, Postgres `postgres://postgres:postgres@localhost:5432/local`. `nhost login` is only needed to pull from or deploy to a Cloud project (`nhost init --remote`).

### SDK client and authentication (nhost-js v4)

```bash
npm install @nhost/nhost-js
```

```typescript
// src/lib/nhost.ts
import { createClient } from "@nhost/nhost-js";

export const nhost = createClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN ?? "local",  // "local" for the CLI stack
  region: process.env.NEXT_PUBLIC_NHOST_REGION ?? "local",
});
```

Every call returns `{ body, status, headers }` and throws a `FetchError` (with `.status` and `.body`) on a non-2xx response, so wrap calls in `try/catch` instead of checking an `error` field. Sessions are stored and refreshed automatically by the client.

```typescript
export async function signUp(email: string, password: string) {
  const res = await nhost.auth.signUpEmailPassword({
    email,
    password,
    options: { displayName: "Maria Lopez", metadata: { plan: "free" } },
  });
  return res.body.session;               // may be undefined if email verification is required
}

export async function signIn(email: string, password: string) {
  const res = await nhost.auth.signInEmailPassword({ email, password });
  return res.body.session;               // res.body.mfa is set when MFA is required
}

// OAuth: the SDK builds the URL, you redirect the browser
export function signInWithGoogle() {
  window.location.href = nhost.auth.signInProviderURL("google");
}

// Magic link
export const sendMagicLink = (email: string) =>
  nhost.auth.signInPasswordlessEmail({ email });

// Current user and changes
const session = nhost.getUserSession();   // StoredSession | null
const unsubscribe = nhost.sessionStorage.onChange((s) => console.log(s?.user?.email));

export async function signOut() {
  const s = nhost.getUserSession();
  if (s) await nhost.auth.signOut({ refreshToken: s.refreshToken });
}
```

### GraphQL (auto-generated from Postgres)

Create a table (for example `posts`) in the dashboard or with a migration and Hasura exposes `posts`, `posts_by_pk`, `posts_aggregate`, `insert_posts_one`, and so on. The SDK sends the user's access token, so Hasura applies that user's role permissions.

```typescript
const GET_POSTS = /* GraphQL */ `
  query GetPosts($limit: Int!, $offset: Int!) {
    posts(limit: $limit, offset: $offset, order_by: { created_at: desc },
          where: { published: { _eq: true } }) {
      id title created_at
    }
    posts_aggregate(where: { published: { _eq: true } }) { aggregate { count } }
  }
`;

export async function getPosts(page = 1, pageSize = 20) {
  const res = await nhost.graphql.request<{ posts: { id: string; title: string }[] }>({
    query: GET_POSTS,
    variables: { limit: pageSize, offset: (page - 1) * pageSize },
  });
  if (res.body.errors) throw new Error(res.body.errors[0].message);  // GraphQL errors arrive with HTTP 200
  return res.body.data;
}
```

`nhost.graphql.request` covers queries and mutations only. For subscriptions use a GraphQL WebSocket client such as `graphql-ws` (or Apollo/urql) pointed at `nhost.graphql.url`, passing the access token from `nhost.getUserSession()?.accessToken`.

### Storage

```typescript
export async function uploadAvatar(file: File) {
  const res = await nhost.storage.uploadFiles({ "bucket-id": "default", "file[]": [file] });
  return res.body.processedFiles[0];                       // { id, name, size, ... }
}

export async function privateDownloadUrl(fileId: string) {
  const res = await nhost.storage.getFilePresignedURL(fileId);
  return res.body.url;                                     // time-limited URL
}
```

Buckets (`default` exists out of the box) and their permissions are set in the dashboard or `nhost/config`; Storage permissions come from Hasura rules on `storage.files`.

### Functions

Every `.js`/`.ts` file under `functions/` is an HTTP endpoint that exports a default Express-style handler; all HTTP methods hit the same handler. `functions/send-welcome-email.ts` is served at `https://<subdomain>.functions.<region>.nhost.run/v1/send-welcome-email` (locally `https://local.functions.local.nhost.run/v1/send-welcome-email`). From the SDK: `nhost.functions.fetch("/send-welcome-email", { method: "POST", body: JSON.stringify({ ... }) })`.

### Hasura permissions

Tables are inaccessible to `user` until permissions exist. Metadata lives in `nhost/metadata/databases/default/tables/public_posts.yaml`:

```yaml
table: { name: posts, schema: public }
select_permissions:
  - role: user
    permission:
      columns: [id, title, content, created_at, published, author_id]
      filter:
        _or:
          - published: { _eq: true }
          - author_id: { _eq: X-Hasura-User-Id }
insert_permissions:
  - role: user
    permission:
      columns: [title, content, published]
      set: { author_id: X-Hasura-User-Id }
update_permissions:
  - role: user
    permission:
      columns: [title, content, published]
      filter: { author_id: { _eq: X-Hasura-User-Id } }
```

## Examples

### Example 1: Start a new project and read it from a Vite app

Request: "Set up Nhost locally and show me a signed-in user's posts."

```bash
npm install -D @nhost/cli && npm install @nhost/nhost-js
npx nhost init && npx nhost up
```

Then create `src/lib/nhost.ts` as above with the `local` defaults, sign in with `signIn("maria@northwind.dev", "correct-horse-battery")` and call `getPosts()`. `npx nhost up` prints the service URLs; if the table has no `user` select permission, `getPosts` fails with a Hasura "field 'posts' not found in type: 'query_root'" error, which means the permission is missing, not the table.

### Example 2: Private document upload with an expiring link

Request: "Let users upload a PDF and give them a temporary download link."

Upload with `nhost.storage.uploadFiles({ "bucket-id": "default", "file[]": [pdfFile] })`, store `processedFiles[0].id` in a `documents` table through `insert_documents_one`, and later call `nhost.storage.getFilePresignedURL(id)`. The returned `url` expires; request a new one instead of storing it.

## Guidelines

- Install the CLI from npm as `@nhost/cli` (not `nhost`) or Homebrew; avoid `curl | bash` installers.
- Never ship the Hasura admin secret to the browser; use it only in server code (`withAdminSession` in the SDK) or functions.
- Add permissions for every table and column before exposing it; test with the `user` and `public` roles, not as admin.
- Commit `nhost/` (migrations, metadata, `nhost.toml`) so CI and teammates get the same schema; secrets go in `.secrets`, which must stay out of Git.
- Server-side rendering needs `createServerClient` with a cookie-backed session storage, not the browser client.
- Self-hosting is possible with the open-source services; Nhost Cloud adds managed hosting and Git deployments.
