---
title: Build an Internal Developer Platform with Self-Service Deployment
slug: build-internal-developer-platform-with-self-service
description: A 50-person engineering org builds an internal developer platform where teams deploy services through a self-service portal — standardized templates, automated environment provisioning, preview environments per PR, production deployment with approval gates, and cost attribution per team — reducing the platform team from bottleneck to enabler.
skills: [docker-helper, kubernetes-helm, neon-branching, trigger-dev-v3, hono]
category: devops
tags: [platform-engineering, developer-experience, self-service, deployment, infrastructure, internal-tools]
---

# Build an Internal Developer Platform with Self-Service Deployment

Yuki leads platform engineering at a company with 8 product teams (50 engineers total). Every team deploys differently: Team A uses manual SSH, Team B has custom bash scripts, Team C uses a half-configured ArgoCD. New hires take 2 weeks to make their first deploy. "How do I deploy?" is the #1 question in #help-engineering. Yuki's mission: any engineer can deploy any service in under 5 minutes, with zero platform team involvement.

## The Problem: Platform Team as Bottleneck

The current state:

- **New service**: 3-5 days to provision (databases, DNS, CI/CD, secrets, monitoring) — all done by platform team
- **Environment creation**: 1-2 days — platform team manually creates staging environments
- **Deployment**: Different for every team; no standard process; some teams deploy by SSH-ing to servers
- **Cost attribution**: Nobody knows which team costs how much; CFO keeps asking
- **Incidents**: No standard rollback process; some teams have no rollback at all

The goal: a self-service portal where developers create services, provision databases, deploy to preview/staging/production, and see their costs — all without filing a Jira ticket.

## Step 1: Service Templates (Golden Paths)

Instead of letting every team invent their own setup, the platform team provides opinionated templates. Developers choose a template, answer a few questions, and get a fully configured service:

