---
name: deno
description: >-
  Assists with building secure JavaScript and TypeScript applications using the Deno runtime.
  Use when creating servers, CLI tools, or scripts with Deno's built-in tooling, permission model,
  npm compatibility, and web standards APIs. Trigger words: deno, deno deploy, deno serve, deno kv,
  deno permissions, secure runtime, jsr.
license: Apache-2.0
compatibility: "Deno 2.x. TypeScript first-class. npm compatibility built-in."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["deno", "typescript", "runtime", "secure", "web-standards"]
  repository: https://github.com/denoland/deno
---

# Deno

## Overview

Deno is a secure JavaScript/TypeScript runtime built on V8. It runs TypeScript natively without config, is secure by default (explicit permissions required), and is fully compatible with npm packages. Deno 2 adds backwards compatibility with Node.js APIs and `package.json`, making it a viable drop-in replacement for many Node.js projects. Built-in tooling includes a formatter, linter, test runner, and compiler.

## Instructions

- When installing, prefer a package manager: `brew install deno` (macOS/Linux), `winget install DenoLand.Deno` or `scoop install deno` (Windows), `npm install -g deno` (any OS; starts a little slower). Check with `deno --version` (2.9.x at the time of writing) and update with `deno upgrade`. Start a project with `deno init`.
- When creating servers, use `Deno.serve()` for high-performance HTTP handling with Web Standards Request/Response, and enable parallel workers with `deno serve --parallel` for multi-core utilization.
- When configuring security, specify permissions explicitly (`--allow-read`, `--allow-net`, `--allow-env`) scoped to specific paths, hosts, or variable names. Never deploy with `--allow-all`.
- When managing dependencies, use JSR (`jsr:`) for versioned, type-checked packages, `npm:` specifier for npm packages, and configure import maps in `deno.json` for clean paths.
- When writing tests, use `Deno.test()` with `@std/assert` assertions, `@std/testing` for mocking, and `deno test --coverage` for coverage reports. Deno's sanitizers detect resource leaks automatically.
- When building CLI tools, use `deno compile` to produce standalone executables that cross-compile for Linux, macOS, and Windows with no runtime dependency.
- When deploying, use the current Deno Deploy (console.deno.com, `deno deploy` command). `deployctl` and dash.deno.com belong to the older Deploy Classic. Deno Deploy supports cron and connected databases; KV queues are not supported on the new platform.
- When using Deno KV or `Deno.cron()` locally, Deno 2 still gates them behind `--unstable-kv` and `--unstable-cron` (or `"unstable": ["kv", "cron"]` in `deno.json`). Structure keys hierarchically (`["users", id, "profile"]`), use `atomic()` for transactions, and configure TTL with `expireIn` for automatic expiration.

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
deno run --allow-read --deny-read=/etc main.ts   # --deny-* overrides --allow-*
```

Modules in the initial static import graph load without `--allow-read` or `--allow-net`; permissions apply to what the code does once it runs. Without a flag Deno prompts in a terminal, or fails in CI, so grant the exact scope in tasks.

## npm Compatibility

Import npm packages directly with the `npm:` prefix:

```typescript
import express from "npm:express@5";
import { z } from "npm:zod@4";

const app = express();
app.get("/", (_req, res) => {
  res.json({ message: "Hello from Deno + Express!" });
});
app.listen(3000);
```

Or declare in `deno.json`:

```json
{
  "imports": {
    "express": "npm:express@^5",
    "zod": "npm:zod@^4"
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
```

## Built-in Test Runner

```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert";

Deno.test("add works correctly", () => {
  assertEquals(1 + 2, 3);
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
```

## Built-in Tooling

```bash
deno fmt                 # Format code (Prettier-compatible)
deno lint                # Lint code
deno check main.ts       # Type-check without running
deno compile main.ts     # Compile to standalone binary
deno info main.ts        # Show module dependency tree
```

## deno.json Configuration

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read=./data --allow-env=PORT --watch src/main.ts",
    "test": "deno test --allow-net",
    "build": "deno compile --allow-net --allow-read=./data -o bluefin-api src/main.ts"
  },
  "imports": {
    "zod": "npm:zod@^4",
    "@std/assert": "jsr:@std/assert@^1",
    "@hono/hono": "jsr:@hono/hono@^4"
  },
  "lint": { "rules": { "include": ["no-unused-vars"] } },
  "fmt": { "useTabs": false, "lineWidth": 100 }
}
```

## Deno Deploy

Deno Deploy (console.deno.com) runs full Deno 2 apps, Node apps and frameworks such as Next.js, Astro and SvelteKit, with builds, environment-specific variables and databases built in. The `deno deploy` command deploys from the terminal; the first run asks you to sign in in the browser and stores the token in the system keyring.

```typescript
// main.ts
export default {
  fetch(req: Request): Response {
    const { pathname } = new URL(req.url);
    if (pathname === "/") return new Response("Hello from the edge!");
    return new Response("Not Found", { status: 404 });
  },
} satisfies Deno.ServeDefaultExport;
```

```bash
deno serve main.ts                                   # run locally on port 8000
deno deploy create                                   # interactive: create the app (org, name, source)
deno deploy --prod                                   # deploy the current directory to production
```

`deployctl deploy` is the Deploy Classic workflow; use it only for projects still on Classic.

## Examples

### Example 1: Build a REST API with Deno KV

**User request:** "Create an API with Deno that stores data in Deno KV"

**Actions:**
1. Create HTTP server with `Deno.serve()` and route matching
2. Open KV store with `Deno.openKv()` and define key structure
3. Implement CRUD operations using `kv.get()`, `kv.set()`, and `kv.atomic()`
4. Set explicit permissions in `deno.json` task definitions, and run with `--unstable-kv` (or enable it in `deno.json`) since KV is still gated locally

**Output:** A secure API with embedded key-value storage, ready for Deno Deploy.

### Example 2: Compile a CLI tool for distribution

**User request:** "Create a Deno CLI tool that can be distributed as a single binary"

**Actions:**
1. Build the CLI with argument parsing using `@std/cli`
2. Add file and network permissions scoped to required resources
3. Write tests with `Deno.test()` and run with `deno test`
4. Compile to standalone binaries with `deno compile --target` for each platform

**Output:** Cross-platform standalone executables with no runtime dependency.

## Guidelines

- Always specify permissions explicitly in production; never deploy with `--allow-all`.
- Use `deno.json` imports map for clean import paths instead of raw URLs.
- Prefer JSR (`jsr:`) over URL imports for versioned, type-checked, immutable packages.
- Use `npm:` specifier for npm packages directly — no install step needed.
- Run `deno fmt` and `deno lint` in CI for zero-config formatting and linting.
- Use `Deno.serve()` over third-party frameworks for simple APIs; it is faster and lighter.
- Compile to standalone binary with `deno compile` for distribution with no runtime dependency.
- Deno 2 is backward-compatible with `package.json` — Node.js projects often work without changes.
- Use Deno Deploy for serverless deployment; check which features (queues, KV) your plan and platform generation support.
- Pin `npm:` majors in the import map: express is at 5.x and zod at 4.x, and older tutorials show 4.x and 3.x.
