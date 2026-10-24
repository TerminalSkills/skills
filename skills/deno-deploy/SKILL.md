---
name: deno-deploy
description: >-
  Deno Deploy is a serverless platform that runs JavaScript and TypeScript
  apps on Deno, with integrated builds, Deno KV databases, cron jobs and
  preview URLs. Use when deploying a Deno, Node or framework app to
  console.deno.com, using the `deno deploy` command, setting environment
  variables per context, attaching Deno KV, or migrating off Deploy Classic
  and `deployctl`.
license: Apache-2.0
compatibility: "Deno 2.x with a Deno Deploy organization at console.deno.com (the first-party `deno deploy` subcommand needs a recent Deno 2 release; Deno 2.9.6 was current in October 2026)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["deno", "serverless", "typescript", "deploy", "edge"]
  repository: https://github.com/denoland/deno
---

# Deno Deploy

## Overview

Deno Deploy is Deno's hosting platform for JavaScript and TypeScript apps. The current platform lives at console.deno.com and runs apps on the full Deno runtime (a Linux sandbox, so subprocesses, FFI and file writes work). It builds your repository itself, serves Next.js, Astro, SvelteKit, Fresh and plain `Deno.serve()` apps, and exposes Deno KV and `Deno.cron()`.

Deploy Classic (dash.deno.com), the `deployctl` CLI and the subhosting v1 API were shut down on 20 July 2026. Anything that uses `deployctl deploy`, `dash.deno.com`, Deno Queues or the old `serve()` import from `deno.land/std` must be migrated. Deploy Classic projects were not transferred automatically: create a new app in a new organization and redeploy.

## Instructions

- Write the server with `Deno.serve()`. The old `serve()` from `https://deno.land/std/http/server.ts` fails the deployment warm-up with a timeout; some old third-party libraries still call it internally, so upgrade them.
- Deploy from the command line with the built-in subcommand, not `deployctl`:
  1. `deno deploy create` starts a wizard (organization, app name, source, build config, region). For CI, pass flags: `--org`, `--app`, `--source local|github`, `--runtime-mode dynamic|static`, `--entrypoint main.ts`, `--framework-preset`, `--build-timeout`, `--build-memory-limit`, `--region us|eu|global`. `--dry-run` validates without creating.
  2. `deno deploy` (run in the project directory, with `--org` and `--app` or a prior `deno deploy switch`) uploads the directory and builds it. Add `--prod` to deploy straight to production.
  3. The CLI keeps its token in the system keyring and prompts to sign in when needed.
- Or connect a GitHub repository in the dashboard. Every push builds; the branch decides the timeline (production or development).
- Build settings (framework preset, install command such as `deno install`, build command such as `deno task build`, entrypoint, static directory, single-page-app mode) can come from the dashboard or from a `deploy` section in `deno.json`; the file wins on every deploy.
- Environment variables belong to contexts: Production, Development (preview and branch URLs) and Build. Manage them in the dashboard or with `deno deploy env add NAME value [--secret]` (set `--org` and `--app`, or run `deno deploy switch` first), `env list`, `env update-value`, `env update-contexts`, `env delete`, and `env load .env.production`. Read them with `Deno.env.get("NAME")`. Names cannot start with `DENO_` (a few exceptions such as `DENO_AUTH_TOKENS`), `LD_` or `OTEL_`; values are limited to 128 kB.
- Deno KV: provision a database in the dashboard (Databases > Provision Database) or with `deno deploy database provision my-kv --kind denokv`, then assign it to the app (`deno deploy database assign my-kv --app link-shortener`). In code, call `Deno.openKv()` with no arguments. Deploy gives each timeline its own database, so preview deployments never touch production data. Existing KV data from Deploy Classic is not migrated automatically (ask support@deno.com). KV queues (`enqueue`/`listenQueue`) are not supported; use an external queue.
- Cron: declare `Deno.cron(name, schedule, handler)` at module top level, before `Deno.serve()`. Deploy reads the definitions at deploy time. Schedules are UTC. Definitions inside request handlers or conditionals are not discovered.
- Regions: only `us`, `eu` and `global` (both) exist. Apps are serverless: an instance starts on demand, may run in several places at once, and is stopped after idle time with a SIGINT and 5 seconds to finish. Do not keep state in memory; use KV or a database. Instances do not share memory, so do not rely on `BroadcastChannel` or in-process state for cross-request coordination.
- Logs and traces are in the dashboard (`deno deploy logs` for the terminal). Custom flags, including `--unstable-*`, cannot be passed to the runtime.

