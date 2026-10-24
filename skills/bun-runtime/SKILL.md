---
name: bun-runtime
description: >-
  Bun — fast all-in-one JavaScript runtime, bundler, test runner, and package
  manager. Use when speeding up Node.js projects, using Bun as a drop-in Node
  replacement, bundling with Bun, or running tests faster. Covers runtime APIs,
  package management, bundling, and Bun-specific features like Bun.serve,
  Bun.file, and bun:sqlite.
license: Apache-2.0
compatibility: "Bun 1.x (checked on 1.4.4). macOS, Linux, Windows. Node.js projects compatible."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/oven-sh/bun
  category: development
  tags: ["bun", "javascript", "runtime", "bundler", "node-alternative"]
  use-cases:
    - "Speed up a Node.js project by switching to Bun as the runtime"
    - "Bundle a TypeScript app with Bun's built-in bundler"
    - "Run Jest-compatible tests faster with bun test"
    - "Build a fast HTTP server with Bun.serve"
    - "Use Bun as a drop-in npm/pnpm replacement"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Bun Runtime

## Overview

Bun is a fast, all-in-one JavaScript toolkit: runtime, package manager, bundler, and test runner. It is Node.js-compatible and dramatically faster at startup, installs, and test runs. Use Bun to speed up existing Node.js projects or build new apps from scratch.

## Instructions

### Installation

```bash
npm install -g bun                 # any platform with Node.js
brew install oven-sh/bun/bun       # macOS / Linux (Homebrew)
scoop install bun                  # Windows (Scoop)

bun --version                      # verify
bun upgrade                        # later: update in place
```

The project also publishes an install script at bun.sh and release archives on GitHub; if you use an archive, check it against the release's `SHASUMS256.txt` before running it.

### Package Manager

Bun's package manager is a drop-in replacement for npm and pnpm:

```bash
bun install              # Install all dependencies (reads package.json)
bun add express          # Add a package
bun add -d typescript    # Add dev dependency
bun remove lodash        # Remove a package
bun update               # Update dependencies within their ranges
bun outdated             # List packages with newer versions
bun audit                # Check for known vulnerabilities
bun install --frozen-lockfile   # CI: fail if the lockfile would change
bun run dev              # Run a package.json script
```

Lockfile: `bun.lock` (text, JSONC), the default in current Bun. Older projects may still have the binary `bun.lockb`; `bun install --save-text-lockfile` writes the text format. Commit the lockfile.

### Runtime

Bun runs `.js`, `.ts`, `.jsx`, `.tsx` files natively — no compilation step needed:

```bash
bun run index.ts         # Run TypeScript directly
bun index.ts             # Shorthand
bun --hot index.ts       # Hot reload on file change
bun --watch index.ts     # Restart on file change
```

Node.js built-ins (`fs`, `path`, `http`, `crypto`, etc.) are fully supported. Native `fetch`, `WebSocket`, and `ReadableStream` are built in.

### HTTP Server with Bun.serve

```typescript
const server = Bun.serve({
  port: 3000,
  // Optional: `routes` maps paths to a Response or handler (params via req.params):
  routes: {
    "/users/:id": (req) => Response.json({ id: req.params.id }),
  },
  // fetch handles everything the routes do not match
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("Hello from Bun!", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (url.pathname === "/json") {
      return Response.json({ message: "fast", runtime: "bun" });
    }

    return new Response("Not Found", { status: 404 });
  },
  error(err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  },
});

console.log(`Listening on http://localhost:${server.port}`);
```

### File I/O with Bun.file

```typescript
// Read file
const file = Bun.file("data.json");
const text = await file.text();
const json = await file.json();

// Write file
await Bun.write("output.txt", "Hello, Bun!");
await Bun.write("data.json", JSON.stringify({ key: "value" }, null, 2));

```

### SQLite with bun:sqlite

Built-in SQLite — no native bindings needed:

```typescript
import { Database } from "bun:sqlite";

