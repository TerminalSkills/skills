---
title: Deploy Your App Through an AI Agent with Health Checks and Rollback
slug: deploy-app-through-ai-agent
description: Set up conversational deployment — tell your AI agent "deploy to production" and it handles build, deploy, health verification, and automatic rollback.
skills:
  - vercel
  - railway-deploy
  - kamal
  - github-actions
  - test-generator
category: devops
tags:
  - deployment
  - ci-cd
  - vercel
  - railway
  - kamal
  - health-check
  - rollback
---

## The Problem

Sami is a solo developer running three side projects. Each has a different deployment target — one on Vercel, one on Railway with a Postgres database, one on a $5 VPS with Docker. Deploying means switching between three different dashboards, remembering three different CLIs, and running slightly different sequences of commands. Last month, a bad deploy on the VPS took the site down for two hours because Sami forgot to health-check before switching traffic.

The deploy process for each project is about 8 steps: pull latest code, run tests, build, deploy, check health, promote to production, verify, notify. Miss a step — especially the health check — and users see errors. Sami wants to say "deploy my-app to production" to the AI agent and have it handle every step, including rolling back if something breaks.

## The Solution

Each platform already has a mechanism that decides when traffic switches, and the agent should use it rather than fight it:

- **vercel**: `vercel deploy --prod --skip-domain` builds a production deployment without pointing the domains at it. The agent health-checks the new URL, then runs `vercel promote`. If the live domain turns out bad, `vercel rollback` returns to the previous production deployment.
- **railway-deploy**: Railway polls the service's `healthcheckPath` and keeps the previous deployment live if it never returns 2xx. The CLI has no rollback command, so the agent verifies after `railway up` and reports; reverting means redeploying the last good deployment.
- **kamal**: Docker on a VPS. kamal-proxy switches traffic only after the new container answers `/up` with 200, and `kamal rollback <version>` restarts an older retained container.

Use **github-actions** to trigger the deploy on push, and **test-generator** to make sure the code under change has tests before the pre-deploy gate runs them.

## Step-by-Step Walkthrough

### Step 1: Make sure there is a gate worth passing

A deploy gate is only as good as the tests behind it. Ask the agent to cover the risky code first:

```text
Use the test-generator skill to add Vitest tests for the checkout and webhook handlers in src/, plus an integration test that GET /api/health returns 200 and checks the database. Then run pnpm test --run and report coverage.
```

Add the health endpoint itself (`/api/health` on Vercel and Railway, `/up` for Kamal) and, on Railway, set `healthcheckPath` in `railway.json` or the service settings so the platform checks it too.

### Step 2: One deploy script, three platforms

The script runs the same flow everywhere: pre-deploy checks, platform deploy, health check, and rollback only when something was actually switched. A failed pre-deploy check never triggers a rollback, because nothing was deployed. Platform commands run with `execFileSync` and an argument list, so no shell interprets them; only the repo-controlled commands in `preDeployChecks` use `execSync`.