## Examples

### Example 1: Ship a URL shortener with KV and a cron job

**User request:** "Deploy a small link shortener on Deno Deploy that expires links after 30 days."

`main.ts`:

```typescript
import { Hono } from "jsr:@hono/hono@4";

const app = new Hono();
const kv = await Deno.openKv();

Deno.cron("log-link-count", "0 * * * *", async () => {
  let count = 0;
  for await (const _ of kv.list({ prefix: ["links"] })) count++;
  console.log(`${count} short links stored`);
});

app.post("/api/shorten", async (c) => {
  const { url } = await c.req.json();
  const id = crypto.randomUUID().slice(0, 8);
  await kv.set(["links", id], url, { expireIn: 30 * 24 * 60 * 60 * 1000 });
  return c.json({ path: `/${id}` }, 201);
});

app.get("/:id", async (c) => {
  const hit = await kv.get<string>(["links", c.req.param("id")]);
  return hit.value ? c.redirect(hit.value) : c.text("Not found", 404);
});

Deno.serve(app.fetch);
```

Commands:

```bash
deno run -A main.ts        # local check: KV runs from a local file
deno deploy create --org northwind --app link-shortener --source local \
  --runtime-mode dynamic --entrypoint main.ts \
  --build-timeout 5 --build-memory-limit 1024 --region global
deno deploy database provision links-kv --kind denokv --org northwind
deno deploy database assign links-kv --app link-shortener --org northwind
deno deploy --org northwind --app link-shortener --prod
```

**Result:** the build streams in the dashboard, then the app answers on its `deno.net` URL. `POST /api/shorten` returns `{"path":"/4844a68d"}` and `GET /4844a68d` answers `302` to the stored address (verified locally with Deno 2.9.6).

### Example 2: Increment a counter without losing updates

**User request:** "Count page visits in KV; two requests at once must not overwrite each other."

```typescript
app.post("/api/visits", async (c) => {
  for (;;) {
    const cur = await kv.get<number>(["stats", "visits"]);
    const next = (cur.value ?? 0) + 1;
    const res = await kv.atomic().check(cur).set(["stats", "visits"], next).commit();
    if (res.ok) return c.json({ visits: next });
  }
});
```

`check(cur)` makes the commit fail if another request changed the key, and the loop retries. Two sequential calls return `{"visits":1}` then `{"visits":2}`. For plain counters, `kv.atomic().sum(["stats", "visits"], 1n)` (the value is then a `Deno.KvU64`) avoids the retry loop.

### Example 3: Move a Deploy Classic project

**User request:** "Our project on dash.deno.com stopped working. Move it."

1. Sign in at console.deno.com and create an organization (the slug cannot match an old Classic project name, and it becomes part of every default `deno.net` URL).
2. Replace `import { serve } from "https://deno.land/std.../server.ts"` with `Deno.serve(handler)`.
3. Create the app with `deno deploy create` or link the GitHub repository; delete `deployctl` steps and the `denoland/deployctl` GitHub Action from CI.
4. Re-enter environment variables per context; replace any KV queue code.
5. Add the custom domain to the new app, create the `_acme-challenge` CNAME, then point DNS at the new app.

## Guidelines

- Use `deno deploy`, never `deployctl`; both the CLI and Classic are gone.
- Keep secrets in `--secret` variables and out of the repository; do not paste real values into commands you share.
- Prefer a Deno install from a package manager (`brew install deno`, `npm install -g deno`, `winget install DenoLand.Deno`) over piping an install script into a shell.
- Treat every instance as disposable: no in-memory state, finish shutdown work within 5 seconds.
- Region choice is limited to `us`, `eu` or `global`; if you need a specific region, say so before promising low latency.
- Do not claim zero cold starts or a number of edge locations; the platform starts instances on demand.
