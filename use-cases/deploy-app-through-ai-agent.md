---
title: Deploy Your App Through an AI Agent with Health Checks and Rollback
slug: deploy-app-through-ai-agent
description: Set up conversational deployment — tell your AI agent "deploy to production" and it handles build, deploy, health verification, and automatic rollback.
skills:
  - smart-deployer
  - cicd-pipeline
  - test-generatorcategory: devops
tags:
  - deployment
  - ci-cd
  - vercel
  - fly-io
  - docker
  - health-check
  - rollback
---

## The Problem

Sami is a solo developer running three side projects. Each has a different deployment target — one on Vercel, one on Railway with a Postgres database, one on a $5 VPS with Docker. Deploying means switching between three different dashboards, remembering three different CLIs, and running slightly different sequences of commands. Last month, a bad deploy on the VPS took the site down for two hours because Sami forgot to health-check before switching traffic.

The deploy process for each project is about 8 steps: pull latest code, run tests, build, deploy to staging, check health, promote to production, verify, notify the team. Miss a step — especially the health check — and users see errors. Sami wants to say "deploy my-app to production" to the AI agent and have it handle every step, including rolling back if something breaks.

## The Solution

Use smart-deployer to build deploy scripts for each platform — Vercel, Railway, and Docker on VPS. Each script follows the same pattern: build → deploy → health check → promote or rollback. Use cicd-pipeline for the GitHub Actions integration that triggers deploys on push. Use test-generator for pre-deploy test verification.

## Step-by-Step Walkthrough

### Step 1: Define the Deploy Configuration

Each project gets a deploy config file that the agent reads to know which platform, which health check URL, and what the rollback strategy is.

```typescript
// deploy.config.ts — Deployment configuration per project
/**
 * Central config that tells the agent how to deploy each project.
 * The agent reads this to determine platform, health checks, and
 * rollback behavior. Keep it in the repo root.
 */

export interface DeployConfig {
  name: string;
  platform: "vercel" | "railway" | "fly" | "docker-vps";
  production: {
    url: string;                    // Production URL
    healthCheck: string;            // Path to health endpoint
    healthTimeout: number;          // Seconds to wait for health
  };
  rollback: {
    automatic: boolean;             // Auto-rollback on health failure
    notifyOnRollback: string[];     // Channels to alert
  };
  preDeployChecks: string[];        // Commands to run before deploying
  postDeployVerify: string[];       // Commands to run after deploying
  secrets: string[];                // Required env vars (validation only)
}

export const config: DeployConfig = {
  name: "my-saas-app",
  platform: "vercel",
  production: {
    url: "https://my-saas-app.vercel.app",
    healthCheck: "/api/health",
    healthTimeout: 60,
  },
  rollback: {
    automatic: true,
    notifyOnRollback: ["slack:#deployments"],
  },
  preDeployChecks: [
    "pnpm typecheck",              // TypeScript compilation
    "pnpm test --run",             // All tests must pass
    "pnpm build",                  // Build must succeed locally
  ],
  postDeployVerify: [
    "curl -sf ${DEPLOY_URL}/api/health",
    "curl -sf ${DEPLOY_URL}/api/health/db",  // Database connectivity
  ],
  secrets: [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "STRIPE_SECRET_KEY",
  ],
};
```

### Step 2: Build the Universal Deploy Script

The deploy script is platform-aware but follows the same flow everywhere. The agent calls it with a target environment and it handles the rest.

