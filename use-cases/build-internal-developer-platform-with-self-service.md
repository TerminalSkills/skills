---
title: Build an Internal Developer Platform with Self-Service Deployment
slug: build-internal-developer-platform-with-self-service
description: A 50-person engineering org builds an internal developer platform where teams deploy services through a self-service portal — standardized templates, automated environment provisioning, preview environments per PR, production deployment with approval gates, and cost attribution per team — reducing the platform team from bottleneck to enabler.
skills: [docker-helper, kubernetes-helm, neon, trigger-dev, hono]
category: devops
tags: [platform-engineering, developer-experience, self-service, deployment, infrastructure, internal-tools]
---

# Build an Internal Developer Platform with Self-Service Deployment

Yuki leads platform engineering at a company with 8 product teams (50 engineers total). Every team deploys differently: Team A uses manual SSH, Team B has custom bash scripts, Team C uses a half-configured ArgoCD. New hires take 2 weeks to make their first deploy, and "How do I deploy?" is the top question in #help-engineering. Yuki's goal: any engineer can create and deploy a service in minutes, with no platform-team ticket.

## The Problem: Platform Team as Bottleneck

- **New service**: 3-5 days to provision (database, DNS, CI/CD, secrets, monitoring), all done by hand by the platform team
- **Deployment**: different for every team, some with no rollback at all
- **Cost attribution**: nobody knows which team costs how much
- **Preview environments**: staging is shared, so changes queue behind each other

The goal is a small platform API (and a portal in front of it) where developers create services, get a database, deploy to preview, staging and production, and see their costs.

## Step 1: Golden-Path Templates with Docker

Every template repository (marked "Template repository" in GitHub) ships a multi-stage `Dockerfile`, a local `compose.yaml`, a Helm values file and a deploy workflow, so every service is built, run and deployed the same way. Use the `docker-helper` skill to produce the Dockerfile and compose file once per template, and review them like any other code.

```yaml
# compose.yaml in every template: same local setup for everyone
services:
  app:
    build: .
    ports:
      - "127.0.0.1:3000:3000"          # local only
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD:?set DB_PASSWORD in .env}@db:5432/app
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
      POSTGRES_DB: app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

```console
$ docker compose up -d --wait
$ docker compose ps
```

## Step 2: Self-Service API for New Services

The platform API is a [Hono](https://hono.dev) app. It validates the request and hands provisioning to a durable [Trigger.dev](https://trigger.dev) task, because creating a repository, a database and a namespace takes minutes and may fail halfway; the task retries without losing its place.

```typescript
// src/schema.ts
import { z } from "zod";
export const createServiceSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{2,30}$/),
  template: z.enum(["api-node", "api-python", "frontend-react", "worker-node"]),
  team: z.string(),
  owner: z.email(),
  database: z.enum(["postgres", "none"]).default("none"),
  resources: z.enum(["small", "medium", "large"]).default("small"),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
```

```typescript
// src/services.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { tasks } from "@trigger.dev/sdk";
import { createServiceSchema } from "./schema";
import type { provisionService } from "../trigger/provision-service";

export const services = new Hono();

services.post("/api/services", zValidator("json", createServiceSchema), async (c) => {
  const input = c.req.valid("json");
  // Provisioning takes minutes and must survive restarts: hand it to a durable task
  const handle = await tasks.trigger<typeof provisionService>("provision-service", input);
  return c.json({ name: input.name, runId: handle.id, status: "provisioning" }, 202);
});
```

```typescript
// trigger/provision-service.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { schemaTask, logger } from "@trigger.dev/sdk";
import { Octokit } from "@octokit/rest";
import { createApiClient } from "@neondatabase/api-client";
import { createServiceSchema } from "../src/schema";

const run = promisify(execFile);
const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
const neon = createApiClient({ apiKey: process.env.NEON_API_KEY! });

export const provisionService = schemaTask({
  id: "provision-service",
  schema: createServiceSchema,
  retry: { maxAttempts: 3 },
  run: async (input) => {
    // 1. Repository from the golden-path template (the template repo is marked "Template repository")
    const { data: repo } = await github.rest.repos.createUsingTemplate({
      template_owner: "ourcompany",
      template_repo: `template-${input.template}`,
      owner: "ourcompany",
      name: input.name,
      private: true,
    });

    // 2. Namespace labelled for cost attribution
    await run("kubectl", ["create", "namespace", input.name]);
    await run("kubectl", ["label", "namespace", input.name, `team=${input.team}`, `service=${input.name}`]);

    // 3. Database project; the connection string goes straight into a Kubernetes Secret
    if (input.database === "postgres") {
      const { data } = await neon.createProject({
        project: { name: input.name, region_id: "aws-us-east-2" },
      });
      const kubectl = run("kubectl", [
        "create", "secret", "generic", "database", "-n", input.name, "--from-env-file=/dev/stdin",
      ]);
      kubectl.child.stdin?.end(`DATABASE_URL=${data.connection_uris[0].connection_uri}\n`);
      await kubectl;
      logger.info("database ready", { project: data.project.id });
    }

    // 4. Record in the service catalog (the platform's own database) and return
    return { name: input.name, repoUrl: repo.html_url };
  },
});
```

The platform's service account holds the GitHub, Neon and cluster credentials; developers never see them. The database connection string is written into a Kubernetes Secret inside the new namespace, so it never reaches a repository or a log. A wildcard DNS record such as `*.internal.ourcompany.com` pointing at the ingress means no per-service DNS call is needed, and the `team` and `service` namespace labels are what monitoring and cost tools group by.

## Step 3: Preview Environments per PR

Every pull request gets its own Helm release and its own copy-on-write database branch, so reviewers can open a link and test against a realistic schema. Neon branches copy the parent's schema and data; use a schema-only branch if production data must not reach previews.

```typescript
// src/previews.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createApiClient, EndpointType } from "@neondatabase/api-client";

