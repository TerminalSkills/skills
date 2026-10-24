---
name: appwrite
description: >-
  Build backends with Appwrite — open-source Backend-as-a-Service. Use when a
  user asks to set up user authentication, manage a database without writing
  backend code, handle file storage and uploads, add realtime subscriptions, set
  up cloud functions, build a mobile or web app backend, replace Firebase with
  an open-source alternative, or self-host a BaaS platform. Covers auth,
  databases, storage, functions, realtime, and SDK integration for web, mobile,
  and server-side.
license: Apache-2.0
compatibility: 'Docker (self-hosted) or Appwrite Cloud'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - appwrite
    - backend
    - auth
    - database
---

# Appwrite

## Overview

Appwrite is an open-source Backend-as-a-Service (BaaS) providing authentication, databases, file storage, cloud functions, and realtime subscriptions — all through a single self-hosted Docker deployment. It's the open-source alternative to Firebase, with SDKs for web (JavaScript), mobile (Flutter, Swift, Kotlin), and server-side (Node.js, Python, PHP). This skill covers self-hosting setup, authentication, database operations, file storage, serverless functions, and realtime subscriptions.

## Instructions

### Step 1: Self-Hosted Deployment

The installer starts a web setup wizard on port 20080 (open it in your firewall only while installing). Use the release tag the installation docs name (2.6.1 at the time of writing).

```bash
docker run -it --rm \
  --publish 20080:20080 \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$(pwd)/appwrite:/usr/src/code/appwrite:rw" \
  --entrypoint="install" \
  appwrite/appwrite:2.6.1
```

Open http://localhost:20080, choose the hostname, the database (PostgreSQL is the default; MariaDB and MongoDB are options), save the generated secret key, and create the console account. Requirements: 2 CPU cores, 4 GB RAM, 2 GB swap, Docker Compose v2. After install the console is at `http://localhost/console`; create a project there and copy its project ID. Appwrite Cloud needs no install: use the endpoint `https://<region>.cloud.appwrite.io/v1` shown in the console settings.

### Step 2: Authentication

The Web SDK (`appwrite`, 29.x) takes a single object of named parameters.

```javascript
// lib/appwrite.js
import { Client, Account, ID, OAuthProvider } from 'appwrite'

export const client = new Client()
  .setEndpoint('http://localhost/v1')
  .setProject('66f0c1a2003b7e5d9a41')   // project ID from the console

export const account = new Account(client)

export async function signUp(email, password, name) {
  const user = await account.create({ userId: ID.unique(), email, password, name })
  await account.createEmailPasswordSession({ email, password })
  return user
}

export const login = (email, password) =>
  account.createEmailPasswordSession({ email, password })

// OAuth (the provider must be enabled in Auth > Settings)
export const loginWithGoogle = () =>
  account.createOAuth2Session({
    provider: OAuthProvider.Google,
    success: 'http://localhost:3000/callback',
    failure: 'http://localhost:3000/login',
  })

export async function getCurrentUser() {
  try { return await account.get() } catch { return null }   // not logged in
}

export const logout = () => account.deleteSession({ sessionId: 'current' })
```

The platform (web origin or app ID) must be added under the project's Platforms, otherwise browser calls fail with a CORS error.

### Step 3: Database Operations (TablesDB)

In current Appwrite releases the primary database API is **TablesDB**: databases contain tables, tables have columns and rows. The older `Databases` API (collections, attributes, documents) still exists as a legacy API with the same data model; use it only for existing code.

```javascript
// lib/database.js
import { TablesDB, ID, Query, Permission, Role } from 'appwrite'
import { client } from './appwrite'

const tablesDB = new TablesDB(client)
const DATABASE_ID = 'main'
const TABLE_ID = 'posts'

export function createPost(title, content, authorId) {
  return tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLE_ID,
    rowId: ID.unique(),
    data: { title, content, author_id: authorId, status: 'draft' },
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(authorId)),
      Permission.delete(Role.user(authorId)),
    ],
  })
}

export function listPublishedPosts(page = 1, limit = 10) {
  return tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLE_ID,
    queries: [
      Query.equal('status', 'published'),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
      Query.offset((page - 1) * limit),
    ],
  })
}

export const publishPost = (rowId) =>
  tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: TABLE_ID, rowId, data: { status: 'published' } })

export const deletePost = (rowId) =>
  tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: TABLE_ID, rowId })
```

Columns (title, content, status, author_id) must be created in the console or through the API before rows can be written. Every row has `$id`, `$createdAt`, `$updatedAt` and `$permissions` automatically. A list call returns 25 rows by default; use `Query.limit` and `Query.offset` or `Query.cursorAfter` for pagination.

### Step 4: File Storage