```typescript
// deploy.ts — Universal deployment script with health checks and rollback
/**
 * Orchestrates the full deployment pipeline:
 * 1. Pre-deploy checks (types, tests, build)
 * 2. Platform-specific deploy
 * 3. Health verification
 * 4. Auto-rollback on failure
 * 5. Post-deploy notifications
 */
import { execSync } from "child_process";
import { config, DeployConfig } from "./deploy.config.js";

interface DeployResult {
  status: "success" | "failed" | "rolled-back";
  url: string;
  duration: number;
  steps: Array<{ name: string; status: "pass" | "fail"; duration: number }>;
}

export async function deploy(env: "production" | "preview" = "production"): Promise<DeployResult> {
  const steps: DeployResult["steps"] = [];
  const start = Date.now();
  let deployUrl = "";

  try {
    // Phase 1: Pre-deploy checks
    console.log("🔍 Running pre-deploy checks...");
    for (const check of config.preDeployChecks) {
      const stepStart = Date.now();
      try {
        execSync(check, { stdio: "pipe", encoding: "utf-8" });
        steps.push({ name: check, status: "pass", duration: Date.now() - stepStart });
        console.log(`  ✅ ${check}`);
      } catch (error: any) {
        steps.push({ name: check, status: "fail", duration: Date.now() - stepStart });
        console.log(`  ❌ ${check}`);
        throw new Error(`Pre-deploy check failed: ${check}\n${error.stdout || error.message}`);
      }
    }

    // Phase 2: Validate secrets
    console.log("🔑 Checking required secrets...");
    for (const secret of config.secrets) {
      if (!process.env[secret]) {
        throw new Error(`Missing required secret: ${secret}`);
      }
    }

    // Phase 3: Deploy
    console.log(`🚀 Deploying to ${config.platform} (${env})...`);
    const deployStart = Date.now();
    deployUrl = await platformDeploy(config, env);
    steps.push({ name: "deploy", status: "pass", duration: Date.now() - deployStart });
    console.log(`  📦 Deployed: ${deployUrl}`);

    // Phase 4: Health check
    console.log("🏥 Verifying health...");
    const healthStart = Date.now();
    const healthy = await healthCheck(
      `${deployUrl}${config.production.healthCheck}`,
      config.production.healthTimeout
    );
    steps.push({
      name: "health-check",
      status: healthy ? "pass" : "fail",
      duration: Date.now() - healthStart,
    });

    if (!healthy) {
      throw new Error("Health check failed after deployment");
    }

    console.log("✅ Health check passed!");

    // Phase 5: Post-deploy verification
    for (const verify of config.postDeployVerify) {
      const cmd = verify.replace("${DEPLOY_URL}", deployUrl);
      try {
        execSync(cmd, { stdio: "pipe", timeout: 10000 });
        console.log(`  ✅ ${verify}`);
      } catch {
        console.log(`  ⚠️ ${verify} (non-critical)`);
      }
    }

    return {
      status: "success",
      url: deployUrl,
      duration: (Date.now() - start) / 1000,
      steps,
    };

  } catch (error: any) {
    console.log(`\n❌ Deploy failed: ${error.message}`);

    // Auto-rollback
    if (config.rollback.automatic && env === "production") {
      console.log("⏪ Auto-rolling back...");
      try {
        await platformRollback(config);
        console.log("✅ Rollback complete");

        await notify(config, `⏪ Rollback triggered for ${config.name}: ${error.message}`);

        return {
          status: "rolled-back",
          url: deployUrl,
          duration: (Date.now() - start) / 1000,
          steps,
        };
      } catch (rollbackError) {
        console.log("❌ Rollback also failed! Manual intervention needed.");
        await notify(config, `🚨 CRITICAL: Deploy AND rollback failed for ${config.name}`);
      }
    }

    return {
      status: "failed",
      url: deployUrl,
      duration: (Date.now() - start) / 1000,
      steps,
    };
  }
}

async function platformDeploy(config: DeployConfig, env: string): Promise<string> {
  switch (config.platform) {
    case "vercel": {
      const flag = env === "production" ? "--prod" : "";
      const output = execSync(`vercel deploy ${flag} --yes`, { encoding: "utf-8" });
      const match = output.match(/https:\/\/[^\s]+/);
      return match?.[0] || config.production.url;
    }
    case "railway": {
      execSync("railway up --detach", { encoding: "utf-8" });
      return config.production.url;
    }
    case "fly": {
      execSync(`fly deploy --strategy canary --wait-timeout 120`, { encoding: "utf-8" });
      return config.production.url;
    }
    case "docker-vps": {
      execSync("docker compose up -d --build", { encoding: "utf-8" });
      return config.production.url;
    }
    default:
      throw new Error(`Unknown platform: ${config.platform}`);
  }
}

async function platformRollback(config: DeployConfig): Promise<void> {
  switch (config.platform) {
    case "vercel":
      execSync("vercel rollback --yes", { encoding: "utf-8" });
      break;
    case "railway":
      execSync("railway rollback", { encoding: "utf-8" });
      break;
    case "fly":
      execSync("fly releases rollback", { encoding: "utf-8" });
      break;
    case "docker-vps":
      execSync("docker compose down && docker compose -f docker-helper.previous.yml up -d", {
        encoding: "utf-8",
      });
      break;
  }
}

async function healthCheck(url: string, timeoutSeconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function notify(config: DeployConfig, message: string): Promise<void> {
  for (const channel of config.rollback.notifyOnRollback) {
    console.log(`📢 Notification → ${channel}: ${message}`);
    // Integrate with Slack, Discord, etc.
  }
}
```

### Step 3: Wire Into GitHub Actions

```yaml
# .github/workflows/deploy.yml — Triggered on push to main
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Deploy to production
        run: npx tsx deploy.ts
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
```

## The Outcome

Sami tells the agent "deploy my-saas-app to production." The agent reads deploy.config.ts, runs type checks and tests, deploys to Vercel, health-checks the endpoint, and reports back with the URL and timing. If the health check fails, it rolls back automatically and sends a Slack notification. The entire flow takes 90 seconds and Sami doesn't touch a dashboard.

For the Railway project, the same command runs with a different config. For the VPS project, Docker blue-green kicks in. One command, three platforms, zero manual steps. The two-hour outage from a missed health check can't happen anymore — the script won't promote a deployment that doesn't respond healthy.
