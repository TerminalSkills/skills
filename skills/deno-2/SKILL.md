---
name: deno-2
description: >-
  Deno 2 — secure JavaScript/TypeScript runtime with npm compatibility. Use
  when building secure server-side apps, using TypeScript without config,
  deploying to Deno Deploy for serverless edge, or using npm packages inside
  Deno. Covers permissions model, npm imports, JSR registry, and built-in
  tooling (test, lint, fmt, compile).
license: Apache-2.0
compatibility: "Deno 2.x. TypeScript first-class. npm compatibility built-in."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: runtime
  tags: ["deno", "javascript", "typescript", "secure", "serverless", "edge"]
  use-cases:
    - "Build a secure server-side app with TypeScript and no config files"
    - "Use npm packages inside a Deno project"
    - "Deploy a serverless API to Deno Deploy edge"
    - "Run scripts securely with explicit permission grants"
    - "Replace Node.js for TypeScript development without tsconfig"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Deno 2

## Overview

Deno 2 is a secure JavaScript and TypeScript runtime built on V8. It is TypeScript-native, secure by default (explicit permissions required), and fully compatible with npm packages. Deno 2 adds backwards compatibility with Node.js APIs and `package.json`, making it a viable drop-in replacement for many Node.js projects.

## Installation

```bash
# macOS / Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex

# Homebrew
brew install deno

# Verify
deno --version
```

## Running Code

```bash
deno run main.ts                     # Run TypeScript directly
deno run --allow-net main.ts         # With network permission
deno run --allow-all main.ts         # All permissions (dev only)
deno run https://example.com/mod.ts  # Run remote script
```

## Permissions Model

Deno is secure by default — all external access must be explicitly granted:

| Flag | Grants access to |
|---|---|
| `--allow-net` | Network (fetch, listen) |
| `--allow-read` | File system reads |
| `--allow-write` | File system writes |
| `--allow-env` | Environment variables |
| `--allow-run` | Subprocess execution |
| `--allow-ffi` | Native libraries |
| `--allow-all` or `-A` | Everything (avoid in prod) |

Fine-grained permissions:

```bash
deno run --allow-net=api.stripe.com --allow-read=./data main.ts
```

Use `deno.json` to set default permissions:

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-env src/main.ts"
  }
}
```

## TypeScript — No Config Needed

Deno runs TypeScript natively without `tsconfig.json`:

```typescript
// main.ts — just works
interface User {
  id: number;
  name: string;
}

function greet(user: User): string {
  return `Hello, ${user.name}!`;
}

const user: User = { id: 1, name: "Deno" };
console.log(greet(user));
```

## npm Compatibility

Import npm packages directly with the `npm:` prefix:

```typescript
import express from "npm:express";
import { z } from "npm:zod";
import axios from "npm:axios@1.6";

const app = express();

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Deno + Express!" });
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

Or declare in `deno.json`:

```json
{
  "imports": {
    "express": "npm:express@^4",
    "zod": "npm:zod@^3"
  }
}
```

## JSR — JavaScript Registry

JSR is the modern package registry designed for Deno and TypeScript:

```typescript
// Import from JSR
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { Hono } from "jsr:@hono/hono";
```

```json
// deno.json imports map
{
  "imports": {
    "@std/encoding": "jsr:@std/encoding@^1",
    "@hono/hono": "jsr:@hono/hono@^4"
  }
}
```

## HTTP Server

```typescript
// Built-in Deno.serve — no imports needed
Deno.serve({ port: 3000 }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ status: "ok" });
  }

  if (req.method === "POST" && url.pathname === "/echo") {
    const body = await req.json();
    return Response.json(body);
  }

  return new Response("Not Found", { status: 404 });
});

console.log("Listening on http://localhost:3000");
```

## File System

```typescript
// Read file
const text = await Deno.readTextFile("data.txt");
const bytes = await Deno.readFile("image.png");

// Write file
await Deno.writeTextFile("output.txt", "Hello, Deno!");
await Deno.writeFile("data.bin", new Uint8Array([1, 2, 3]));

// Read directory
for await (const entry of Deno.readDir(".")) {
  console.log(entry.name, entry.isDirectory ? "dir" : "file");
}

// Stat
const stat = await Deno.stat("file.txt");
console.log(stat.size, stat.mtime);
```

## Built-in Test Runner

```typescript
// math_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";

Deno.test("add works correctly", () => {
  assertEquals(1 + 2, 3);
});

Deno.test("division by zero throws", () => {
  assertThrows(() => {
    if (0 === 0) throw new Error("Division by zero");
  });
});

Deno.test({
  name: "async fetch test",
  permissions: { net: true },
  async fn() {
    const res = await fetch("https://httpbin.org/get");
    assertEquals(res.status, 200);
  },
});
```

```bash
deno test                        # Run all tests
deno test --watch                # Watch mode
deno test --coverage=coverage/   # With coverage
deno test math_test.ts           # Specific file
```

## Built-in Tooling

```bash
deno fmt                 # Format code (Prettier-compatible)
deno lint                # Lint code
deno check main.ts       # Type-check without running
deno doc main.ts         # Generate documentation
deno compile main.ts     # Compile to standalone binary
deno bundle main.ts      # Bundle to single JS file (deprecated, use build)
deno info main.ts        # Show module dependency tree
deno repl                # Interactive REPL
```

## deno.json Configuration

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "exports": "./mod.ts",
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-env --watch src/main.ts",
    "test": "deno test --allow-net",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "build": "deno compile --allow-net --allow-read src/main.ts"
  },
  "imports": {
    "zod": "npm:zod@^3",
    "@std/assert": "jsr:@std/assert@^1"
  },
  "lint": {
    "rules": {
      "include": ["no-unused-vars", "no-explicit-any"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100
  }
}
```

## Deno Deploy

Deploy serverless edge functions globally:

```typescript
// main.ts — deploy to Deno Deploy
Deno.serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/") {
    return new Response("Hello from the edge!", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Not Found", { status: 404 });
});
```

```bash
# Install deployctl
deno install -A jsr:@deno/deployctl

# Deploy
deployctl deploy --project=my-project main.ts
```

## Environment Variables

```typescript
// Access env vars (requires --allow-env)
const port = Deno.env.get("PORT") ?? "3000";
const apiKey = Deno.env.get("API_KEY");

if (!apiKey) {
  throw new Error("API_KEY environment variable is required");
}
```

Load `.env` file:

```typescript
import { load } from "jsr:@std/dotenv";
const env = await load();
const dbUrl = env.DATABASE_URL;
```

## Guidelines

- Always specify permissions explicitly — avoid `--allow-all` in production.
- Use `jsr:@std/*` for standard library modules instead of `deno.land/std`.
- Use `npm:` prefix to import npm packages directly — no install step needed.
- Declare imports in `deno.json` `imports` map for cleaner code.
- Use `deno fmt` and `deno lint` as part of CI — they have zero config.
- Use `deno compile` to produce portable standalone executables.
- Deno 2 is backward-compatible with `package.json` — Node.js projects often work without changes.
- Use Deno Deploy for serverless edge deployment with zero infrastructure.