```javascript
// lib/storage.js
import { Storage, ID } from 'appwrite'
import { client } from './appwrite'

const storage = new Storage(client)
const BUCKET_ID = 'uploads'

// file: a File from <input type="file">
export const uploadFile = (file) =>
  storage.createFile({ bucketId: BUCKET_ID, fileId: ID.unique(), file })

// These return a URL you can use as an image source or download link
export const getFilePreview = (fileId) =>
  storage.getFilePreview({ bucketId: BUCKET_ID, fileId, width: 400, height: 300 })

export const getFileDownload = (fileId) =>
  storage.getFileDownload({ bucketId: BUCKET_ID, fileId })

export const deleteFile = (fileId) =>
  storage.deleteFile({ bucketId: BUCKET_ID, fileId })
```

Create the bucket in the console first; set its maximum file size, allowed extensions and permissions there. Previews work for images only.

### Step 5: Cloud Functions

A function receives a context with `req`, `res`, `log` and `error`. Use `req.bodyJson` (parsed) or `req.bodyText`; the old `req.body` and `res.send` are deprecated (use `req.bodyText`/`req.bodyJson` and `res.text`/`res.json`). Inside a function the runtime supplies a short-lived key in the `x-appwrite-key` header, so you do not create or store an API key for calls to the same project.

```javascript
// functions/on-order-created/src/main.js
// Trigger: event tablesdb.main.tables.orders.rows.*.create (set in the function's Settings > Events)
import { Client, Users } from 'node-appwrite'

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'])

  const order = req.bodyJson          // the row that fired the event
  log(`New order: ${order.$id}, total: ${order.total}`)

  try {
    const user = await new Users(client).get({ userId: order.user_id })
    log(`Order by: ${user.email}`)
  } catch (e) {
    error(`Cannot load user: ${e.message}`)
    return res.json({ success: false }, 500)
  }
  return res.json({ success: true, orderId: order.$id })
}
```

Deploy with the CLI (`npm install -g appwrite-cli`, or `brew install appwrite`): `appwrite login`, then `appwrite init functions` to scaffold and `appwrite push functions` to deploy. Pull existing config with `appwrite pull functions`. `appwrite deploy` is the old command; do not use it. The key from `x-appwrite-key` only carries the scopes you selected for the function in the console.

### Step 6: Realtime Subscriptions

The Web SDK has a `Realtime` class and a `Channel` helper; the older `client.subscribe(...)` is replaced by it.

```javascript
// lib/realtime.js
import { Realtime, Channel } from 'appwrite'
import { client } from './appwrite'

const realtime = new Realtime(client)

export async function watchMessages(onChange) {
  const subscription = await realtime.subscribe(
    Channel.tablesdb('main').table('messages').row(),   // any row in the table
    (response) => {
      const event = response.events[0]
      if (event.endsWith('.create')) onChange('created', response.payload)
      else if (event.endsWith('.update')) onChange('updated', response.payload)
      else if (event.endsWith('.delete')) onChange('deleted', response.payload)
    }
  )
  return subscription      // call await subscription.unsubscribe() to stop
}
```

Subscriptions follow row permissions: a user only receives events for rows they can read. Call `realtime.disconnect()` to close the socket. Server SDKs with an API key cannot use Realtime.

## Examples

### Example 1: Build a full-stack app with auth, database, and file uploads
**User prompt:** "I want to build a recipe sharing app. Users sign up, post recipes with photos, and browse others' recipes. Use an open-source backend I can self-host."

The agent will:
1. Install Appwrite with the Docker installer, pinned to the release in the docs.
2. Set up authentication with email/password and Google OAuth.
3. Create a TablesDB table `recipes` (columns title, ingredients, steps, author_id, image_id).
4. Configure file storage bucket for recipe photos with size limits.
5. Build a Next.js frontend using the Appwrite Web SDK.
6. Set row permissions (`Permission.update(Role.user(authorId))`, `Permission.read(Role.any())`) so only the author edits a recipe and everyone reads it.

### Example 2: Replace Firebase with a self-hosted alternative
**User prompt:** "We're using Firebase but want to self-host for data sovereignty. Migrate our auth, Firestore, and storage to something open-source."

The agent will:
1. Deploy Appwrite on the target server.
2. Export users from Firebase Auth, import to Appwrite.
3. Map Firestore collections to Appwrite tables, and fields to typed columns.
4. Migrate storage files using the Appwrite Server SDK.
5. Update frontend code to use Appwrite SDK (similar API surface to Firebase).

## Guidelines

- Appwrite runs as a stack of Docker containers (API, workers, database, cache, proxy). Plan for 2 CPU cores, 4 GB RAM and 2 GB swap at minimum. Pin the image version and read the migration notes before upgrading.
- Create indexes in the console for columns you filter or sort on; unindexed queries get slow as tables grow.
- Permissions use `Permission.read(Role.any())`, `Role.user(id)`, `Role.team(id)` and similar. A row with no permissions is invisible to client users, so set them explicitly for content users should see.
- Server SDKs (`node-appwrite`, Python, PHP) authenticate with an API key, bypass row permissions and must stay on the server. Never ship an API key in browser or mobile code.
- Appwrite manages sessions and OAuth tokens itself; do not build your own JWT handling for normal logins.
- Self-hosting means you own backups, TLS and updates; the installer binds the Docker socket, so run it only on a host you control.
