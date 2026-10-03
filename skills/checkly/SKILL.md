---
name: checkly
description: Checkly is a synthetic monitoring platform that runs API checks and Playwright browser checks from locations worldwide and lets you define them as code with the Checkly CLI. Use when a developer asks to set up monitoring as code, write API or browser checks, configure Slack or email alerts, run checks in CI after a deploy, or turn Playwright tests into production monitors.
license: Apache-2.0
compatibility: "Node.js 22+ (see the engines field of the checkly package), a Checkly account and API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
  - synthetic-monitoring
  - e2e-testing
  - api-monitoring
  - playwright
  - monitoring-as-code
  repository: https://github.com/checkly/checkly-cli
---

# Checkly — Synthetic Monitoring and Testing

## Overview

Checkly runs scheduled checks against your production system from public (or private) locations and alerts you when they fail or degrade. With monitoring as code you describe checks in TypeScript constructs next to your application, run them with `npx checkly test`, and publish them with `npx checkly deploy`. Check types include API checks, browser checks (a single Playwright spec), Playwright Check Suites (your whole existing Playwright project run as a monitor, the current recommendation for new E2E monitoring), multistep checks, URL, TCP, DNS, ICMP, SSL, gRPC and heartbeat monitors. The CLI package `checkly` is at v9 (v8 added built-in TypeScript and recording test runs by default).

## Instructions

### 1. Project setup

```bash
npm i --save-dev checkly
npx checkly login            # or set CHECKLY_API_KEY and CHECKLY_ACCOUNT_ID for CI
npx checkly init             # scaffolds a project (and installs Checkly skills for agents)
```

Install it per project rather than globally so CI uses the same version. `checkly.config.ts`:

```typescript
import { defineConfig } from "checkly";
import { Frequency } from "checkly/constructs";

export default defineConfig({
  projectName: "Acme Storefront",
  logicalId: "lumenshop-storefront-monitoring",
  repoUrl: "https://github.com/lumenshop/storefront",
  checks: {
    runtimeId: "2026.04",                       // see `npx checkly runtimes`
    frequency: Frequency.EVERY_5M,
    locations: ["us-east-1", "eu-west-1"],
    tags: ["production"],
    checkMatch: "**/__checks__/**/*.check.ts",
    browserChecks: {
      frequency: Frequency.EVERY_10M,
      testMatch: "**/__checks__/**/*.spec.ts",  // Playwright specs become browser checks
    },
  },
  cli: { runLocation: "eu-west-1" },
});
```

`logicalId` identifies the project: changing it creates a new project instead of updating the old one. Alert channels are constructs; attach them to checks (or a check group) with `alertChannels`.

```typescript
// __checks__/alert-channels.ts
import { EmailAlertChannel, SlackAppAlertChannel } from "checkly/constructs";

export const emailOps = new EmailAlertChannel("email-ops", {
  address: "ops@lumenshop.io",
  sendFailure: true, sendRecovery: true, sendDegraded: true,
});
// Needs the Checkly Slack app installed in your workspace. The webhook-based
// SlackAlertChannel (url + channel) is deprecated.
export const slackOps = new SlackAppAlertChannel("slack-ops", { slackChannels: ["#ops"] });
```

### 2. API checks

```typescript
// __checks__/orders-api.check.ts
import * as path from "path";
import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";
import { emailOps, slackOps } from "./alert-channels";

new ApiCheck("orders-api-health", {
  name: "Orders API health",
  frequency: Frequency.EVERY_1M,
  alertChannels: [slackOps, emailOps],
  degradedResponseTime: 1000,          // ms, defaults to 10000
  maxResponseTime: 3000,               // ms, defaults to 20000
  request: {
    method: "GET",
    url: "https://api.lumenshop.io/v1/health",
    headers: [{ key: "Authorization", value: "Bearer {{ORDERS_API_TOKEN}}" }],
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.status").equals("healthy"),
      AssertionBuilder.jsonBody("$.version").notEmpty(),
    ],
  },
});
```

`{{NAME}}` placeholders are filled from Checkly environment variables, so keep secrets there (or use the `secret()` helper from `checkly/util` for values that must be masked), not in the repo. Setup and teardown scripts take either `entrypoint` (a `.ts`/`.js` file) or inline `content`, never both; the teardown property is spelled `tearDownScript`:

