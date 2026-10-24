---
name: bun
description: >-
  Assists with using Bun as an all-in-one JavaScript/TypeScript runtime, package manager, bundler,
  and test runner. Use when building HTTP servers, managing packages, running tests, or migrating
  from Node.js. Trigger words: bun, bun serve, bun install, bun test, bun build, javascript
  runtime, bun runtime.
license: Apache-2.0
compatibility: "Bun 1.4 on macOS, Linux or Windows (x64, arm64)"
metadata:
  author: terminal-skills
  repository: https://github.com/oven-sh/bun
  version: "1.1.0"
  category: development
  tags: ["bun", "javascript-runtime", "package-manager", "bundler", "typescript"]
---

# Bun

## Overview

Bun is a single binary that is a JavaScript/TypeScript runtime, a package manager, a bundler and a Jest-compatible test runner. It runs `.ts` and `.tsx` files directly, reads `.env` files, and ships built-ins such as `Bun.serve()`, `bun:sqlite` and `Bun.password`. It targets Node.js compatibility, so most npm packages work, but not every Node API behaves identically. Checked against Bun 1.4.4.

## Instructions

### Install and start a project

```bash
npm install -g bun            # or: brew install oven-sh/bun/bun   (macOS, Linux)
bun --version                 # 1.4.x
bun init -y                   # package.json, tsconfig.json, index.ts, bun.lock
bun run index.ts              # run TypeScript directly; add --hot to reload on change
```

The official `curl -fsSL https://bun.com/install | bash` script also exists; prefer a package manager so the binary is not fetched through a pipe into a shell. On Windows use `scoop install bun` or `npm install -g bun`.

### Packages

```bash
bun install                   # reads package.json, writes bun.lock (text lockfile, readable diffs)
bun add zod                   # add a dependency; bun add -d typescript for dev
bun remove zod
bun install --frozen-lockfile # CI: fail if package.json and bun.lock disagree
bun audit                     # vulnerability check; bun outdated lists newer versions
bunx prisma generate          # run a package binary without installing it globally
```

Bun does not run `postinstall` and similar lifecycle scripts of dependencies, except for a built-in allow list of popular packages. If a package needs one (native builds), list it in `"trustedDependencies"` in `package.json` and reinstall. To hold back brand-new releases, set `install.minimumReleaseAge` (seconds) in `bunfig.toml`. A project still on the old binary `bun.lockb` migrates with `bun install --save-text-lockfile --frozen-lockfile --lockfile-only`, then delete `bun.lockb`.

### HTTP server

`Bun.serve()` takes a `routes` map with `:param` segments and per-method handlers; `fetch` handles everything else.

```ts
// server.ts
import { Database } from "bun:sqlite";

const db = new Database("app.db");
db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, hash TEXT)");

const server = Bun.serve({
  port: 3000,
  hostname: "127.0.0.1", // bind to loopback unless the service must be reachable from outside
  routes: {
    "/health": new Response("ok"),
    "/api/users/:id": (req) => {
      const user = db.query("SELECT id, email FROM users WHERE id = ?1").get(req.params.id);
      return user ? Response.json(user) : new Response("Not found", { status: 404 });
    },
    "/api/users": {
      POST: async (req) => {
        const { email, password } = await req.json();
        const hash = await Bun.password.hash(password); // argon2id by default
        db.query("INSERT INTO users (email, hash) VALUES (?1, ?2)").run(email, hash);
        return Response.json({ email }, { status: 201 });
      },
    },
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});
console.log(`listening on ${server.url}`);
```

WebSockets: call `server.upgrade(req)` inside `fetch` and add a `websocket: { message(ws, msg) { ws.send(...) } }` handler to the same `Bun.serve()` options. `Bun.password.verify(password, hash)` checks a hash.

### Tests

`bun test` finds `*.test.ts` files and supports `describe`, `it`, `expect`, snapshots and `--coverage`.

```ts
// mailer.ts
export async function sendWelcome(email: string) { /* send the mail */ }

// signup.ts
import { sendWelcome } from "./mailer";
export async function signup(email: string) {
  await sendWelcome(email);
  return { email, welcomed: true };
}
```

```ts
// signup.test.ts
import { describe, expect, it, mock } from "bun:test";

mock.module("./mailer", () => ({ sendWelcome: mock(async () => {}) })); // before importing the code under test

describe("signup", () => {
  it("welcomes the new user", async () => {
    const { signup } = await import("./signup");
    expect(await signup("mara@acme-corp.net")).toEqual({ email: "mara@acme-corp.net", welcomed: true });
  });
});
```

### Bundle and compile

```ts
// build.ts — run with: bun run build.ts
const result = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  target: "browser", // "bun" or "node" for server code
  splitting: true,
  minify: true,
});
if (!result.success) console.error(result.logs);
```

CLI equivalent: `bun build ./src/index.tsx --outdir dist --minify`. `bun build ./server.ts --compile --outfile dist/api` produces a single self-contained executable.

### Files and environment

`Bun.file("data.json").json()` reads and `await Bun.write("out.txt", text)` writes. `new Bun.Glob("src/**/*.ts").scan(".")` lists files. `.env`, `.env.local` and `.env.<NODE_ENV>` load automatically into `Bun.env` and `process.env`, so `dotenv` is not needed.

## Examples

### Example 1: Build an API server with only built-ins

**User prompt:** "Create a small REST API with Bun: POST /api/users stores an email and a hashed password, GET /api/users/:id returns a user."

The agent runs `bun init -y`, writes `server.ts` with `Bun.serve()` routes, `bun:sqlite` for storage and `Bun.password.hash()` for passwords, and starts it with `bun run server.ts`. It checks the result with `curl -X POST -H 'content-type: application/json' -d '{"email":"mara@acme-corp.net","password":"correct-horse-9271"}' http://127.0.0.1:3000/api/users`, which returns `{"email":"mara@acme-corp.net"}` with status 201, and shows that an unknown path returns 404.

### Example 2: Move an Express project from Node.js to Bun

**User prompt:** "Switch my Express project from Node.js to Bun and make CI faster."

The agent deletes `package-lock.json`, runs `bun install` to create `bun.lock`, changes the scripts to `bun run src/index.ts` and `bun test`, and removes `dotenv` and `ts-node`. It runs the existing Jest tests under `bun test`, fixes the few that rely on Jest-only APIs, then sets the CI install step to `bun install --frozen-lockfile`. If a dependency fails on a missing Node API, it keeps that service on Node and reports the package name.

## Guidelines

- Commit `bun.lock`; use `bun install --frozen-lockfile` in CI
- Dependency lifecycle scripts are blocked by default; add only packages you trust to `trustedDependencies`
- `Bun.serve()` listens on all interfaces unless `hostname` is set; bind to `127.0.0.1` behind a reverse proxy
- Prefer `Bun.password` over adding bcrypt packages, and do not store plain passwords
- `bun:sqlite` is for embedded, single-process storage; use a server database for multi-instance deployments
- Node compatibility is high but incomplete: test native addons and unusual `node:` APIs before switching production
- Do not benchmark-claim from marketing numbers; measure your own workload
- Use `bunx` instead of `npx`, and `bun run <script>` instead of `npm run <script>`
