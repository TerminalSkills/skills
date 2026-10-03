---
name: pocketbase
description: >-
  Assists with building backends using PocketBase, a single-binary backend with embedded SQLite,
  real-time subscriptions, file storage, and authentication. Use when creating MVPs, prototyping
  APIs, configuring collections and API rules, writing pb_hooks, or setting up auth flows. Trigger
  words: pocketbase, backend, sqlite, real-time, single binary, collections, pb.
license: Apache-2.0
compatibility: "Single binary, runs on Linux/macOS/Windows; docs checked against v0.40.4"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: devops
  tags: ["pocketbase", "backend", "sqlite", "real-time", "baas"]
  repository: https://github.com/pocketbase/pocketbase
---

# PocketBase

## Overview

PocketBase is an open-source backend packaged as a single binary (or a Go framework), providing an embedded SQLite database, real-time subscriptions over SSE, file storage, built-in authentication, and a dashboard. It auto-generates a REST-ish API for every collection. The project is still pre-1.0 (v0.40.x at the time of writing): backward compatibility is not guaranteed between releases, so read the changelog before upgrading and pin the version you deploy.

## Instructions

### Run it

- Download the zip for your platform from the GitHub Releases page, check it against `checksums.txt` from the same release (`sha256sum -c --ignore-missing checksums.txt`), unzip it, and run `./pocketbase serve`. It listens on `http://127.0.0.1:8090`: the API is under `/api/`, the dashboard under `/_/`, and files in `pb_public/` are served as static content.
- Create the first superuser from the installer link printed on first start, or with `./pocketbase superuser create admin@shop.dev 'a-long-password'`. (Older material says "admin"; since v0.23 the term is superuser.)
- The binary manages `pb_data/` (database, uploads, backups; keep it out of git), `pb_migrations/` (collection changes as JS files; commit them) and, if you create it, `pb_hooks/`.

### Collections and API rules

- Collection types: base (standard CRUD), auth (users with password, OAuth2, OTP, MFA), view (read-only, backed by a SQL query).
- Every collection has five rules: `listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule`. A rule that is `null` ("locked") means superusers only; an empty string means anyone, including guests; a non-empty string is a filter expression the request must satisfy, e.g. `@request.auth.id != "" && author = @request.auth.id`.
- Rules double as filters on list requests, so a list returns only the rows that match, not a 403.

### JavaScript SDK

```bash
npm install pocketbase
```

- Query: `pb.collection("posts").getList(1, 20, { filter: pb.filter("author = {:uid}", { uid }), sort: "-created", expand: "author" })`. Build filters with `pb.filter()` so user input is bound as parameters rather than concatenated.
- Auth: `pb.collection("users").authWithPassword(email, password)`; the session lives in `pb.authStore`.
- Realtime: `const unsubscribe = await pb.collection("messages").subscribe("*", (e) => ...)`; `e.action` is `create`, `update` or `delete` and `e.record` the row. Call `unsubscribe()` (or `pb.collection("messages").unsubscribe()`) when the view unmounts. The SDK reconnects on its own.

### Server-side JavaScript (`pb_hooks/*.pb.js`)

Files in `pb_hooks/` are loaded at start; on UNIX-based platforms PocketBase restarts itself when they change, elsewhere restart it manually. Handlers must call `e.next()` to continue the chain.

```javascript
// pb_hooks/main.pb.js
onRecordCreateRequest((e) => {
  if (e.record.getString("title").length < 3) {
    throw new BadRequestError("Title must be at least 3 characters");
  }
  e.next();
}, "posts");

onRecordAfterCreateSuccess((e) => {
  console.log("new post", e.record.id);
  e.next();
}, "posts");

routerAdd("GET", "/api/shop/ping/{name}", (e) => {
  return e.json(200, { hello: e.request.pathValue("name") });
});

cronAdd("nightly-cleanup", "0 3 * * *", () => {
  console.log("cleanup ran");
});
```

