---
name: node
description: >-
  Node.js is the JavaScript runtime that runs servers, command-line tools and build scripts outside the browser. Use this skill when a user asks which Node.js version to run, how to test with `node --test`, restart on change with `--watch`, load a `.env` file, run TypeScript files without a build step, restrict a script with the permission model, mix ESM and CommonJS, or attach a debugger with `--inspect`. Covers the 2026 release lines (26 Active LTS, 24 and 22 maintenance) and the built-in modules that replace common npm packages.
license: Apache-2.0
compatibility: "Node.js 22+ (examples verified on 26.13.0). Linux, macOS or Windows; official binaries or a version manager."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "nodejs, javascript, typescript, test-runner, runtime"
  repository: https://github.com/nodejs/node
---
# Node.js — run JavaScript and TypeScript with the batteries included

## Overview

Modern Node.js ships with a test runner, a file watcher, `.env` loading, `fetch`, a SQLite module, an argument parser, TypeScript type stripping and an opt-in permission model. A project that needs none of the old helper packages (`jest`, `nodemon`, `dotenv`, `ts-node`, `node-fetch`, `minimist`) for basic work is common today. This skill covers choosing a release line and using these built-ins correctly. It does not cover frameworks (see `fastify`, `hono`, `nestjs`) or switching between Node versions (see `nvm` and `mise`).

## Instructions

### Choose the release line

Even-numbered releases become LTS (long-term support); odd-numbered ones are short-lived and are not for production. Read the live data instead of trusting memory:

```bash
curl -s https://nodejs.org/dist/index.json | python3 -c "
import json, sys
seen = set()
for r in json.load(sys.stdin):
    major = r['version'].split('.')[0]
    if r['lts'] and major not in seen:
        seen.add(major); print(r['version'], r['lts'], r['date'])"
```