const db = new Database("mydb.sqlite");

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL
)`);

const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
insert.run("Alice", "alice@bakery.test");

const getAll = db.prepare("SELECT * FROM users");
const users = getAll.all();
console.log(users);

const getOne = db.prepare("SELECT * FROM users WHERE id = ?");
const user = getOne.get(1);

db.close();
```

### Bundler

```bash
# Bundle a TypeScript app for the browser
bun build src/index.ts --outdir dist --target browser

# Bundle for Node.js with minification
bun build src/index.ts --outdir dist --target node --minify

# Bundle as a single executable
bun build src/cli.ts --compile --outfile mycli
```

Programmatic bundling:

```typescript
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "browser",
  minify: true,
  sourcemap: "external",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}
```

### Test Runner

Bun's test runner is Jest-compatible:

```typescript
// math.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { add, multiply } from "./math";

describe("math", () => {
  test("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  test("multiplies two numbers", () => {
    expect(multiply(4, 5)).toBe(20);
  });
});
```

Mocks, spies and `test.each` are available from `bun:test` as well.

```bash
bun test                     # Run all tests
bun test --watch             # Watch mode
bun test math.test.ts        # Run specific file
bun test --coverage          # With coverage report
bun test --timeout 10000     # Custom timeout (ms, default 5000)
bun test --bail=1            # Stop after the first failure
bun test -u                  # Update snapshots
```

### Environment Variables

```typescript
// Bun reads .env (and .env.local, .env.<NODE_ENV>) automatically — no dotenv needed
const apiKey = process.env.API_KEY;
const port = Bun.env.PORT ?? "3000";
```

### WebSocket Server

```typescript
const server = Bun.serve({
  port: 3001,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return; // Upgraded to WebSocket
    }
    return new Response("Use WebSocket", { status: 426 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
      ws.subscribe("chat");
    },
    message(ws, message) {
      server.publish("chat", message); // Broadcast
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});
```

### Migrating from Node.js

Most Node.js code runs without changes. Key differences:

| Feature | Node.js | Bun |
|---|---|---|
| Package manager | `npm install` | `bun install` |
| Run TypeScript | Needs `ts-node` or build | `bun run index.ts` |
| `.env` loading | Needs `dotenv` | Built-in |
| `fetch` | Needs `node-fetch` (old) | Built-in |
| SQLite | Needs `better-sqlite3` | `bun:sqlite` built-in |
| Test runner | `jest` | `bun test` |

## Examples

### Example 1: Convert an Express service to Bun

> "Switch our orders-api from npm to Bun and keep CI green."

```bash
rm -rf node_modules package-lock.json
bun install                      # writes bun.lock
bun test                         # existing Jest-style tests run as they are
bun --hot src/server.ts          # dev server with hot reload
```

Expected: `bun install` prints the installed package count, `bun test` ends with `N pass, 0 fail`. In CI use `bun install --frozen-lockfile`. If a test fails on a Node-only API, fix that test before merging.

### Example 2: Ship a CLI as one binary

> "Package our report generator as a single executable."

```bash
bun build src/report.ts --compile --outfile report-gen
./report-gen --month 2026-09
```

Expected: `compile  report-gen` in the build output and a self-contained file that runs without Bun installed on the target machine (build for the platform you deploy to).

## Guidelines

- Prefer `bun install` over `npm install` in Bun projects; it is much faster. Do not mix npm and bun lockfiles in one project.
- `bun build` is a bundler and does not type-check; run `tsc --noEmit` (or `bun check`) for types.
- Native Node addons and a few Node APIs may behave differently; run your test suite under Bun before switching production.
- Use `bun:sqlite` instead of `better-sqlite3` for zero-dependency SQLite.
- Use `Bun.file` and `Bun.write` instead of `fs` for simpler file I/O.
- Run TypeScript directly with `bun run` — no build step needed in development.
- Use `bun --hot` for hot reload during development (preserves module state).
- Use `bun build --compile --outfile <name>` to produce a single self-contained executable binary.
- Bun reads `.env` files automatically — remove `dotenv` from your dependencies.
- The `bun:test` module is Jest-compatible; most Jest tests work with zero changes.
