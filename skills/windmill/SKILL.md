---
name: windmill
description: >-
  Windmill is an open-source platform for turning scripts into internal tools, workflows and webhooks, with auto-generated UIs, a flow editor and an app builder. Use when a user asks to build internal tools or admin dashboards, orchestrate scripts and cron jobs, automate DevOps tasks, or self-host a code-first alternative to Retool, Zapier or Airflow.
license: Apache-2.0
compatibility: "Self-hosted with Docker or Kubernetes (needs Postgres), or Windmill Cloud. Scripts in TypeScript (Bun/Deno), Python, Go, Bash, SQL, Rust, PHP and more."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  repository: https://github.com/windmill-labs/windmill
  tags:
    - windmill
    - internal-tools
    - workflow
    - scripts
    - automation
---

# Windmill

## Overview

Windmill is a platform where a script is the unit of work. Write a function in TypeScript, Python, Go, Bash, SQL, Rust and other languages; Windmill reads its signature and builds a form, an API endpoint and a webhook for it, then runs it on workers. Scripts chain into flows (steps, branches, loops, approvals, retries) and flows or scripts back apps built in a drag-and-drop editor. Triggers include schedules, webhooks, HTTP routes, Kafka, WebSockets and email.

The backend is Rust, the state is Postgres, and workers pull jobs from a Postgres queue. The repository is AGPLv3 plus a free "Community Edition" binary and Docker image that includes some proprietary features; internal use is free, but reselling or embedding it needs a commercial licence (see the licence section of the README and the pricing page). Version at the time of writing: 1.822.0.

## Instructions

### Self-host with Docker Compose

Windmill needs Postgres, so a lone `docker run` of the image does not work. The repository ships three files that bring up Postgres, server, workers and a Caddy proxy:

```bash
mkdir windmill && cd windmill
# Pin to a release tag, not the moving main branch, and read each file before running it
WM=v1.822.0
base=https://raw.githubusercontent.com/windmill-labs/windmill/$WM
curl -fsSL $base/docker-compose.yml -o docker-compose.yml
curl -fsSL $base/Caddyfile -o Caddyfile
curl -fsSL $base/.env -o .env
less docker-compose.yml Caddyfile .env
docker compose up -d
```

Open `http://localhost`. The default login is `admin@windmill.dev` with password `changeme`; change it immediately. Before production, change the Postgres password in `.env`/`docker-compose.yml`, put the instance behind HTTPS (set `BASE_URL` for Caddy), and pin `WM_IMAGE` to a release tag instead of `main`. For an external database, set `DATABASE_URL` in `.env` and set the `db` replicas to 0. For Kubernetes use the Helm chart (`helm repo add windmill https://windmill-labs.github.io/windmill-helm-charts/`). Postgres 18 is now the default in the compose file: an existing Postgres 16 volume will not start and must be migrated with `pg_dumpall`, as the self-host docs describe.

### Write a script

Scripts live in folders like `f/<folder>/<name>`. The arguments of `main` become the form; types and defaults drive the widgets, and an object type that matches a resource type (for example `postgresql`) becomes a resource picker. Secrets live in variables and resources, not in arguments.

```typescript
import * as wmill from "windmill-client";

type Postgresql = { host: string; port: number; user: string; dbname: string; password: string; sslmode: string };

export async function main(db: Postgresql, table: "orders" | "refunds", days: number = 7) {
  const apiKey = await wmill.getVariable("f/billing/stripe_key"); // permissioned, by path
  console.log(`checking ${table} for the last ${days} days`);
  return { table, days, keyLength: apiKey.length };
}
```

```python
def main(region: str, since: str = "2026-09-01") -> list[dict]:
    import requests  # imports are resolved and installed automatically
    r = requests.get("https://api.status.internal/v1/incidents", params={"region": region, "since": since}, timeout=30)
    r.raise_for_status()
    return r.json()["incidents"]
```

### Develop locally with the CLI

