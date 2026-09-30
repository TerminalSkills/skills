---
name: vercel
description: >-
  Vercel CLI deploys websites, web apps and serverless functions to the Vercel
  platform from a terminal or CI job, and manages their environment variables,
  domains and logs. Use when a user asks to deploy to Vercel, create a preview
  deployment, ship to production, promote or roll back a deployment, add or
  pull Vercel environment variables, write a vercel.json, read build or runtime
  logs, or deploy from GitHub Actions with a Vercel token.
license: Apache-2.0
compatibility: "Node.js 18+ with npm; a Vercel account (free Hobby plan works)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["vercel", "deployment", "serverless", "preview-deployments", "ci-cd"]
  repository: https://github.com/vercel/vercel
---
# Vercel CLI — Deploy, preview and ship from the terminal

## Overview

The `vercel` command (alias `vc`) uploads a project, builds it on Vercel and returns a URL. Every deployment is either a preview (unique URL, safe to share) or production (serves the project's domains). The same CLI links a directory to a project, manages environment variables, reads logs, and promotes or rolls back releases. Use it when Git-push deploys are not enough: local previews, scripted releases, CI pipelines on other providers, or debugging a broken deploy.

## Instructions

### Installation

```bash
npm i -g vercel
vercel --version
```

In CI, install per job with `npm install --global vercel@latest`. An experimental native build exists as `@vercel/vc-native`; it replaces the global `vercel` and `vc` commands, so install it only when the user asks for it.

### Authentication

`vercel login` opens a browser flow and needs a human. Ask the user to run it once, then confirm with:

```bash
vercel whoami
```

For CI and unattended runs, authenticate with a token. The user creates it at https://vercel.com/account/tokens (or with `vercel tokens add "CI deploy"`) and exposes it as `VERCEL_TOKEN`. The CLI reads that variable on its own; prefer it over `--token`, which leaks into process lists and logs.

```bash
export VERCEL_ORG_ID="team_9fK2mQx7LpVbT3"      # "orgId" in .vercel/project.json
export VERCEL_PROJECT_ID="prj_Hc81dRzW4nYs0Pq"  # "projectId" in .vercel/project.json
vercel deploy --yes                              # VERCEL_TOKEN is already set in the environment
```

With `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` set, no linking step is needed.

### Link a directory to a project

```bash
vercel link --yes --team lumenfield --project storefront-web
```

This writes `.vercel/project.json` with `orgId` and `projectId`. To unlink, the user removes the `.vercel` directory. Use `--cwd apps/storefront` on any command to work from another directory.

### Deploy

```bash
vercel deploy                        # preview deployment
vercel deploy --prod                 # production deployment
vercel deploy --prod --skip-domain   # production build, domains not switched yet
vercel deploy --target=staging       # custom environment
vercel deploy --dry                  # show detected framework and files, upload nothing
```

Standard output is always the deployment URL and nothing else; progress and errors go to standard error. Capture the URL instead of parsing text:

```bash
PREVIEW_URL=$(vercel deploy --yes)
vercel inspect "$PREVIEW_URL" --wait --timeout=5m
```

A non-zero exit code means the deployment failed. Add `--logs` to stream the build log while deploying.

### Build locally, upload only the output

```bash
vercel pull --yes --environment=preview
vercel build
vercel deploy --prebuilt --archive=tgz
```

`vercel pull` caches project settings and variables under `.vercel/`; `vercel build` writes `.vercel/output`. For production use `--environment=production`, `vercel build --prod` and `vercel deploy --prebuilt --prod`. Source code never leaves the machine in this flow.

### Environment variables

```bash
vercel env ls production
printf '%s' "$STRIPE_WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production
printf '%s' "$STRIPE_WEBHOOK_SECRET" | vercel env update STRIPE_WEBHOOK_SECRET production --yes
vercel env add NEXT_PUBLIC_API_URL preview --git-branch feature-gift-cards --value "https://api-preview.lumenfield.co"
vercel env pull .env.local                       # development values, default file name
vercel env run -e preview -- npm test            # inject values without writing a file
```

The value comes from stdin, from `--value` (fine for public settings, not for secrets), or from an interactive prompt. Values added to production or preview are stored as sensitive by default and cannot be read back later. Environments are `production`, `preview`, `development`, or a custom environment name.

### Inspect and debug

```bash
vercel list --prod
vercel list --status ERROR,BUILDING
vercel inspect https://storefront-web-k3x9p2m4q.vercel.app --logs
vercel logs --environment production --level error --since 1h
vercel logs --status-code 5xx --json | jq -r '.message'
vercel logs --follow --deployment https://storefront-web-k3x9p2m4q.vercel.app
```

`inspect --logs` prints build logs. `logs` prints request logs for the last 24 hours (100 entries unless `--limit` is set); `--follow` streams runtime logs for up to 5 minutes.

### Promote, roll back, redeploy

```bash
vercel promote https://storefront-web-k3x9p2m4q.vercel.app
vercel rollback https://storefront-web-7hd2b0wzc.vercel.app
vercel rollback status
vercel redeploy https://storefront-web-k3x9p2m4q.vercel.app
```

`promote` points the production domains at an existing deployment; promoting a preview build asks for confirmation (`--yes` skips it) and creates a new production deployment. Undo a rollback by promoting the newer deployment again.

### Domains

```bash
vercel domains add shop.lumenfield.co storefront-web
vercel domains verify shop.lumenfield.co
vercel alias set https://storefront-web-k3x9p2m4q.vercel.app staging.lumenfield.co
```

Pass domains without `https://`. For production traffic prefer `--skip-domain` plus `promote` over `alias`.

### Project configuration: vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "redirects": [
    { "source": "/pricing-2025", "destination": "/pricing", "permanent": true }
  ],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }]
    }
  ],
  "functions": { "api/**/*.ts": { "maxDuration": 30 } },
  "crons": [{ "path": "/api/nightly-report", "schedule": "0 3 * * *" }]
}
```

A project uses one config file: `vercel.json`, `vercel.toml` or `vercel.ts`. Values here override the dashboard settings for that deployment.

### Deploy from GitHub Actions

```yaml
name: Production deploy
on:
  push:
    branches: [main]
