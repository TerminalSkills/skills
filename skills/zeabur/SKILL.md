---
name: zeabur
description: Zeabur is a cloud deployment platform that detects the framework of a project, builds it with its own zbpack builder and runs it as a managed service, with one-click databases and apps from a template marketplace. Use when deploying a Next.js, Node.js, Python, Go or Docker app to Zeabur, scripting deploys with the `zeabur` CLI, setting service variables or custom domains, or calling the Zeabur GraphQL API.
license: Apache-2.0
compatibility: Node.js for `npx zeabur` (or any shell for the CLI binary); a Zeabur account and API key
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
  - paas
  - deployment
  - docker
  - cli
  - graphql
  repository: https://github.com/zeabur/cli
---

# Zeabur

## Overview

Zeabur builds and hosts services from a Git repository, a local directory or a Docker image. Its builder, zbpack, analyses the source (language, framework, package manager) and produces a container image without a Dockerfile. Databases, queues and apps come from a template marketplace, and the dashboard, CLI and public GraphQL API all drive the same backend. The CLI (`zeabur`, currently marked beta by its README) is run with `npx zeabur`; it was checked here at version 0.24.0.

## Instructions

### CLI

```bash
# log in: browser flow, or an API key created in the dashboard
npx zeabur auth login
npx zeabur auth login --token "$ZEABUR_TOKEN"

# create a project in a region, then deploy the current directory
npx zeabur project create --name shop-api   # asks for the region; `project create --help` shows -r/--region
npx zeabur deploy --create --name shop-api --project-id 66a1c0ffee1234567890abcd

# redeploy an existing service
npx zeabur deploy --service-id 66a1c0ffee1234567890abce --environment-id 66a1c0ffee1234567890abcf
```

Useful commands (all take `--help`; add `-i=false` or the full flags for scripts and CI, and `--json` for machine-readable output):

```bash
npx zeabur project list
npx zeabur context set project --name shop-api      # later commands reuse this context
npx zeabur service list
npx zeabur service restart --name shop-api --env-id 66a1c0ffee1234567890abcf
npx zeabur deployment log -t build --service-name shop-api --env-id 66a1c0ffee1234567890abcf
npx zeabur deployment log -t runtime --service-name shop-api --env-id 66a1c0ffee1234567890abcf -w
npx zeabur variable create --name shop-api --env-id 66a1c0ffee1234567890abcf -k NODE_ENV=production -y
npx zeabur variable env --env-id 66a1c0ffee1234567890abcf --name shop-api -f .env   # OVERWRITES the service's variables from a .env file
npx zeabur variable list --name shop-api --env-id 66a1c0ffee1234567890abcf
npx zeabur domain create --name shop-api --env-id 66a1c0ffee1234567890abcf --domain api.shopfront.dev -y
npx zeabur template search postgres
```

There is no `zeabur env` or `zeabur domain add` command; variables live under `variable` (alias `var`) and domains under `domain create`. Other top-level commands: `service exec`, `service port-forward`, `service metric`, `template deploy`, `upload`, `server`, `workspace` (switch between personal and team accounts) and `api graphql`.

### Build and start configuration

zbpack reads an optional `zbpack.json` in the repository root (keys are snake_case). Each key can also be set as a service environment variable with the `ZBPACK_` prefix and upper-case name.

```json
{
  "build_command": "pnpm run build",
  "start_command": "node dist/server.js",
  "app_dir": "apps/web",
  "cache_dependencies": false
}
```

- `zbpack.NAME.json`, where NAME is the service name, overrides the defaults for one service; useful in monorepos (for example `zbpack.api.json`).
- In a pnpm or Yarn workspace Zeabur deploys the first Node.js app it finds; set `app_dir` (`ZBPACK_APP_DIR`) to pick another. Nx and Rush monorepos are not auto-detected.
- A `Dockerfile` in the repository is used instead of auto-detection.
- To preview what zbpack decides locally you need its own CLI (Go, plus buildkit); normally read the build log instead.

### Frameworks and services

Detection covers Node.js (Next.js, Nuxt, Remix, SvelteKit, NestJS, Express, Astro, Vite and others, with npm, Yarn, pnpm and Bun), plus Python, Go, Rust, Java, PHP, Ruby and static sites; the per-language guides in the docs list the current set. Pushing to the connected GitHub branch triggers a new deployment. Add databases and other apps from the marketplace inside the same project; a service exposes its connection values as variables (such as a host and `PORT`), and you reference them from another service with `${VARIABLE_NAME}`. Read the exact names on the database service's Variables tab rather than guessing.

### Health checks and resources

By default Zeabur probes the exposed port over TCP (every 10 s, 5 s timeout, 3 failures). A custom HTTP path (for example `/healthz`) is set in the service Settings, and the app must return 2xx there. A failed health check leaves the previous deployment serving. Services with a volume use a recreate strategy, so expect brief downtime. CPU and memory are changed in Settings and apply on the next deployment; billing follows the allocation.

### GraphQL API

Create an API key in the dashboard and send it as a Bearer token to `https://api.zeabur.com/graphql`. The schema is only available from the Apollo Explorer after login, so explore it there or use `npx zeabur api graphql`. Keys belong to a person, not a team; queries on team resources take an `ownerID` argument.

```typescript
const res = await fetch("https://api.zeabur.com/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ZEABUR_API_KEY}`,
  },
  body: JSON.stringify({ query: "query { me { username } }" }),
});
const { data, errors } = await res.json();
if (errors) throw new Error(errors[0].message);
console.log(data.me.username);
```

## Examples

### Example 1: Deploy a Next.js app from the terminal

**User request:** "Deploy this Next.js storefront to Zeabur and give it the DATABASE_URL from our Postgres."

```bash
export ZEABUR_TOKEN=...   # API key from the dashboard, never committed
npx zeabur auth login --token "$ZEABUR_TOKEN"
npx zeabur project list --json
npx zeabur deploy --create --name storefront --project-id 66a1c0ffee1234567890abcd
npx zeabur variable create --name storefront --env-id 66a1c0ffee1234567890abcf   -k 'DATABASE_URL=postgresql://${POSTGRES_USERNAME}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}' -y   # names as shown on the Postgres Variables tab
npx zeabur deployment log -t build --service-name storefront --env-id 66a1c0ffee1234567890abcf
```

The deploy command uploads the directory, zbpack picks the Next.js plan, and the log shows the build. The service gets a generated `*.zeabur.app` domain; `domain create` attaches your own.

### Example 2: Deploy one app of a pnpm monorepo

**User request:** "Our Turborepo has apps/docs and apps/web; Zeabur keeps deploying docs."

Add `zbpack.json` to the repository root:

```json
{ "app_dir": "apps/web" }
```

Commit and push; the next deployment builds `apps/web`. For a second service from the same repository use `zbpack.api.json` named after that service so each gets its own commands.

## Guidelines

- Let detection work; add `zbpack.json` or a Dockerfile only when the build log shows it chose wrongly.
- Do not invent flags: run `npx zeabur <command> --help`, the CLI is still beta and changes.
- Keep API keys in environment variables or CI secrets, never in the repository.
- Use marketplace databases instead of running your own, and check their backup options in the service page before relying on them.
- Listen on the `PORT` Zeabur injects; if the port never accepts connections the deployment fails its health check.
- A service with a volume cannot do zero-downtime deploys.