As of 2026-11-05 the schedule (https://github.com/nodejs/Release) is:

| Line | Status | End of life |
|---|---|---|
| 26 "Lithium" | Active LTS since 2026-10-28 | 2029-04-30 |
| 24 "Krypton" | Maintenance LTS since 2026-10-20 | 2028-04-30 |
| 22 "Jod" | Maintenance LTS | 2027-04-30 |
| 20 "Iron" | End of life since 2026-04-30 | — |
| 27 | alpha; becomes Current in April 2027 | — |

Rule: new services start on the newest Active LTS (26); existing ones stay on a supported LTS and plan the next jump before the end-of-life date. Never deploy an end-of-life line or an odd-numbered release.

### Install the official binary and verify it

When no version manager is available, download the tarball and check it against the published checksums:

```bash
V=v26.13.0
curl -fLO https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz
curl -fLO https://nodejs.org/dist/$V/SHASUMS256.txt
grep "node-$V-linux-x64.tar.xz" SHASUMS256.txt | sha256sum -c -
mkdir -p "$HOME/opt/node-$V"
tar -xJf node-$V-linux-x64.tar.xz -C "$HOME/opt/node-$V" --strip-components=1
"$HOME/opt/node-$V/bin/node" --version
```

The tarball contains `node`, `npm` and `npx` (Corepack is not included; install a package manager with `npm install -g` if you need one). For several versions side by side, use the `nvm` skill.

### Test with the built-in runner

`node --test` discovers test files by naming convention (such as `*.test.ts` and anything under `test/`), runs each file in its own process, and exits non-zero on failure.

```ts
// test/price.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/price.ts';

describe('total', () => {
  test('sums quantity times price', () => {
    assert.equal(total([{ sku: 'KB-104', cents: 4900, qty: 2 }]), 9800);
  });
  test('empty cart is zero', () => assert.equal(total([]), 0));
});
```

```bash
node --test                                   # run everything
node --test --test-name-pattern='empty'       # only matching test names
node --test --experimental-test-coverage      # table of line/branch/function coverage
node --test --test-rerun-failures=state.json  # second run re-executes only what failed
node --test --test-reporter=spec              # spec | tap | dot | junit | lcov
```

Inside a test, `t.mock.fn()` creates spies, `t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })` fakes the clock, and `t.assert.snapshot(value)` compares with a `<file>.snapshot` file that `node --test --test-update-snapshots` writes.

### Restart on change and load `.env` files

```bash
node --watch --env-file=.env src/server.ts      # restarts when imported files change
node --watch-path=./src --watch-path=./config src/server.ts   # watch extra paths
node --env-file=.env --env-file-if-exists=.env.local src/server.ts  # later file wins; second may be absent
```

Variables already set in the shell win over the file, so `PORT=9000 node --env-file=.env app.js` uses 9000. Inside code, `process.loadEnvFile('.env')` loads a file at runtime and `util.parseEnv(text)` parses a string. Keep `.env` out of git.

### Run TypeScript without a build step

Node strips type annotations when it runs a `.ts`, `.mts` or `.cts` file; no flag is needed on 26.13.0 (run `node --help | grep strip-types` on other versions before relying on it).

```bash
node src/hello.ts -q 3
node --check src/price.ts      # syntax check only (no type checking)
```

Stripping only erases types, so the code must use "erasable" syntax:

- Import local files with the real extension: `import { total } from './price.ts'` (without `.ts` you get `ERR_MODULE_NOT_FOUND`).
- Type-only imports need the `type` keyword: `import { total, type LineItem } from './price.ts'`. A plain `import { LineItem }` fails at link time.
- `enum`, `namespace` and constructor parameter properties (`constructor(private x: number)`) throw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Use `as const` objects and ordinary field assignments instead.
- Files inside `node_modules` are not stripped (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`); packages must ship JavaScript.
- Node does no type checking. Run `tsc --noEmit` separately; set `"erasableSyntaxOnly": true` and `"allowImportingTsExtensions": true` in tsconfig so the editor flags the same errors Node would.

### ESM and CommonJS

- `"type": "module"` in `package.json` makes `.js` files ESM; `.mjs` is always ESM and `.cjs` always CommonJS.
- `require()` can load ES modules synchronously (unless they use top-level `await`): `const { x } = require('./esm.mjs')` works, and the default export is `.default`.
- ESM has no `__dirname`; use `import.meta.dirname` and `import.meta.filename`.
- Preload code with `node --import ./instrument.mjs app.mjs` (ESM) or `--require` (CommonJS).

### Built-ins that replace packages

```js
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { globSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const { values } = parseArgs({ options: { qty: { type: 'string', short: 'q', default: '1' } } });
const res = await fetch('https://nodejs.org/dist/index.json', { signal: AbortSignal.timeout(5000) });
const releases = await res.json();
const db = new DatabaseSync(':memory:');
db.exec('create table orders(id integer primary key, status text)');
```

`fetch`, `AbortSignal.timeout`, `structuredClone`, `URLPattern`, `WebSocket` and `Temporal` are globals on Node 26; `node --run <script>` runs a `package.json` script without starting npm. `node:sqlite` loads without a flag on 26.13.0 but the API docs mark it stability 1.2 (release candidate); `--allow-net` is stability 1.1 (active development) and prints an ExperimentalWarning. Treat both as subject to change.

### Permission model

`--permission` denies filesystem writes, child processes, workers, addons, WASI and network unless allowed. The entry script itself stays readable.

```bash
node --permission --allow-fs-read="$PWD" --allow-fs-write="$PWD/out" report.mjs
node --permission --allow-fs-read="$PWD" --allow-net fetch-prices.mjs   # network is opt-in (experimental)
```

A denied call throws, for example `Error: Access to this API has been restricted. Use --allow-fs-read to manage permissions.` It limits what JavaScript can do, but it is not a sandbox against hostile native code; use containers for untrusted programs.

### Debugging

```bash
node --inspect=127.0.0.1:9229 src/server.ts       # attach Chrome DevTools or VS Code
node --inspect-brk=127.0.0.1:9229 src/server.ts   # pause on the first line
```

Always bind the inspector to `127.0.0.1`; an inspector reachable from the network allows remote code execution. On a remote host, tunnel with `ssh -L 9229:127.0.0.1:9229`.

## Examples

### Example 1: Test and run a TypeScript service with no dependencies

Request: "Set up the orders API so it runs on Node 26 with tests and auto-reload, no ts-node or jest."

```json
{
  "name": "orders-api",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch --env-file=.env src/server.ts",
    "test": "node --test --experimental-test-coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

```bash
npm test          # runs test/price.test.ts, prints pass/fail counts and a coverage table
npm run dev       # prints "Restarting 'src/server.ts'" after every saved change
```

Result: the two tests pass with 100% coverage on `src/price.ts`; editing `server.ts` restarts the server within a second. `npm install` prints an `EBADENGINE` warning on an older Node, and fails with `--engine-strict`.

### Example 2: Lock down a report script

Request: "This script reads exports from ./data and writes to ./out. Make sure it cannot do anything else."

```bash
node --permission \
  --allow-fs-read="$PWD/data" --allow-fs-read="$PWD/report.mjs" \
  --allow-fs-write="$PWD/out" \
  report.mjs
```

Result: reads and writes inside those directories succeed; `fetch`, `child_process.spawn` or reading `~/.ssh/id_ed25519` is denied with an "Access to this API has been restricted" error (for `fetch` the error is `fetch failed`, and that message is in `error.cause`). Add `--allow-net` only if the script must call an API.

### Example 3: Pick a version for a new project

Request: "Which Node should the new service use?" The agent runs the `index.json` snippet above, sees Lithium (26.x) as the newest LTS, writes `26` into `.nvmrc` and `"engines": { "node": ">=26" }` into `package.json`, and notes that line 24 stays supported until 2028-04-30 if a dependency lags.

## Guidelines

- Pin the major version in `.nvmrc` or `engines`, and use the same version in CI and in the Docker base image.
- Type stripping is not type checking: keep `tsc --noEmit` in CI.
- Do not use `--inspect=0.0.0.0` or leave `--inspect` on in production.
- `--env-file` is for development; in production inject variables from the platform's secret store.
- `--watch` restarts the whole process; it is not hot module reloading and loses in-memory state.
- The permission model and `--allow-net` are not a replacement for container isolation.
- Do not build on odd-numbered releases or end-of-life lines. Check https://nodejs.org/en/about/previous-releases before choosing.
- Prefer the built-in module when it covers the need, but keep a library when you rely on features the built-in lacks (Jest's module mocking, for instance).