```bash
npm install -g windmill-cli          # or: npx windmill-cli ...; command is `wmill`
wmill workspace add main main http://localhost   # name, workspace id, remote URL (log in when prompted)
mkdir ops && cd ops && wmill init   # writes wmill.yaml, AGENTS.md and agent skills
wmill script new f/ops/disk_report bun --summary "Disk report"
wmill script preview f/ops/disk_report -d '{"threshold": 80}'   # runs the local file, no deploy
wmill generate-metadata              # refresh .script.yaml schema and lock files
wmill sync push --dry-run            # then without --dry-run to deploy
```

`script preview` runs local code without deploying; `script run` runs the deployed version; `sync push` is the deploy and `sync pull` fetches remote changes. `wmill lint` validates flow, schedule and trigger YAML. Other tools: the VS Code extension, Git sync (two-way with a repo), and `wmill dev` for a live preview page.

### Build a flow

`wmill flow new f/ops/nightly --summary "Nightly order check"` creates `f/ops/nightly__flow/flow.yaml`. Steps are `modules`; reference earlier output with `results.fetch_orders` (the step id) and inputs with `flow_input.day`. Inline code uses `!inline file.ts`.

```yaml
summary: Nightly order check
value:
  modules:
    - id: fetch_orders
      value:
        type: rawscript
        language: bun
        content: '!inline fetch_orders.ts'
        input_transforms:
          day: { type: javascript, expr: flow_input.day }
    - id: check_failures
      value:
        type: branchone
        branches:
          - summary: Too many failures
            expr: results.fetch_orders.failed > 2
            modules:
              - id: alert_team
                value:
                  type: rawscript
                  language: bun
                  content: '!inline alert_team.ts'
                  input_transforms:
                    message: { type: javascript, expr: '`${results.fetch_orders.failed} failed orders`' }
        default: []
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  order: [day]
  properties:
    day: { type: string, description: "Date to check, YYYY-MM-DD" }
  required: [day]
```

Run `wmill lint f` to validate it and `wmill flow preview f/ops/nightly -d '{"day": "2026-10-02"}'` to execute it locally. `failure_module` and `preprocessor_module` are top-level fields under `value`, not entries of `modules`. Loops use `forloopflow` with an `iterator` expression; approval steps suspend a flow until someone approves.

### Apps, schedules and triggers

Build apps in the UI editor (low-code) or as full-code React/Svelte/Vue "raw apps". Schedules, webhooks and HTTP routes attach to any script or flow; create them in the UI or as YAML via `wmill schedule new` and `wmill trigger new <path> --kind http`.

## Examples

### Example 1: Self-service refund tool

Request: "Our support team needs a form to issue refunds without touching the database."

Write `f/support/issue_refund.py` with `def main(db: postgresql, order_id: str, amount_cents: int, reason: str)`, preview it with `wmill script preview f/support/issue_refund -d '{"order_id": "A-10482", "amount_cents": 1900, "reason": "damaged"}'`, push it, and share the auto-generated form. Put it in a flow with an approval step above a threshold, and give the support group Operator access so they can run it but not edit it.

### Example 2: Nightly check with a Slack alert

Request: "Every night at 2am check yesterday's failed orders and tell the team if there are more than two."

Create the flow above, then add a schedule with cron `0 0 2 * * *` (Windmill uses a six-field cron with seconds) via the Schedules page or `wmill schedule new f/ops/nightly_schedule`. The Runs page shows each execution with logs and per-step inputs and outputs; failures can go to a failure handler or a workspace error handler.

## Guidelines

- Do not ship `admin@windmill.dev` / `changeme` or the compose Postgres password. Back up Postgres; it holds all code, state and secrets.
- Never hard-code secrets in scripts; use variables (secret flag) and resources, and read them with `wmill.getVariable` or typed resource arguments.
- Community Edition is free internally, with caps (for example 10 users with SSO); Enterprise adds SAML, audit logs and a commercial licence. Check the pricing page for current figures.
- Use `script preview` while iterating, not `sync push`; a push overwrites the workspace version.
- Run `wmill generate-metadata` after changing a script's imports or `main` signature, or the lock and the form schema go stale.
- Workers run arbitrary code: restrict who can create scripts, and use worker groups and isolation for untrusted workloads.
- Not the right tool for durable, high-fan-out microservice orchestration with strict workflow-versioning needs (Temporal fits better), or for a pure no-code audience.