- Record hooks are `onRecordCreate`, `onRecordUpdate`, `onRecordDelete` (before persisting), `onRecordAfterCreateSuccess` / `...UpdateSuccess` / `...DeleteSuccess` (after commit), and the `...Request` variants for API calls. Pass collection names as trailing arguments to limit them. The old names `onBeforeCreateRecord` / `onAfterUpdateRecord` no longer exist.
- Each handler runs in its own isolated context, so variables or functions declared outside the handler are undefined inside it. Share code through a CommonJS module loaded inside the handler: `const utils = require(`${__hooks}/utils.js`)`. The engine is ES5-style goja, not Node: no `fs`, `fetch` or ESM imports without bundling.
- Routes use `routerAdd(method, path, handler, ...middlewares)` with Go-style `{param}` patterns; add `$apis.requireAuth()` to restrict to signed-in users. Prefix custom `/api/` paths with your app name to avoid clashing with system routes.
- Cron jobs: `cronAdd(id, "* * * * *", fn)`; they also appear under Dashboard > Settings > Crons.

### Deploy and back up

- Run `./pocketbase serve yourdomain.com` for automatic Let's Encrypt HTTPS, or put it behind Caddy or Nginx (set the "User IP proxy headers" in settings, and raise `proxy_read_timeout` so SSE connections survive).
- Use a systemd unit (`Restart=always`, `WorkingDirectory` set to the app directory). In Docker, build your own image around the binary and mount `pb_data/` as a volume; there is no official image, and the docs give a minimal Alpine Dockerfile that downloads the release zip and mounts `/pb/pb_data`.
- Back up with Dashboard > Settings > Backups (scheduled or on demand) before upgrading or running migrations.

## Examples

### Example 1: MVP backend with auth and a posts collection

**User request:** "Set up a PocketBase backend with user auth and a posts collection where only the author can edit."

**Actions:**
1. Run `./pocketbase superuser create admin@shop.dev "$PB_ADMIN_PASSWORD"` then `./pocketbase serve`.
2. In the dashboard, use the built-in `users` auth collection (enable Google OAuth2 in its options if wanted).
3. Create `posts` with `title` (text, required), `body` (editor) and `author` (relation to `users`, single).
4. Set rules: list/view `""`; create `@request.auth.id != ""`; update/delete `author = @request.auth.id`.
5. In the app:

```javascript
import PocketBase from "pocketbase";
const pb = new PocketBase("http://127.0.0.1:8090");
await pb.collection("users").authWithPassword("maria@shop.dev", process.env.SHOP_USER_PASSWORD);
await pb.collection("posts").create({ title: "Hello", body: "First post", author: pb.authStore.record.id });
```

**Result:** a REST API at `/api/collections/posts/records` where guests can read, signed-in users can create, and only the author can change or remove a post. An unsatisfied rule returns 400 on create and 404 on update and delete; 403 is returned only when the rule is locked (`null`) and the caller is not a superuser.

### Example 2: Live chat updates

**User request:** "Enable live updates for a chat app using PocketBase."

**Actions:**
1. Create `messages` with `text`, `sender` (relation to `users`) and `room` (text).
2. Rules: list/view `@request.auth.id != ""`; create `@request.auth.id != "" && sender = @request.auth.id`.
3. Client:

```javascript
const stop = await pb.collection("messages").subscribe("*", (e) => {
  if (e.action === "create") render(e.record);
}, { filter: 'room = "general"' });
```
4. Call `stop()` when leaving the room.

**Result:** every client in `general` receives new messages as they are created, over one SSE connection that the SDK reconnects automatically.

## Guidelines

- Set up SMTP before production: the default sendmail transport is only fine for development, and verification and password-reset mails depend on it.
- Rules default to locked (superusers only), which makes client requests fail until you set them; set every rule deliberately and never leave sensitive data at `""`.
- Use `expand` instead of several round trips, and view collections instead of client-side joins.
- Keep hooks short; do slow work in `cronAdd` jobs or an external worker, since hooks run inside the request.
- Take a backup (and copy `pb_data/`) before upgrading PocketBase, since the project warns about manual migration steps between pre-1.0 releases.
- SQLite is a single-writer database: PocketBase fits MVPs, internal tools and small-to-mid products on one server. It does not scale horizontally; pick PostgreSQL-backed tools when you need multiple writers or replicas.
- Never expose the superuser dashboard credentials in client code; keep them in environment variables.