```typescript
// platform-api/src/routes/services.ts — Self-service API
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

const createServiceSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{2,30}$/),
  template: z.enum(["api-node", "api-python", "frontend-react", "worker-node"]),
  team: z.string(),
  owner: z.string().email(),
  database: z.enum(["postgres", "none"]).default("none"),
  resources: z.enum(["small", "medium", "large"]).default("small"),
});

app.post("/api/services", zValidator("json", createServiceSchema), async (c) => {
  const input = c.req.valid("json");
  const service = await createService(input);
  return c.json(service, 201);
});

async function createService(input: z.infer<typeof createServiceSchema>) {
  // 1. Create GitHub repository from template
  const repo = await github.createFromTemplate({
    templateRepo: `platform-templates/${input.template}`,
    name: input.name,
    org: "ourcompany",
    private: true,
  });

  // 2. Provision database (if requested)
  let databaseUrl: string | undefined;
  if (input.database === "postgres") {
    const db = await neon.createProject({
      name: input.name,
      region: "aws-us-east-2",
    });
    databaseUrl = db.connectionUri;

    // Store in secrets manager
    await infisical.createSecret({
      projectId: PLATFORM_PROJECT_ID,
      environment: "prod",
      name: `${input.name.toUpperCase()}_DATABASE_URL`,
      value: databaseUrl,
    });
  }

  // 3. Configure CI/CD
  await writeGitHubActionsWorkflow(repo, input);

  // 4. Create Kubernetes namespace and resources
  await kubectl.apply({
    namespace: input.name,
    resources: generateK8sManifests(input),
  });

  // 5. Configure DNS
  await cloudflare.createDNSRecord({
    name: `${input.name}.internal.ourcompany.com`,
    type: "CNAME",
    content: "k8s-ingress.ourcompany.com",
  });

  // 6. Set up monitoring
  await datadog.createMonitor({
    name: `${input.name} - Error Rate`,
    query: `avg(last_5m):sum:http.requests.errors{service:${input.name}} / sum:http.requests.total{service:${input.name}} > 0.05`,
    tags: [`team:${input.team}`, `service:${input.name}`],
  });

  // 7. Register in service catalog
  await db.services.create({
    data: {
      name: input.name,
      template: input.template,
      team: input.team,
      owner: input.owner,
      repoUrl: repo.html_url,
      database: input.database,
      status: "active",
      createdAt: new Date(),
    },
  });

  return {
    name: input.name,
    repoUrl: repo.html_url,
    url: `https://${input.name}.internal.ourcompany.com`,
    databaseProvisioned: !!databaseUrl,
    estimatedReady: "2 minutes",
  };
}
```

What used to take 3-5 days now takes 2 minutes. The developer picks a template, gets a repo, database, CI/CD, DNS, and monitoring — all configured and ready.

## Step 2: Preview Environments Per PR

Every pull request gets its own isolated environment with its own database branch. Reviewers click a link and see the change running:

```typescript
// platform-api/src/routes/previews.ts
async function createPreviewEnvironment(prNumber: number, service: Service) {
  // Branch the database (instant via Neon — copy-on-write)
  let previewDbUrl: string | undefined;
  if (service.database === "postgres") {
    const branch = await neon.createBranch({
      projectId: service.neonProjectId!,
      name: `preview-pr-${prNumber}`,
      parentBranch: "main",
    });
    previewDbUrl = branch.connectionUri;
  }

  // Deploy preview to Kubernetes
  const previewName = `${service.name}-pr-${prNumber}`;
  await helm.install(previewName, "./charts/service", {
    set: {
      "image.tag": `pr-${prNumber}`,
      "env.DATABASE_URL": previewDbUrl || "",
      "ingress.host": `${previewName}.preview.ourcompany.com`,
      "resources.limits.cpu": "500m",      // Smaller resources for previews
      "resources.limits.memory": "512Mi",
      "autoscaling.enabled": "false",
      "replicas": "1",                     // Single replica for cost
    },
    namespace: "previews",
  });

  // Comment on PR
  await github.createComment(service.repoOrg, service.repoName, prNumber, [
    `🚀 **Preview Environment Ready**`,
    ``,
    `| | |`,
    `|---|---|`,
    `| **URL** | https://${previewName}.preview.ourcompany.com |`,
    `| **Database** | Branched from production (safe to test with real schema) |`,
    `| **Auto-cleanup** | When PR closes |`,
  ].join("\n"));

  return { url: `https://${previewName}.preview.ourcompany.com` };
}
```

## Step 3: Production Deployment with Approval Gates

Production deployments go through a standardized pipeline with required approvals for critical services:

```typescript
// platform-api/src/routes/deploys.ts
app.post("/api/services/:name/deploy", async (c) => {
  const serviceName = c.req.param("name");
  const { version, environment } = await c.req.json();
  const deployer = c.get("user");

  const service = await db.services.findUnique({ where: { name: serviceName } });

  if (environment === "production") {
    // Check approval requirements
    if (service.tier === "critical") {
      const approval = await requestApproval({
        service: serviceName,
        version,
        requestedBy: deployer.email,
        approvers: [service.owner, ...service.team.leads],
        channel: `#deploy-${service.team.slug}`,
      });

      if (!approval.approved) {
        return c.json({ error: "Deployment requires approval", approvalId: approval.id }, 403);
      }
    }

    // Run pre-deployment checks
    const checks = await runPreDeployChecks(service, version);
    if (checks.some(ch => ch.status === "failed")) {
      return c.json({ error: "Pre-deployment checks failed", checks }, 400);
    }
  }

  // Deploy via Helm
  const deployment = await deployService(service, version, environment);

  // Record in audit log
  await db.deployments.create({
    data: {
      serviceId: service.id,
      version,
      environment,
      deployedBy: deployer.email,
      status: "in_progress",
      startedAt: new Date(),
    },
  });

  return c.json(deployment);
});
```

## Step 4: Cost Attribution Dashboard

Every team sees what they're spending. No more surprise AWS bills:

```typescript
// platform-api/src/routes/costs.ts
app.get("/api/costs", async (c) => {
  const { team, period } = c.req.query();

  const costs = await db.$queryRaw`
    SELECT
      s.team,
      s.name as service,
      SUM(c.compute_cost) as compute,
      SUM(c.database_cost) as database,
      SUM(c.network_cost) as network,
      SUM(c.compute_cost + c.database_cost + c.network_cost) as total
    FROM services s
    JOIN cost_records c ON c.service_id = s.id
    WHERE c.period = ${period}
    ${team ? Prisma.sql`AND s.team = ${team}` : Prisma.empty}
    GROUP BY s.team, s.name
    ORDER BY total DESC
  `;

  return c.json({ costs, period });
});
```

## Results

After 6 months:

- **Service creation**: 2 minutes self-service (was 3-5 days with Jira tickets)
- **First deploy for new hires**: Day 1 (was week 2); onboarding docs just say "pick a template"
- **Preview environments**: 100% of PRs get preview environments; reviewers click and test; QA catches 40% more bugs pre-merge
- **Platform team tickets**: Down 80%; platform team now builds tools instead of provisioning services
- **Deployment frequency**: 12 deploys/day across all teams (was 3/day); teams deploy independently
- **Standardization**: All 8 teams use the same templates, same CI/CD, same monitoring; incidents are easier to debug
- **Cost visibility**: Each team sees their monthly spend; total infrastructure costs down 15% through awareness
- **MTTR**: 8 minutes average (was 45 minutes); standardized rollback via `deploy rollback` command
- **Developer satisfaction**: Internal NPS for platform tools went from -20 to +45