env:
  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm install --global vercel@latest
      - run: vercel pull --yes --environment=production
      - run: vercel build --prod
      - run: vercel deploy --prebuilt --prod
```

## Examples

### Example 1: Preview a branch and share the link

**Request:** "Deploy my gift-cards branch as a preview and give me a link for QA. It needs the preview API URL."

```bash
cd ~/code/storefront-web
vercel whoami
vercel env add NEXT_PUBLIC_API_URL preview --git-branch feature-gift-cards --value "https://api-preview.lumenfield.co"
PREVIEW_URL=$(vercel deploy --yes)
vercel inspect "$PREVIEW_URL" --wait --timeout=5m
echo "$PREVIEW_URL"
```

**Result:** `vercel whoami` prints the account name, confirming the session. The last line prints the preview address, in the form `https://storefront-web-k3x9p2m4q.vercel.app`. `inspect --wait` returns once the build has finished; if it failed, `vercel inspect "$PREVIEW_URL" --logs` shows the build error. Production is untouched.

### Example 2: Production returns 500s after a release

**Request:** "Checkout started failing right after the 14:20 deploy. Put the previous version back and show me what broke."

```bash
vercel logs --environment production --status-code 5xx --since 30m --json | jq -r '.message' | sort | uniq -c | sort -rn
vercel list --prod
vercel rollback https://storefront-web-7hd2b0wzc.vercel.app
vercel rollback status
```

**Result:** The first command prints each distinct error message with its count, most frequent first, for example 212 lines of `TypeError: Cannot read properties of undefined (reading 'giftCard')`. `vercel list --prod` shows recent production deployments, from which the agent picks the last one that was healthy. After `rollback`, the production domains serve that deployment again and `rollback status` confirms it completed. The failed deployment stays available at its own URL for debugging.

## Guidelines

- **Know what is production.** The first deployment of a new project is always production, even without `--prod`. Afterwards plain `vercel deploy` is a preview. Confirm with the user before any `--prod`, `promote` or `rollback`.
- **Commands that remove things need explicit approval.** `vercel remove`, `vercel env rm`, `vercel domains rm`, `vercel alias rm` and `vercel project rm` are irreversible. Do not run them on your own initiative, and never combine them with `--yes` unless the user asked for exactly that.
- **Never print or commit tokens.** Read `VERCEL_TOKEN` from the environment or the CI secret store. Files written by `vercel env pull` and `vercel pull` contain real values: keep `.env*.local` and `.vercel/` in `.gitignore`.
- **Avoid `echo value | vercel env add`** with a literal secret: the value lands in shell history. Pipe from a variable or a file, or let the user type it at the prompt.
- **Prompts block automation.** Pass `--yes` or `--non-interactive`. The CLI switches to non-interactive mode by itself when it detects an agent; `vercel login` still needs a human.
- **`--prebuilt` skips Vercel's build container**, so system environment variables are missing at build time. Frameworks that read them during the build need a normal deploy or a Git-based deploy.
- **Branch-specific preview variables** apply only when the deployment is associated with that branch. From a detached checkout in CI, add `--meta githubDeployment=1 --meta githubCommitRef=feature-gift-cards`.
- **Thousands of files?** Use `--archive=tgz` to stay under upload limits.
- **Hobby plan** can only roll back to the immediately previous production deployment.
- **Do not reach for `vercel dev` by default.** When the framework has its own dev server (`next dev`, `vite`), use that; `vercel dev --listen 5005` is for testing Vercel Functions and routing rules locally.
- **When not to use the CLI:** if the repository is connected through Vercel's Git integration and the user only wants deploys on push, no CLI step is needed. For a static site that must live on the user's own server or another host, this tool does not apply.
