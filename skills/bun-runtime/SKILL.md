---
name: bun-runtime
description: >-
  Bun — fast all-in-one JavaScript runtime, bundler, test runner, and package
  manager. Use when speeding up Node.js projects, using Bun as a drop-in Node
  replacement, bundling with Bun, or running tests faster. Covers runtime APIs,
  package management, bundling, and Bun-specific features like Bun.serve,
  Bun.file, and Bun.sqlite.
license: Apache-2.0
compatibility: "Bun 1.x. macOS, Linux, Windows (experimental). Node.js projects compatible."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: runtime
  tags: ["bun", "javascript", "runtime", "bundler", "fast", "node-alternative"]
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

## Installation

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (via Scoop)
scoop install bun

# Verify
bun --version
```

## Package Manager

Bun's package manager is a drop-in replacement for npm and pnpm:

```bash
bun install              # Install all dependencies (reads package.json)
bun add express          # Add a package
bun add -d typescript    # Add dev dependency
bun remove lodash        # Remove a package
bun update               # Update all packages
bun run dev              # Run a package.json script
```

Lockfile: `bun.lockb` (binary, faster than package-lock.json).

## Runtime

Bun runs `.js`, `.ts`, `.jsx`, `.tsx` files natively — no compilation step needed:

```bash
bun run index.ts         # Run TypeScript directly
bun index.ts             # Shorthand
bun --hot index.ts       # Hot reload on file change
bun --watch index.ts     # Restart on file change
```

Node.js built-ins (`fs`, `path`, `http`, `crypto`, etc.) are fully supported. Native `fetch`, `WebSocket`, and `ReadableStream` are built in.

## HTTP Server with Bun.serve

```typescript
const server = Bun.serve({
  port: 3000,
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

## File I/O with Bun.file

```typescript
// Read file
const file = Bun.file("data.json");
const text = await file.text();
const json = await file.json();
const buffer = await file.arrayBuffer();

// Write file
await Bun.write("output.txt", "Hello, Bun!");
await Bun.write("data.json", JSON.stringify({ key: "value" }, null, 2));

// Stream large files
const stream = file.stream();
```

## SQLite with Bun.sqlite

Built-in SQLite — no native bindings needed:

```typescript
import { Database } from "bun:sqlite";

const db = new Database("mydb.sqlite");

// Create table
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL
)`);

// Prepared statements
const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
insert.run("Alice", "alice@example.com");

// Query
const getAll = db.prepare("SELECT * FROM users");
const users = getAll.all();
console.log(users);

// Single row
const getOne = db.prepare("SELECT * FROM users WHERE id = ?");
const user = getOne.get(1);

db.close();
```

## Bundler

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
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}
```

## Test Runner

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

```bash
bun test                     # Run all tests
bun test --watch             # Watch mode
bun test math.test.ts        # Run specific file
bun test --coverage          # With coverage report
bun test --timeout 10000     # Custom timeout (ms)
```

## Environment Variables

```typescript
// Bun reads .env automatically — no dotenv needed
const apiKey = process.env.API_KEY;
const port = Bun.env.PORT ?? "3000";
```

## WebSocket Server

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

## Migrating from Node.js

Most Node.js code runs without changes. Key differences:

| Feature | Node.js | Bun |
|---|---|---|
| Package manager | `npm install` | `bun install` |
| Run TypeScript | Needs `ts-node` or build | `bun run index.ts` |
| `.env` loading | Needs `dotenv` | Built-in |
| `fetch` | Needs `node-fetch` (old) | Built-in |
| SQLite | Needs `better-sqlite3` | `bun:sqlite` built-in |
| Test runner | `jest` | `bun test` |

## package.json Setup

```json
{
  "name": "my-bun-app",
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node",
    "test": "bun test",
    "start": "bun dist/index.js"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

## Guidelines

- Prefer `bun install` over `npm install` in all Bun projects — it is 10–25x faster.
- Use `bun:sqlite` instead of `better-sqlite3` for zero-dependency SQLite.
- Use `Bun.file` and `Bun.write` instead of `fs` for simpler file I/O.
- Run TypeScript directly with `bun run` — no build step needed in development.
- Use `bun --hot` for hot reload during development (preserves module state).
- Use `bun --compile` to produce a single self-contained executable binary.
- Bun reads `.env` files automatically — remove `dotenv` from your dependencies.
- The `bun:test` module is Jest-compatible; most Jest tests work with zero changes.