```typescript
// deploy.ts
import { execFileSync, execSync } from "node:child_process";

type Platform = "vercel" | "railway" | "kamal";

interface DeployConfig {
  name: string;
  platform: Platform;
  productionUrl: string;
  healthPath: string;
  healthTimeoutSeconds: number;
  preDeployChecks: string[];
  secrets: string[];
}

const config: DeployConfig = {
  name: "my-saas-app",
  platform: "vercel",
  productionUrl: "https://my-saas-app.example.com",
  healthPath: "/api/health",
  healthTimeoutSeconds: 60,
  preDeployChecks: ["pnpm typecheck", "pnpm test --run", "pnpm build"],
  secrets: ["VERCEL_TOKEN"],
};

const run = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { encoding: "utf-8" }).trim();

async function healthy(
  url: string,
  timeoutSeconds: number,
  headers: Record<string, string> = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // not up yet, retry
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function notify(message: string): Promise<void> {
  console.log(message);
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  await fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

export async function deploy(): Promise<"success" | "failed" | "rolled-back"> {
  for (const check of config.preDeployChecks) {
    try {
      execSync(check, { stdio: "inherit" });
    } catch {
      await notify(`Deploy of ${config.name} stopped: "${check}" failed. Nothing was deployed.`);
      return "failed";
    }
  }
  for (const name of config.secrets) {
    if (!process.env[name]) throw new Error(`Missing required env var: ${name}`);
  }

  const health = (base: string, headers: Record<string, string> = {}) =>
    healthy(`${base}${config.healthPath}`, config.healthTimeoutSeconds, headers);

  switch (config.platform) {
    case "vercel": {
      // Build the production deployment but do not switch domains yet.
      const url = run("vercel", ["deploy", "--prod", "--skip-domain", "--yes"]);
      // The generated deployment URL is behind Deployment Protection (401 without a token).
      const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const probeHeaders: Record<string, string> = bypass ? { "x-vercel-protection-bypass": bypass } : {};
      if (!(await health(url, probeHeaders))) {
        await notify(`${config.name}: new build ${url} is unhealthy, production was never switched.`);
        return "failed";
      }
      run("vercel", ["promote", url, "--yes"]);
      if (await health(config.productionUrl)) return "success";
      run("vercel", ["rollback"]); // back to the previous production deployment
      await notify(`${config.name}: promoted build failed on the live domain, rolled back.`);
      return "rolled-back";
    }
    case "railway": {
      // Railway only switches traffic once healthcheckPath returns 2xx; on failure the old deployment stays live.
      // In --ci mode the exit code is the verdict: non-zero when the build or the new deployment fails.
      try {
        run("railway", ["up", "--ci", "--service", config.name]);
      } catch {
        await notify(`${config.name}: Railway deployment failed, the previous deployment is still live.`);
        return "failed";
      }
      if (await health(config.productionUrl)) return "success";
      await notify(`${config.name}: unhealthy after deploy. Redeploy the last good deployment in the Railway dashboard.`);
      return "failed";
    }
    case "kamal": {
      // --quiet prints only the version (without it the output has "App Host:" lines); assumes one server.
      let previous = "";
      try {
        previous = run("kamal", ["app", "version", "--quiet"]);
      } catch {
        // first deploy: nothing running yet
      }
      try {
        run("kamal", ["deploy"]); // kamal-proxy switches only after /up answers 200
      } catch {
        await notify(`${config.name}: kamal deploy aborted, the old container is still serving.`);
        return "failed";
      }
      if (await health(config.productionUrl)) return "success";
      if (!previous) {
        await notify(`${config.name}: unhealthy after the first deploy, nothing to roll back to.`);
        return "failed";
      }
      run("kamal", ["rollback", previous]);
      await notify(`${config.name}: unhealthy after deploy, rolled back to ${previous}.`);
      return "rolled-back";
    }
  }
}

deploy().then((status) => process.exit(status === "success" ? 0 : 1));
```

Keep the platform choice and URLs in the config object at the top (one copy per project; for Kamal use `/up` as `healthPath`). The script type-checks with `typescript` and `@types/node`; run it with `tsx` (`pnpm add -D tsx typescript @types/node`). On Vercel, the new deployment's generated URL is protected by default (Standard Protection), so create a Protection Bypass for Automation secret in the project settings and export it as `VERCEL_AUTOMATION_BYPASS_SECRET` (the script sends it in the `x-vercel-protection-bypass` header, only to the unpromoted URL). Set `SLACK_WEBHOOK_URL` as a CI secret to get notifications.

### Step 3: Wire into GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    steps:
      - uses: actions/checkout@v7
      - run: corepack enable
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Deploy to production
        run: pnpm exec tsx deploy.ts
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

`corepack enable` picks the pnpm version from the `packageManager` field in `package.json`. The Vercel project is identified by `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. For Railway the job needs `RAILWAY_TOKEN` (a project token); for Kamal it needs the registry password and an SSH key for the server. Keep runtime secrets such as `DATABASE_URL` in the platform's own settings, not in CI.

## The Outcome

Sami tells the agent "deploy my-saas-app to production." The agent runs type checks and tests, builds an unpromoted Vercel deployment, health-checks it, promotes it, re-checks the live domain and reports the URL and timings. If the new build is unhealthy it is never promoted; if the live domain fails after promotion, it rolls back and posts to Slack.

For the Railway project the same command runs with a different config, and Railway's own health gate keeps the old deployment serving if the new one never becomes healthy. For the VPS project, `kamal deploy` aborts the same way and the script rolls back to the previous version when a post-deploy check fails. The two-hour outage from a missed health check can't happen again: no platform here switches traffic to a deployment that doesn't answer its health check.

## Related Skills

- **vercel**: unpromoted production deploys, `promote` and `rollback` for the Vercel project.
- **railway-deploy**: deploys the Railway project and explains its health-gated switch and manual rollback.
- **kamal**: deploys the Docker app to the VPS with proxy health checks and `kamal rollback`.
- **github-actions**: triggers the deploy script on every push to main.
- **test-generator**: writes the tests the pre-deploy gate runs.
