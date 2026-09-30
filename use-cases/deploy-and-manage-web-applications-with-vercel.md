---
title: Deploy and Manage Web Applications with Vercel
slug: deploy-and-manage-web-applications-with-vercel
description: Give a small team preview links for every branch and a tested, reversible production release, run from the terminal and GitHub Actions.
skills:
  - vercel
  - github-actions
category: devops
tags:
  - vercel
  - preview-deployments
  - github-actions
  - rollback
  - environment-variables
---

## The Problem

Priya Raman is the only frontend engineer at Lumenfield, a six-person shop that sells refurbished film cameras. The storefront is a Vite app. Releases go out by hand: she builds on her laptop and uploads the `dist` folder to a shared host over SFTP. One release takes about 40 minutes, and she ships twice a week.

Two things keep going wrong. QA has no way to see a branch before it is merged, so bugs are found on the live site. And when a release breaks checkout, the only way back is to rebuild an old commit and upload it again. Last month that took 55 minutes, during which the shop lost an estimated 31 orders.

The company's policy also says source code is built in its own CI, and only build output may be uploaded to a hosting provider.

## The Solution

The agent uses the **vercel** skill to link the project, store environment variables, create preview deployments and handle promotion and rollback. It uses the **github-actions** skill to write the workflows that build in GitHub's runners and upload only the prebuilt output.

## Step-by-Step Walkthrough

### 1. Link the project and check the session

**Prompt:** "I ran `vercel login` already. Connect this repo to a Vercel project called storefront-web in our lumenfield team."

```bash
cd ~/code/storefront-web
npm i -g vercel
vercel whoami
vercel link --yes --team lumenfield --project storefront-web
```

The agent reads `orgId` and `projectId` from `.vercel/project.json` for step 4, and adds `.vercel/` and `.env*.local` to `.gitignore`.

### 2. Store the environment variables

**Prompt:** "Production needs STRIPE_WEBHOOK_SECRET, it is in my shell as an environment variable. Previews should call the preview API."

```bash
printf '%s' "$STRIPE_WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add VITE_API_URL preview --value "https://api-preview.lumenfield.co"
vercel env add VITE_API_URL production --value "https://api.lumenfield.co"
vercel env ls production
```

The secret is piped from the variable, so it never appears in the command line or shell history.

### 3. Create a preview for QA

**Prompt:** "Deploy the gift-cards branch as a preview and give me the link."

```bash
vercel list --prod
PREVIEW_URL=$(vercel deploy --yes)
vercel inspect "$PREVIEW_URL" --wait --timeout=5m
echo "$PREVIEW_URL"
```

The first deployment of a new project always becomes production, so the agent checks `vercel list --prod` first. The project already has its initial production deployment, which makes this one a preview. The agent returns the address, for example `https://storefront-web-k3x9p2m4q.vercel.app`. Production is not affected.

### 4. Build in CI, upload only the output

**Prompt:** "Set up GitHub Actions: previews for every branch, production on main. Build in our CI, not on Vercel."

The user creates a token at https://vercel.com/account/tokens and saves three repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. The agent writes `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: ["**"]
env:
  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
jobs:
  preview:
    if: github.ref != 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm install --global vercel@latest
      - run: vercel pull --yes --environment=preview
      - run: vercel build
      - run: vercel deploy --prebuilt --archive=tgz >> "$GITHUB_STEP_SUMMARY"
  production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm install --global vercel@latest
      - run: vercel pull --yes --environment=production
      - run: vercel build --prod
      - run: vercel deploy --prebuilt --prod --skip-domain --archive=tgz >> "$GITHUB_STEP_SUMMARY"
```

Because standard output of `vercel deploy` is only the URL, the job summary shows the link. With `--skip-domain` the production build is staged: it exists, but the shop's domain still serves the previous release.

### 5. Promote after the smoke test

**Prompt:** "The staged build passed the checkout smoke test. Make it live."

```bash
vercel promote https://storefront-web-p8r4t1v6e.vercel.app
vercel promote status
```

### 6. Roll back when something breaks

**Prompt:** "Orders are failing since the last release. Go back to the previous version and tell me what the errors are."

```bash
vercel logs --environment production --status-code 5xx --since 30m --json | jq -r '.message' | sort | uniq -c | sort -rn
vercel list --prod
vercel rollback https://storefront-web-7hd2b0wzc.vercel.app
vercel rollback status
```

The agent reports the most frequent error message and confirms which deployment now serves the domain.

## Real-World Example

Priya ran through steps 1 to 4 on a Tuesday afternoon; the setup took about 50 minutes, most of it creating the token and the three repository secrets. From then on every push produced a preview link in the job summary within 3 minutes, and QA started reviewing branches before merge.

Three weeks later a release broke the gift-card field at checkout. The agent found 212 occurrences of the same `TypeError` in the production logs, rolled back to the previous deployment and confirmed the rollback, all in under 4 minutes instead of 55. Priya fixed the bug on a branch, checked it on its preview link, and promoted the new build the same evening.

A release now costs her about 5 minutes of attention instead of 40. At two releases a week that is more than an hour saved weekly, and source code is still only ever built inside the company's own CI.

## Related Skills

- [vercel](/skills/vercel) — links the project, manages variables, creates previews, promotes and rolls back production
- [github-actions](/skills/github-actions) — runs the build in CI on every push and uploads the prebuilt output with repository secrets
