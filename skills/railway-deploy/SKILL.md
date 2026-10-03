---
name: railway-deploy
description: >-
  Deploys and manages apps on Railway with the Railway CLI: project setup,
  deploys, services, databases, environment variables, logs and scaling. Use
  when a user asks to deploy to Railway, check deployment status, set
  environment variables on Railway, view Railway logs, link a Railway project,
  add a database on Railway, scale a Railway service, manage Railway
  environments, redeploy, or run commands with Railway env vars.
license: Apache-2.0
compatibility: "Railway CLI 5.x (npm i -g @railway/cli, brew install railway or scoop install railway); Node.js 16+ only for the npm install"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["railway", "deploy", "cloud", "hosting", "paas"]
  repository: https://github.com/railwayapp/cli
---

# Railway Deploy

## Overview

Deploy, manage, and monitor applications on Railway from the terminal. This skill covers the CLI lifecycle: project setup, service configuration, environment variables, deployments, scaling, logs and debugging. It was checked against Railway CLI 5.63.1 and docs.railway.com (October 2026).

The CLI has no `rollback` command. Rolling back means redeploying an earlier deployment from the dashboard, or redeploying a known-good commit (see Task H).

## Instructions

### Task A: Project Setup & Linking

Install the CLI with a package manager if `railway` is missing:

```bash
npm i -g @railway/cli   # or: brew install railway / scoop install railway
```

Check whether the directory is already linked:

```bash
railway status
```

Otherwise create or link a project:

```bash
railway init --name orders-api   # create a project and link this directory
railway link                     # or link an existing project
railway login --browserless      # device-code sign-in on SSH or headless machines
```

Confirm project, service and environment with `railway status`. For CI, skip login and export a token (create it in the dashboard, store it as a CI secret):

```bash
RAILWAY_TOKEN="$RAILWAY_TOKEN" railway up --ci --service orders-api   # project token: deploys
RAILWAY_API_TOKEN="$RAILWAY_API_TOKEN" railway whoami                 # account token: account-level actions
```

### Task B: Deploy

```bash
railway up                         # upload the directory and stream logs
railway up --detach                # start the deploy and return immediately
railway up --ci                    # stream build logs only, then exit
railway up -s orders-api -e staging
railway redeploy                   # redeploy the latest deployment (same build inputs)
railway redeploy --from-source     # pull the newest commit or image from the configured source
railway restart                    # restart without rebuilding
railway down                       # remove the most recent deployment (asks to confirm; -y skips)
railway deployment list --limit 5  # IDs and statuses of recent deployments
```

`railway deploy` is not the code-deploy command: it provisions a template (`railway deploy --template postgres`).

### Task C: Services & Resources

```bash
railway add --database postgres          # also: mysql, redis, mongo
railway add --service worker --repo orders-team/orders-worker
railway add --service cache --image redis:7
railway service list                     # services in this environment
railway service status                   # deployment status per service
railway scale eu-west=2 us-east=1        # replicas per region (max 50 total)
railway domain                           # generate a *.up.railway.app domain
railway domain shop.northwind-orders.com       # custom domain; prints the DNS records to add
railway volume add --service orders-api --mount-path /data
railway volume list
```

`railway delete` removes a whole project, so never run it without the user's explicit confirmation.

### Task D: Environment Variables

```bash
railway variable list --service orders-api
railway variable set LOG_LEVEL=info PORT=8080
echo "$STRIPE_SECRET" | railway variable set STRIPE_SECRET_KEY --stdin   # keeps the value out of shell history
railway variable set FEATURE_FLAGS=beta --skip-deploys                   # change without triggering a deploy
railway variable delete OLD_API_KEY
```

By default setting a variable triggers a new deploy. `variable list --json` and `--kv` print raw secret values, so do not paste their output into chats or tickets. Services in the same project can reference each other's values with `${{Postgres.DATABASE_URL}}` syntax in the dashboard instead of copying them.

### Task E: Environments

```bash
railway environment list
railway environment new staging
railway environment create staging --duplicate production   # copy production's config
railway environment staging                                   # switch the linked environment
railway environment delete staging --yes
```

### Task F: Logs & Debugging

