---
name: lobehub
description: >-
  Deploys and configures LobeHub (formerly LobeChat), an open-source AI chat and agent workspace with accounts, saved conversations, agents, a knowledge base and many model providers. Use when a user asks to self-host LobeHub or LobeChat, run the lobehub/lobehub Docker image, set up Postgres, S3 and Better Auth for it, add OpenAI, Anthropic or OpenRouter keys through environment variables, restrict sign-ups, or update an existing instance.
license: Apache-2.0
compatibility: "Docker with Docker Compose v2, Linux or macOS (Windows through WSL 2); the docs list 2 CPU cores and 4 GB RAM as the minimum. Verified with the lobehub/lobehub 2.3.1 image."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "lobehub, lobechat, self-hosted, ai-chat, docker"
  repository: https://github.com/lobehub/lobehub
---
# LobeHub — Self-Hosted AI Chat and Agent Workspace

## Overview

LobeHub (the project formerly called LobeChat; the repository is `lobehub/lobehub`) is a web workspace where people chat with many model providers, build agents and keep a knowledge base. The self-hosted "server database" edition is a Next.js app in the Docker image `lobehub/lobehub` that listens on port 3210. It needs:

- **PostgreSQL** with the `pgvector` and `pg_search` extensions (the docs use the `paradedb/paradedb:latest-pg17` image);
- **S3-compatible storage** for uploads (the Compose stack ships RustFS; Cloudflare R2 or MinIO also work);
- **secrets**: `KEY_VAULTS_SECRET`, `AUTH_SECRET` and `JWKS_KEY` (accounts use Better Auth, so there is no shared access code in this version);
- **model provider keys** as environment variables.

The image runs database migrations itself on every start. An older image, `lobehub/lobe-chat`, stopped at tag `1.143.3`; use `lobehub/lobehub` for new installs. This skill is for deploying and operating the service, not for clicking through the chat UI.

## Instructions

### Option A: official Docker Compose stack

The recommended route is the upstream Compose stack (LobeHub, gateway, PostgreSQL, Redis, RustFS, SearXNG). The project's helper script `setup.sh` downloads the Compose files, generates every secret and fills `.env`. Download the copy from the release tag, check its SHA-256 (computed from the v2.3.1 file; recompute it when you move to a newer tag), read it, then run it. The script itself fetches the Compose files from the repository's `main` branch:

```bash
mkdir lobehub && cd lobehub
curl -fsSL -o setup.sh https://raw.githubusercontent.com/lobehub/lobehub/v2.3.1/docker-compose/setup.sh
echo "837b5acfcfc2000d464838050595f3b3322282bc7ec41c4a3e8589213ff73a4f  setup.sh" | sha256sum -c -   # v2.3.1 copy
less setup.sh                  # review before running
bash setup.sh -l en            # interactive: local mode, port mode or domain mode
docker compose up -d
docker compose logs -f lobe    # the service container is named "lobehub"; the compose service is "lobe"
```

Modes asked by the script: local (reachable only from this machine, the default), port (plain http on a LAN or public IP) and domain (https behind a reverse proxy, one host for the app, one for RustFS and one for the gateway). The script needs `openssl` and either `curl` or `wget`, and uses Node.js (or the `lobehub/lobehub` image) to create the `JWKS_KEY`.

Without the script, fetch `docker-compose.yml` and `.env` from `docker-compose/deploy/` (`.env.example`) in the repository and replace the placeholders in `.env` yourself: `KEY_VAULTS_SECRET` and `AUTH_SECRET` (`openssl rand -base64 32` each), `GATEWAY_SERVICE_TOKEN` (`openssl rand -hex 32`), `JWKS_KEY` and its public half `JWKS_PUBLIC_KEY`, `POSTGRES_PASSWORD`, `RUSTFS_SECRET_KEY`, and the three URLs `APP_URL`, `S3_ENDPOINT` and `AGENT_GATEWAY_URL` as the browser sees them.

