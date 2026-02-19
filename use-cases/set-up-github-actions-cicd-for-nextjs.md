---
title: Set Up GitHub Actions CI/CD for a Next.js App
slug: set-up-github-actions-cicd-for-nextjs
description: "Build a complete CI/CD pipeline with GitHub Actions — lint, type-check, test, build, preview deploys on PRs, and production deploys on merge to main."
skills: [github-actions]
category: devops
tags: [github-actions, cicd, nextjs, testing, deployment, automation]
---

# Set Up GitHub Actions CI/CD for a Next.js App

## The Problem

A team of five developers works on a Next.js application with no CI/CD pipeline. Every merge to `main` goes through a manual process: someone runs `npm run lint` and `npm test` locally (or forgets to), someone else reviews the PR by reading the diff without seeing it running, and the lead developer SSHes into the production server to pull the latest code and restart the process. The "deploy" is a 15-minute ritual that nobody wants to do on a Friday.

This manual process has caused three incidents in the past month: a TypeScript error that passed lint but failed the build (nobody ran `npm run build` locally), a broken API route that existing tests would have caught (but weren't run), and a production deployment that included uncommitted debug logging because the developer deployed from a dirty working directory.

The team needs a pipeline that runs automatically on every push: lint and type-check to catch errors early, tests to prevent regressions, preview deployments on PRs so reviewers can actually use the feature before approving, and automatic production deployment when code merges to `main`. No SSH, no manual steps, no "it works on my machine."

## The Solution

Use the **github-actions** skill to build a multi-stage CI/CD pipeline. The pipeline runs on every PR (lint → type-check → test → build → preview deploy) and on every merge to `main` (same checks → production deploy). GitHub Actions is free for public repos and includes 2,000 minutes/month for private repos on the free tier.

## Step-by-Step Walkthrough

### Step 1: Create the CI Workflow

```text
Set up a GitHub Actions CI pipeline for a Next.js 14 app with TypeScript, 
ESLint, Vitest for unit tests, and Playwright for e2e tests. The pipeline should:
1. Run on every push and PR to main
2. Lint, type-check, unit test, and build in parallel where possible
3. Run e2e tests against the built app
4. Cache dependencies between runs
5. Fail fast — cancel if any step fails
```

```yaml
# .github/workflows/ci.yml — CI pipeline for every push and PR

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-progress runs when a new commit is pushed to the same PR
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # --- Stage 1: Install dependencies (shared across jobs via cache) ---
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      # Cache node_modules for subsequent jobs
      - uses: actions/cache/save@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}

  # --- Stage 2: Lint, type-check, and unit tests (parallel) ---
  lint:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}
      - run: npm run lint

  typecheck:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}
      - run: npx tsc --noEmit

  test:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}
      - run: npm test -- --reporter=verbose

  # --- Stage 3: Build (depends on all checks passing) ---
  build:
    needs: [lint, typecheck, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}

      # Cache Next.js build output for faster subsequent builds
      - uses: actions/cache@v4
        with:
          path: .next/cache
          key: nextjs-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: nextjs-${{ hashFiles('package-lock.json') }}-

      - run: npm run build

      # Upload build artifact for e2e tests and deployment
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: .next
          retention-days: 1

  # --- Stage 4: E2E tests against the built app ---
  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: modules-${{ hashFiles('package-lock.json') }}

      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: .next

      # Install Playwright browsers
      - run: npx playwright install --with-deps chromium

      # Start the app and run e2e tests
      - run: npm start &
      - run: npx wait-on http://localhost:3000 --timeout 30000
      - run: npx playwright test

      # Upload test report on failure
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 7
```

### Step 2: Add Preview Deployments for PRs

Preview deployments let reviewers interact with the actual running feature, not just read code diffs. This example deploys to Vercel, but the pattern works with any platform:

```yaml
# .github/workflows/preview.yml — Deploy preview for every PR

name: Preview Deploy

on:
  pull_request:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    # Only after CI passes
    needs: []  # Remove this if you want preview without waiting for CI
    permissions:
      pull-requests: write  # To post the preview URL as a comment

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel Preview
        id: deploy
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Comment Preview URL on PR
        uses: actions/github-script@v7
        with:
          script: |
            const url = '${{ steps.deploy.outputs.preview-url }}';
            const body = `## 🔗 Preview Deploy\n\nReady for review: ${url}\n\n_Deployed from ${context.sha.substring(0, 7)}_`;
            
            // Find and update existing comment, or create new one
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body?.includes('Preview Deploy'));
            
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

```

### Step 3: Production Deployment on Merge

```yaml
# .github/workflows/deploy.yml — Production deploy on merge to main

name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    # Only deploy if CI passes (this is a separate workflow triggered by push)
    environment: production  # Requires approval if configured

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: --prod
```

For self-hosted deployments (VPS, Coolify):

```yaml
  deploy-self-hosted:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: deploy
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/app
            git pull origin main
            npm ci --production
            npm run build
            pm2 restart app
```

### Step 4: Add Status Checks and Branch Protection

Configure at GitHub → Settings → Branches → Branch protection rules for `main`:

- **Require status checks to pass before merging**: select `lint`, `typecheck`, `test`, `build`, `e2e`
- **Require branches to be up to date before merging**: prevents merging stale PRs
- **Require pull request reviews**: at least 1 approval

This means nobody can merge to `main` unless all CI jobs pass and the code is reviewed. No exceptions, no "just this once."

### Step 5: Add Dependency Caching for Speed

The install job caches `node_modules` keyed by `package-lock.json`. When dependencies don't change (most PRs), subsequent runs skip the install entirely:

| Step | First run | Cached run |
|---|---|---|
| npm ci | 45s | 3s (cache restore) |
| Next.js build | 90s | 25s (build cache) |
| Playwright install | 30s | 5s (browser cache) |
| **Total pipeline** | **~4 min** | **~1.5 min** |

## Real-World Example

A five-person team sets up the pipeline on a Monday morning. The first PR after setup takes 4 minutes to run — lint, type-check, tests, build, and e2e tests all pass. The preview URL appears as a PR comment, and the reviewer opens it on their phone to check the mobile layout. They approve after seeing the feature actually work, not just reading the diff.

On Wednesday, a developer pushes a commit that introduces a type error in an API route. TypeScript catches it in the `typecheck` job in 20 seconds — before any tests even run. The developer gets a notification, fixes the type, pushes again, and the pipeline passes. The error never reaches `main`.

The following Friday, the team merges three PRs to `main` throughout the day. Each merge triggers automatic production deployment. No SSH, no "who's deploying?", no post-deploy verification ritual. The pipeline handles it. The team lead checks the GitHub Actions tab at 5 PM and sees three green deployments — zero manual intervention for the entire week.

After a month, the team has merged 47 PRs. The pipeline caught 12 issues that would have reached production: 4 type errors, 3 lint violations that indicated bugs, 2 test failures from regressions, and 3 build failures from missing imports. Each issue was caught in under 2 minutes and fixed before review even started.

## Related Skills

- [github-actions](../skills/github-actions/) -- Deep dive into workflow syntax, custom actions, and matrix builds
- [playwright-testing](../skills/playwright-testing/) -- E2E testing patterns for the CI pipeline
