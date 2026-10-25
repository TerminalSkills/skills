---
name: drizzle-studio
description: >-
  Explore and manage databases with Drizzle Studio. Use when a user asks to
  browse database contents visually, inspect tables and data, run ad-hoc queries,
  manage database records through a GUI, debug database issues, or use a
  lightweight alternative to pgAdmin or DBeaver. Covers setup with Drizzle ORM,
  standalone usage, data browsing, filtering, and inline editing.
license: Apache-2.0
compatibility: 'Node.js 18+, drizzle-kit 0.31+ and drizzle-orm (PostgreSQL, MySQL, SQLite, SingleStore)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags: "drizzle, database, gui, admin, studio"
  repository: https://github.com/drizzle-team/drizzle-orm
---

# Drizzle Studio

## Overview

Drizzle Studio is a visual database browser and admin tool that runs in your browser. Unlike heavyweight tools like pgAdmin or DBeaver, it starts in one command and works with any Drizzle ORM project. Browse tables, filter data, edit records inline, run SQL queries, and inspect relationships — all through a clean web interface. It is started by `drizzle-kit studio`, which opens a local server and serves the UI from `local.drizzle.studio` in your browser. It supports PostgreSQL, MySQL, SQLite and SingleStore. Drizzle Studio itself is closed source and free for local development; Drizzle Kit and Drizzle ORM are open source.

## Instructions

### Step 1: Install and configure

Studio is a command of `drizzle-kit` and needs `drizzle-orm` installed in the same project (without it the command stops with "Please install latest version of drizzle-orm"). It takes its connection from a config file; it does not read `DATABASE_URL` by itself.

```bash
npm install drizzle-orm
npm install -D drizzle-kit
npx drizzle-kit studio
```

```typescript
// drizzle.config.ts - Studio reads this file by default
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql', // postgresql | mysql | sqlite | turso | singlestore | mssql | cockroach
  schema: './src/db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

The old `driver: 'pg'` and `dbCredentials.connectionString` keys are gone from current Drizzle Kit; use `dialect` and `url`. `driver` now only selects special cases such as `aws-data-api` or `pglite`. For SQLite use `dialect: 'sqlite'` with `url: './dev.db'` and a SQLite driver (for example `better-sqlite3`) installed.

The terminal prints `Drizzle Studio is up and running on https://local.drizzle.studio?port=4983`. Open that link; the page talks to the server on your own machine.

### Step 2: Options, ports and environments

```bash
npx drizzle-kit studio --config=drizzle-staging.config.ts   # another config file
npx drizzle-kit studio --port=4990                          # default port is 4983
npx drizzle-kit studio --verbose                            # print every SQL statement Studio runs
```

- `--host` exists, but `--host=0.0.0.0` exposes your database browser to the network. Leave it at the default loopback address (checked: the server listened only on `127.0.0.1:4983`).
- Keep one config per environment (`drizzle-dev.config.ts`, `drizzle-prod.config.ts`) and choose with `--config`. Load `.env` yourself (`import 'dotenv/config'` at the top of the config) if the variable lives in a file.
- Safari and Brave block requests to localhost. Install `mkcert`, run `mkcert -install`, then restart `drizzle-kit studio`.
- Studio is for local use. For a shared or remote instance Drizzle offers Drizzle Gateway (self-hosted) or a browser extension for serverless vendors; do not run `drizzle-kit studio` on a public server.

### Step 3: What you can do in the UI

- Browse tables and schemas, page through rows, filter and sort by columns, follow relations defined in your Drizzle schema.
- Edit cells, add rows and delete rows; changes go to the database right away, there is no undo.
- Run SQL in the SQL runner and read results as a table.

## Examples

### Example 1: Debug production data issues
**User prompt:** "I need to quickly inspect the users table and find all accounts created in the last 24 hours that haven't verified their email."

The agent will:
1. Create `drizzle-readonly.config.ts` whose `dbCredentials.url` reads `process.env.READONLY_DATABASE_URL` (a role with SELECT only).
2. Run `npx drizzle-kit studio --config=drizzle-readonly.config.ts` and open the printed `local.drizzle.studio` link.
3. Open the `users` table and filter `email_verified = false` and `created_at` after yesterday, or paste the same condition into the SQL runner.
4. Report the matching rows back to the user.

### Example 2: Inspect a local SQLite database
**User prompt:** "Show me what is in dev.db after my seed script ran."

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  dbCredentials: { url: './dev.db' },
})
```

```bash
npm install drizzle-orm better-sqlite3
npx drizzle-kit studio --port=4990
```

Open `https://local.drizzle.studio?port=4990`, check that the seeded rows are in each table, and stop the server with Ctrl+C when finished.

## Guidelines

- Use read-only database credentials when browsing production data; Studio edits and deletes immediately.
- Do not bind Studio to `0.0.0.0` or put it on a public host: anyone who reaches the port can read and change the data.
- `drizzle-kit studio` requires `drizzle-orm` in the project and a config with `dialect` and `dbCredentials`. Config keys from old Drizzle Kit versions (`driver: 'pg'`, `connectionString`) are not part of the current config format.
- Studio is a development and debugging tool, not an admin panel for end users; build real access control for that.
- Starting the command in a foreground shell blocks it; an agent should run it in the background and stop it by PID when done.