### Bind every port to localhost

The shipped Compose file publishes `3210`, `5432`, `6379`, the RustFS ports and the gateway ports on all interfaces. Edit the `ports:` entries so the host side starts with `127.0.0.1:`, for example `'127.0.0.1:${LOBE_PORT}:3210'`, and delete the `5432:5432` and `6379:6379` mappings (the file's own comments say they are optional). Put a reverse proxy such as Caddy or nginx in front for remote access; the gateway domain needs WebSocket upgrades. Browsers must be able to reach `S3_ENDPOINT` (RustFS) and `AGENT_GATEWAY_URL`, so these two cannot stay on localhost for remote users.

### Option B: one container plus your own Postgres

This is the smallest working set, checked with image `lobehub/lobehub:2.3.1`. First create the secrets in an env file. The `JWKS_KEY` is an RS256 key set; the docs page `environment-variables/auth` has a generator, or use Node.js:

```bash
node -e 'const c=require("crypto");const {privateKey}=c.generateKeyPairSync("rsa",{modulusLength:2048});console.log("JWKS_KEY="+JSON.stringify({keys:[{...privateKey.export({format:"jwk"}),alg:"RS256",kid:c.randomBytes(8).toString("hex"),use:"sig"}]}))' > lobehub.env
cat >> lobehub.env <<EOF
APP_URL=http://127.0.0.1:3210
KEY_VAULTS_SECRET=$(openssl rand -base64 32)
AUTH_SECRET=$(openssl rand -base64 32)
DATABASE_URL=postgres://postgres:${PG_PASSWORD}@lobehub-pg:5432/postgres
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_ENDPOINT=${S3_ENDPOINT}
S3_BUCKET=lobe
EOF
chmod 600 lobehub.env
```

`PG_PASSWORD` and the S3 variables come from the shell: the user creates the bucket and access key in their S3 provider. Then start Postgres and LobeHub on one Docker network:

```bash
docker network create lobehub-net
docker run -d --name lobehub-pg --network lobehub-net \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" -v lobehub-pgdata:/var/lib/postgresql/data \
  paradedb/paradedb:latest-pg17 \
  -c shared_preload_libraries=pg_search,pg_cron,pg_stat_statements
docker run -d --name lobehub --network lobehub-net -p 127.0.0.1:3210:3210 \
  --env-file lobehub.env lobehub/lobehub:2.3.1
docker logs lobehub | grep -E "migration pass|Ready"
```

Wait until `pg_isready` succeeds in the Postgres container before starting LobeHub. Keep the full `shared_preload_libraries` list above: the shorter value shown in some docs pages (`pg_search` alone) made the current ParadeDB image abort its first start with "pg_cron can only be loaded via shared_preload_libraries".

A started instance answers `GET /` with a redirect to `/signin`, and `/signin` returns 200.

### Model providers

Providers are configured with environment variables in `.env` (or `lobehub.env`), then `docker compose up -d` again (or recreate the container):

```bash
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL_LIST=-all,+gpt-4o-mini        # +add, -hide, name=display; "-all" hides everything first
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
OPENAI_PROXY_URL=https://api.openai.com/v1   # only to point at a compatible gateway
```

Providers follow the pattern `<NAME>_API_KEY`; only some also have `<NAME>_PROXY_URL` or `<NAME>_MODEL_LIST` (OpenAI and OpenRouter have a model list; Anthropic has a proxy URL but no model list variable), so look the provider up in the docs before setting either. `ENABLED_OPENAI=0` turns OpenAI off. Users can also add their own keys in the settings UI. The full list is the docs page `environment-variables/model-provider`.

### Accounts and sign-up control

```bash
AUTH_ALLOWED_EMAILS=brightpath.dev,priya@brightpath.dev   # domains or addresses allowed to register
AUTH_DISABLE_EMAIL_PASSWORD=1                               # SSO only
AUTH_SSO_PROVIDERS=github,google                            # order of login buttons
AUTH_EMAIL_VERIFICATION=1                                   # needs the SMTP section of the auth docs page
```

SSO providers take their own client id and secret variables; see `environment-variables/auth` in the docs.

### Update and back up

```bash
docker compose exec postgresql pg_dump -U postgres lobechat > backup-$(date +%F).sql
docker compose pull && docker compose up -d
```

`KEY_VAULTS_SECRET` encrypts stored user API keys: never change it after first use, and back it up with `.env`. Release notes: https://github.com/lobehub/lobehub/releases. When a release changes `docker-compose.yml` (the gateway service was added this way), download the new file and follow "Upgrading an Existing Deployment" in the Docker Compose docs before starting it.

## Examples

### Example 1: Private chat for a design team on one server

Request: "Set up LobeHub for our six designers on the office server, only people with a brightpath.dev address may register."

```bash
mkdir ~/lobehub && cd ~/lobehub
curl -fsSL -o setup.sh https://raw.githubusercontent.com/lobehub/lobehub/v2.3.1/docker-compose/setup.sh
echo "837b5acfcfc2000d464838050595f3b3322282bc7ec41c4a3e8589213ff73a4f  setup.sh" | sha256sum -c -
bash setup.sh -l en                       # choose domain mode: chat.brightpath.dev, s3.brightpath.dev, gw.brightpath.dev
printf '%s\n' 'AUTH_ALLOWED_EMAILS=brightpath.dev' "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> .env
docker compose up -d
docker compose ps
```

Result: the stack starts with LobeHub, gateway, PostgreSQL, Redis, RustFS and SearXNG; the setup report prints the URLs and generated passwords. `docker compose logs lobe` shows "database migration pass" and the Next.js ready line. Registration with a non-brightpath.dev address is refused. The agent edits the `ports:` lines to `127.0.0.1:` and adds a Caddy site block for the three hostnames.

### Example 2: Smoke-test a release before upgrading

Request: "Check that the new LobeHub image starts before I touch production."

```bash
# reuse the PG_PASSWORD that is already written into lobehub.env
docker network create lobehub-smoke
docker run -d --name smoke-pg --network lobehub-smoke --network-alias lobehub-pg -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  paradedb/paradedb:latest-pg17 -c shared_preload_libraries=pg_search,pg_cron,pg_stat_statements
sleep 30
docker run -d --name smoke-lobe --network lobehub-smoke -p 127.0.0.1:3299:3210 --env-file lobehub.env lobehub/lobehub:2.3.1
sleep 40
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3299/signin     # 200
docker rm -fv smoke-lobe smoke-pg && docker network rm lobehub-smoke
```

Result: the log shows the migration pass and "Ready", the sign-in page returns 200, and the throwaway containers and their volumes are gone. The env file is the one from Option B: its `DATABASE_URL` points at the host name `lobehub-pg`, which the throwaway Postgres answers to through `--network-alias`, and it uses the same `PG_PASSWORD`.

## Guidelines

- Treat the `lobehub/lobehub` image and tags from `docker.io/lobehub/lobehub` as the source of truth. Pin a version tag in production; `latest` and `canary` move.
- Never commit `.env`. The secrets `AUTH_SECRET`, `KEY_VAULTS_SECRET`, `JWKS_KEY` and the S3 keys give full access to accounts and stored provider keys.
- The Compose file publishes services on all interfaces by default. Bind to `127.0.0.1` and publish through a TLS reverse proxy.
- `APP_URL` must match the address users type in the browser, otherwise sign-in fails on trusted-origin checks; extra origins go in `AUTH_ADDITIONAL_TRUSTED_ORIGINS`.
- The log line "QStash token is required" in a plain install comes from an optional workflow feature and does not stop the app.
- Do not run Postgres without a volume for real use; losing it loses every conversation.
- For a lighter setup with a single shared config file and per-user budgets, compare the `librechat` and `open-webui` skills.