const run = promisify(execFile);
const neon = createApiClient({ apiKey: process.env.NEON_API_KEY! });

export async function createPreview(service: { name: string; neonProjectId?: string }, pr: number) {
  const release = `${service.name}-pr-${pr}`;
  const host = `${release}.preview.ourcompany.com`;

  const values: Record<string, unknown> = {
    image: { tag: `pr-${pr}` },
    ingress: { host },
    replicaCount: 1,
    autoscaling: { enabled: false },
  };

  if (service.neonProjectId) {
    // Copy-on-write branch of the project's default branch
    const { data } = await neon.createProjectBranch(service.neonProjectId, {
      branch: { name: `pr-${pr}` },
      endpoints: [{ type: EndpointType.ReadWrite }],
    });
    values.env = { DATABASE_URL: data.connection_uris?.[0]?.connection_uri };
  }

  // Values go in on stdin (JSON is valid YAML), so the connection string never appears in `ps`
  const helm = run("helm", [
    "upgrade", "--install", release, "./charts/service",
    "-n", "previews", "--create-namespace", "--wait", "--timeout", "5m", "-f", "-",
  ]);
  helm.child.stdin?.end(JSON.stringify(values));
  await helm;
  return { url: `https://${host}` };
}
```

A workflow on the pull-request `closed` event runs `helm uninstall <service>-pr-<n> -n previews` and deletes the Neon branch (`neonctl branches delete pr-<n>` or `neon.deleteProjectBranch`). Set an expiry on branches so forgotten previews clean themselves up.

## Step 4: Production Deploys with Approval Gates

Approvals do not need custom code. The platform API dispatches the service's own `deploy.yml` workflow, and the workflow's `environment: production` job is protected by required reviewers in GitHub (Settings, Environments). GitHub records who approved and when, which is the audit log. Every platform route sits behind the company's SSO middleware; the sketches omit it, and the deploy route must also check that the caller belongs to the service's team.

```typescript
// src/deploys.ts
import { Hono } from "hono";
import { Octokit } from "@octokit/rest";

const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
export const deploys = new Hono();

deploys.post("/api/services/:name/deploy", async (c) => {
  const name = c.req.param("name");
  const { version, environment } = await c.req.json<{ version: string; environment: "staging" | "production" }>();
  if (!/^[a-z][a-z0-9-]{2,30}$/.test(name) || !/^[\w.-]+$/.test(version) || !["staging", "production"].includes(environment)) {
    return c.json({ error: "invalid input" }, 400);
  }
  await github.rest.actions.createWorkflowDispatch({
    owner: "ourcompany",
    repo: name,
    workflow_id: "deploy.yml",
    ref: "main",
    inputs: { version, environment },
  });
  return c.json({ status: "dispatched", environment, version }, 202);
});
```

```yaml
# deploy.yml in every template (excerpt)
on:
  workflow_dispatch:
    inputs:
      version: { required: true, type: string }
      environment: { required: true, type: choice, options: [staging, production] }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}     # production has required reviewers
    steps:
      - uses: actions/checkout@v7
      - run: helm upgrade --install "$APP" ./chart -n "$APP" --set image.tag="$VERSION" --atomic --timeout 5m
        env:
          APP: ${{ github.event.repository.name }}
          VERSION: ${{ inputs.version }}      # via env, never interpolated into the script
```

`--atomic` rolls the release back if it does not become ready, and `helm rollback <release> <revision>` is the manual path. See the `kubernetes-helm` skill for chart structure and `helm diff`.

## Step 5: Cost Attribution

Cost records come from the cloud bill and the cluster (grouped by the namespace labels from Step 2), loaded on a schedule into the platform's database. The platform only serves the aggregation, always computed in SQL:

```typescript
// src/costs.ts: sketch; `db` is the platform's Prisma client
app.get("/api/costs", async (c) => {
  const { team, period } = c.req.query();
  if (!/^\d{4}-\d{2}$/.test(period ?? "")) return c.json({ error: "period must be YYYY-MM" }, 400);
  const costs = await db.$queryRaw`
    SELECT s.team, s.name AS service,
           SUM(c.compute_cost) AS compute, SUM(c.database_cost) AS database,
           SUM(c.compute_cost + c.database_cost) AS total
    FROM services s JOIN cost_records c ON c.service_id = s.id
    WHERE c.period = ${period} ${team ? Prisma.sql`AND s.team = ${team}` : Prisma.empty}
    GROUP BY s.team, s.name ORDER BY total DESC`;
  return c.json({ costs, period });
});
```

## Results

In the example team's numbers after six months: a new service takes minutes instead of 3-5 days, new hires deploy on day one, every pull request gets a preview, platform-team tickets dropped by most of the old volume, and each team can see its own monthly spend. The platform team now spends its time on templates and tooling instead of provisioning by hand.

## Related Skills

- `docker-helper` - Dockerfiles and compose files for the templates
- `kubernetes-helm` - charts, releases, rollbacks and preview namespaces
- `neon` - database projects and copy-on-write branches per PR
- `trigger-dev` - durable, retried provisioning tasks
- `hono` - the platform API