```bash
railway logs                       # stream the latest deployment's logs
railway logs --build               # build logs
railway logs -n 100                # last 100 lines (disables streaming)
railway logs --http                # HTTP request logs; also --network and --dns
railway logs -s orders-api -e production --json
railway ssh                        # shell in the running container
railway connect postgres           # database shell (needs psql, mongosh, etc. installed locally)
railway connect postgres --tunnel-only   # tunnel for TablePlus, DBeaver, pgAdmin
```

### Task G: Local Development

```bash
railway run --service orders-api -- npm run migrate   # Railway flags go before the command
railway shell                                          # subshell with Railway variables
```

`railway run` injects variables from the linked environment. Run against production only when the user asked for it.

### Task H: Health Checks and Rollback

Railway checks a new deployment before switching traffic. Set a health endpoint in the service settings (or `healthcheckPath` in `railway.json`); Railway polls it, with the `PORT` variable and the host `healthcheck.railway.app`, until it returns 2xx. If it does not within the timeout (default 300 s, adjustable with `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`), the deployment fails and the previous one stays live. Checks run only at startup, and a service with an attached volume still has brief downtime during deploys.

To verify from a script after `railway up --detach`:

```bash
railway up --detach
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://orders-api-production.up.railway.app/health)
  [ "$code" = "200" ] && { echo healthy; exit 0; }
  sleep 5
done
echo "unhealthy: check railway logs --build and railway logs"; exit 1
```

To roll back, open the service's Deployments tab in the dashboard and redeploy an earlier successful deployment, or check out the last good commit and run `railway up` again.

## Examples

### Example 1: Deploy a Node.js app from scratch

**User request:** "Deploy my Node.js app to Railway"

```bash
$ railway login
$ railway init --name orders-api
$ railway up
$ railway domain
```

The CLI uploads the directory, builds it, and prints a deployment URL. `railway domain` returns a generated `orders-api-production.up.railway.app` address, and `railway status` shows project `orders-api`, environment `production`.

### Example 2: Add Postgres and run migrations

**User request:** "Add a database to my Railway project and run the Prisma migrations"

```bash
$ railway add --database postgres
$ railway variable list --service orders-api   # Postgres variables appear on the new service, not automatically on yours
$ railway variable set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service orders-api
$ railway run --service orders-api -- npx prisma migrate deploy
$ railway redeploy --service orders-api --yes
```

`${{Postgres.DATABASE_URL}}` is a reference variable: Railway resolves it at runtime. Note that `railway run` executes locally, so it needs the database's public (TCP proxy) URL to be reachable from your machine; the private `*.railway.internal` host only resolves inside Railway. For a private database run the migration as a pre-deploy command in the service settings instead.

### Example 3: Debug a crashing deployment

**User request:** "My Railway deployment keeps crashing"

```bash
$ railway deployment list --limit 3 --service orders-api
$ railway logs --build --service orders-api     # did the build fail?
$ railway logs -n 50 --service orders-api       # runtime errors
$ railway variable list --service orders-api    # is DATABASE_URL pointing at localhost?
$ railway variable set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service orders-api
```

Typical findings: `ECONNREFUSED 127.0.0.1:5432` means the database URL is wrong; a healthcheck timeout means the app does not listen on `$PORT` or on `0.0.0.0`.

## Guidelines

- Run `railway status` before changes to confirm project, service and environment.
- Pass `-s` and `-e` explicitly in multi-service projects so you do not act on the wrong target.
- Use `--detach` or `--ci` in pipelines so the job does not hang on a log stream; `RAILWAY_TOKEN` is project-scoped, `RAILWAY_API_TOKEN` account-scoped.
- Most commands accept `--json` for scripts and `--yes` to skip confirmation; destructive commands (`down`, `delete`, `environment delete`) need exact selectors and the user's consent.
- Setting variables redeploys; use `--skip-deploys` when batching changes.
- Never print or share `railway variable list`, `railway run printenv` or `--json` output: it contains secrets.
- Bind the app to `0.0.0.0` and the `PORT` variable, or healthchecks and public domains fail.
- A deploy is not a rollback: `railway down` removes the latest deployment, and `railway redeploy` rebuilds the current one.
- Use Railway's `railway.json` or `railway.toml` for build, start and healthcheck settings you want in version control.