```typescript
new ApiCheck("orders-create", {
  name: "Orders API create and clean up",
  request: {
    method: "POST",
    url: "https://api.lumenshop.io/v1/orders",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: JSON.stringify({ items: [{ sku: "SKU-1042", quantity: 1 }], dryRun: true }),
    assertions: [AssertionBuilder.statusCode().equals(201)],
  },
  setupScript: { entrypoint: path.join(__dirname, "scripts/orders-setup.ts") },
  tearDownScript: { entrypoint: path.join(__dirname, "scripts/orders-teardown.ts") },
});
```

### 3. Browser checks and Playwright Check Suites

A browser check wraps one Playwright spec; a Playwright Check Suite runs your whole Playwright project with its own `playwright.config.ts`.

```typescript
import { BrowserCheck, PlaywrightCheck, Frequency } from "checkly/constructs";
import * as path from "path";

new BrowserCheck("login-flow", {
  name: "Login flow",
  frequency: Frequency.EVERY_10M,
  code: { entrypoint: path.join(__dirname, "login.spec.ts") },
});

new PlaywrightCheck("critical-e2e", {
  name: "Critical E2E suite",
  playwrightConfigPath: path.join(__dirname, "../playwright.config.ts"),
  pwProjects: ["chromium"],
  pwTags: ["@critical"],
  installCommand: "npm ci",
  frequency: Frequency.EVERY_15M,
});
```

```typescript
// __checks__/login.spec.ts
import { test, expect } from "@playwright/test";

test("user can sign in", async ({ page }) => {
  await page.goto("https://app.lumenshop.io/login");
  await page.getByLabel("Email").fill(process.env.MONITOR_USER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.MONITOR_USER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

Browser checks have a 2.7 GiB memory limit; Playwright Check Suites get more. Runners use UTC.

### 4. Test, deploy, CI

```bash
npx checkly test                          # run all checks in the cloud, nothing is saved as a monitor
npx checkly test --grep="orders" --tags=production --env-file=.env
npx checkly test --record                 # keep logs, traces and videos (default since v8)
npx checkly deploy --preview              # show the diff
npx checkly deploy --force                # non-interactive deploy for CI
```

By default `deploy` deletes resources that were removed from code; `--preserve-resources` detaches them and keeps history. GitHub Actions, using the maintained action (the old `checkly/checkly-github-action` v1 repository no longer resolves):

```yaml
- uses: checkly/checkly-action@v1
  with:
    command: test
    install-command: npm ci
    reporting: auto
  env:
    CHECKLY_API_KEY: ${{ secrets.CHECKLY_API_KEY }}
    CHECKLY_ACCOUNT_ID: ${{ vars.CHECKLY_ACCOUNT_ID }}
    ENVIRONMENT_URL: ${{ needs.deploy.outputs.url }}
```

Deploy from `main` with `npx checkly deploy --force`. The docs guide "Run checks on every deploy" shows testing a preview URL on pull requests and a `trigger` run after each production deployment.

## Examples

### Example 1: "Monitor our public API every minute and ping Slack"

Add `alert-channels.ts` and `orders-api.check.ts` as above, then run:

```bash
npx checkly test --grep="orders-api"
npx checkly deploy --force
```

Result: the test run prints a pass/fail per location with response times; after deploy the check appears in the Checkly dashboard and posts to `#ops` on failure, degradation and recovery.

### Example 2: "Reuse our Playwright tests as production monitors"

```bash
npx checkly test --tags=critical --record
```

With the `PlaywrightCheck` above, the tagged tests run in Checkly's cloud with traces; after `npx checkly deploy --force` they run every 15 minutes. Result: a failed run links to the trace and video, and the alert goes to the channels on the check.

## Guidelines

- Pin `runtimeId` and check `npx checkly runtimes`; a check can only import npm packages the runtime provides (`--verify-runtime-dependencies` reports misses).
- Keep `logicalId` values stable; they are what ties code to deployed resources.
- Monitors must be safe to run forever: use dedicated test accounts, `dryRun`-style flags and teardown scripts, and never real card numbers. Do not run a real purchase every ten minutes.
- Use retry strategies (`RetryStrategyBuilder`) before alerting on a single blip, and multiple locations to separate regional problems.
- Store API tokens and passwords as Checkly environment variables or secrets; never in checks committed to git.
- Run frequency and location counts affect cost; start at five to ten minutes.
- Not a load-testing tool or a log or APM platform.
