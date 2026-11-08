---
name: affine
description: >-
  AFFiNE is an open-source workspace that combines documents, whiteboards and databases, and its server can be self-hosted with Docker Compose. Use this skill to deploy the AFFiNE server on your own machine, set its public URL, back up and restore its data, and upgrade it safely. Trigger phrases: "self-host AFFiNE", "AFFiNE docker compose", "private Notion alternative", "back up AFFiNE", "upgrade AFFiNE server".
license: Apache-2.0
compatibility: "Docker with Compose v2, curl and jq, 2 GB RAM or more, a reverse proxy (Caddy or nginx) for public HTTPS"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "affine, self-hosted, docker-compose, knowledge-base, notion-alternative"
  repository: https://github.com/toeverything/AFFiNE
---
# AFFiNE — self-host a docs, whiteboard and database workspace

## Overview

AFFiNE is a workspace for documents, whiteboards and database-style tables. The desktop, web and mobile apps can use AFFiNE's cloud or a server you run yourself. This skill covers the server side only, which is the part an agent can do from a terminal: running the official Docker Compose stack, configuring it through `config/config.json`, putting it behind HTTPS, backing it up, and upgrading it. Writing pages, drawing on the canvas and inviting people happen in the apps and are out of scope.

The stack has four containers: the AFFiNE server (port 3010), a one-shot migration job, PostgreSQL (the `pgvector/pgvector:pg16` image) and Redis. Everything persistent lives in two directories next to the Compose file: `./data` (Postgres in `./data/postgres`, uploaded files in `./data/storage`) and `./config` (`config.json` and a generated `private.key`).

Facts checked against the official docs and a local run of release 0.27.4:

- The Compose file, an example config and a JSON schema (`config.schema.json`) are release assets of `toeverything/AFFiNE`; the image `ghcr.io/toeverything/affine:0.27.4` exists (a tag with a leading `v` does not).
- `GET /info` on a running server returns JSON such as `{"compatibility":"0.27.4","type":"selfhosted"}`.
- The GraphQL endpoint `/graphql` answers `serverConfig` queries without a login.
- The Admin Panel is at `/admin`.

Licensing, quoted from the repository files at v0.27.4: the README says AFFiNE Community Edition "is free for self-host under the MIT license". The root `LICENSE` says content under `packages/backend` is licensed under `packages/backend/server/LICENSE`, which is the AFFiNE Enterprise Edition license: the software "may only be used in production" by someone who has agreed to the AFFiNE Subscription Terms of Service or holds a valid Enterprise Edition subscription, and that license says it applies only to the part not distributed as part of the Community Edition. This skill does not decide which part the Docker image is; it is the reader's call, so read both files and the terms. The `license: Apache-2.0` field above is this skill's own license, not AFFiNE's.

## Instructions

### Install the stack

Create a deployment directory and download the files published with the release you will run. The docs download from `releases/latest`; the commands below name the tag instead, so the Compose file and the image pin always match.

```bash
mkdir -p ~/affine/config && cd ~/affine || exit 1
TAG=v0.27.4
for f in docker-compose.yml config.json.example; do
  curl -fsSLO "https://github.com/toeverything/AFFiNE/releases/download/$TAG/$f"
done
curl -fsSL "https://api.github.com/repos/toeverything/AFFiNE/releases/tags/$TAG" \
  | jq -r '.assets[] | select(.name=="docker-compose.yml" or .name=="config.json.example") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1   # GitHub publishes a SHA-256 digest for every release asset
mv config.json.example config/config.json
```

Two edits before the first start:

1. The downloaded file publishes `3010:3010` on every network interface. When a reverse proxy runs on the same host, bind the port to loopback instead:

```bash
sed -i "s#- '3010:3010'#- '127.0.0.1:3010:3010'#" docker-compose.yml
grep -n "3010" docker-compose.yml
```

2. Pin the image. The file uses the moving tag `ghcr.io/toeverything/affine:stable`; the docs warn against blind upgrades through floating tags. Tags are plain version numbers without a `v` (for example `0.27.4`):

```bash
sed -i "s#toeverything/affine:stable#toeverything/affine:0.27.4#" docker-compose.yml
grep -n "image:" docker-compose.yml
```

Start it and check health. The migration container must exit with success while the other three keep running:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=100 affine affine_migration
curl -s http://127.0.0.1:3010/info
```

### Configure the server

Settings live in `config/config.json`; new deployments do not use a `.env` file. The file has a JSON schema URL for editor validation. The keys documented for the basic file are:

- `server.name`: display name of the server.
- `server.externalUrl`: the exact URL users open. Shared links and invitations are built from it, so set the public HTTPS address once a domain exists.
- `copilot.enabled` and `copilot.byok.enabled`: AI features, with provider keys entered per workspace by its owner in the app, not in this file.

```json
{
  "server": {
    "name": "Northwind Docs",
    "externalUrl": "https://docs.northwind-labs.dev"
  },
  "copilot": { "enabled": false }
}
```

Apply changes by recreating the containers:

```bash
docker compose up -d
```

Other server settings can be edited at `<externalUrl>/admin/settings` and take effect immediately. If the file will hold credentials (for example SMTP), keep it readable only by administrators.

### First administrator

The first visit to `<externalUrl>/admin` shows a form that creates the initial administrator account. Do this before anything else, from a trusted network, because whoever opens the page first owns the server. Until then `serverConfig.initialized` is `false`:

```bash
curl -s http://127.0.0.1:3010/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ serverConfig { name version type initialized } }"}'
```

Desktop and mobile apps connect by adding the server address in the app's workspace list.

### HTTPS with a reverse proxy

AFFiNE sync and collaboration use WebSockets, so the proxy must pass them through. Caddy does this by default and obtains certificates itself:

```bash
printf '%s\n' 'docs.northwind-labs.dev {' '  reverse_proxy 127.0.0.1:3010' '}' > Caddyfile
caddy validate --config Caddyfile
```

With nginx, send `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`, set `Upgrade` and `Connection "upgrade"`, and raise `client_max_body_size` (the docs example uses 100m) so uploads work. Then set `server.externalUrl` to the HTTPS address and recreate the containers.

### Back up

A complete backup is three things: a Postgres dump, the uploaded files, and the configuration. The docs use this dump command, which reads the role and database from the running container:

```bash
mkdir -p ~/affine-backups && cd ~/affine || exit 1
STAMP=$(date +%Y%m%d-%H%M)
docker exec affine_postgres sh -c \
  'pg_dump --format=custom --file=/tmp/affine.backup --username="$POSTGRES_USER" "$POSTGRES_DB"'
docker cp affine_postgres:/tmp/affine.backup ~/affine-backups/affine-$STAMP.backup
docker exec affine_postgres sh -c 'pg_restore --list /tmp/affine.backup >/dev/null' && echo dump readable
tar -czf ~/affine-backups/files-$STAMP.tar.gz data/storage config docker-compose.yml
```

Keep the dump and the file archive from the same moment together: a database-only restore does not bring back file contents. `config/private.key` is generated on first start; it is part of the configuration backup. Copy backups off the host. If you use an S3-compatible storage provider instead of the local directory, follow that provider's versioning instead of archiving `data/storage`.

### Restore

Never restore over your only copy. Restore into a fresh deployment directory, keep the old one untouched, and verify before deleting anything. The docs procedure for an empty target:

```bash
docker compose up -d postgres
docker cp ./affine.backup affine_postgres:/tmp/affine.backup
docker exec affine_postgres sh -c \
  'pg_restore --format=custom --clean --if-exists --no-owner --no-privileges --dbname="$POSTGRES_DB" --username="$POSTGRES_USER" /tmp/affine.backup'
docker compose up -d
```

Extract `data/storage` and `config` from the archive into the same directory first. Warnings about objects that do not exist yet are expected with `--clean --if-exists`; an authentication error or a missing role is not, so fix it before starting AFFiNE.

### Upgrade

1. Take the backup above and confirm it is readable.
2. Download the target release's Compose file to a new name and compare it with the running one:

```bash
AFFINE_VERSION="$TARGET_AFFINE_VERSION"   # the target release number from the GitHub releases page, without the v
mkdir -p ~/affine/next && cd ~/affine/next || exit 1
curl -fsSLO "https://github.com/toeverything/AFFiNE/releases/download/v${AFFINE_VERSION}/docker-compose.yml"
curl -fsSL "https://api.github.com/repos/toeverything/AFFiNE/releases/tags/v${AFFINE_VERSION}" \
  | jq -r '.assets[] | select(.name=="docker-compose.yml") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1
cd ~/affine && diff -u docker-compose.yml next/docker-compose.yml
```

3. Carry over your port binding, image pin and any storage changes, then `mv next/docker-compose.yml docker-compose.yml`, `docker compose pull`, `docker compose up -d`. The migration container applies database migrations on start.
4. Check login, a document, an upload and the admin page.

Release 0.27.4 changed the official layout: Postgres moved to `./data/postgres`, uploads to `./data/storage`, config to `./config`, and the default database login became passwordless user `affine`. An older deployment that used `.env` with `DB_DATA_LOCATION`, `UPLOAD_LOCATION` and `CONFIG_LOCATION` must carry those paths and credentials into the new file or restore into the new layout; otherwise Postgres can start on an empty directory and AFFiNE asks for a new administrator. Follow the upgrade page of the docs for that case.

## Examples

### Example 1: Bring up a private instance for a five-person team

Request: "Run AFFiNE for our team on this server, only reachable through Caddy."

```bash
mkdir -p ~/affine/config && cd ~/affine || exit 1
TAG=v0.27.4
for f in docker-compose.yml config.json.example; do
  curl -fsSLO "https://github.com/toeverything/AFFiNE/releases/download/$TAG/$f"
done
curl -fsSL "https://api.github.com/repos/toeverything/AFFiNE/releases/tags/$TAG" \
  | jq -r '.assets[] | select(.name=="docker-compose.yml" or .name=="config.json.example") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1   # GitHub publishes a SHA-256 digest for every release asset
mv config.json.example config/config.json
sed -i "s#- '3010:3010'#- '127.0.0.1:3010:3010'#; s#toeverything/affine:stable#toeverything/affine:0.27.4#" docker-compose.yml
docker compose up -d
sleep 30; docker compose ps; curl -s http://127.0.0.1:3010/info
```

Result: `affine_postgres` and `affine_redis` report healthy, `affine_migration_job` exited, `affine_server` listens on 127.0.0.1:3010, and `/info` returns `"type":"selfhosted"`. The agent then writes the Caddyfile for `docs.northwind-labs.dev`, sets `server.externalUrl`, runs `docker compose up -d`, and asks the owner to open `/admin` to create the administrator.

### Example 2: Nightly backup with a restore check

Request: "Back up AFFiNE every night and prove the dump can be read."

```bash
mkdir -p ~/affine-backups
cat > ~/affine-backup.sh <<'EOF'
#!/bin/sh
set -e
cd "$HOME/affine"
STAMP=$(date +%Y%m%d-%H%M)
docker exec affine_postgres sh -c 'pg_dump --format=custom --file=/tmp/affine.backup --username="$POSTGRES_USER" "$POSTGRES_DB"'
docker cp affine_postgres:/tmp/affine.backup "$HOME/affine-backups/affine-$STAMP.backup"
docker exec affine_postgres sh -c 'pg_restore --list /tmp/affine.backup >/dev/null'
tar -czf "$HOME/affine-backups/files-$STAMP.tar.gz" data/storage config docker-compose.yml
find "$HOME/affine-backups" -type f -mtime +14 -delete
EOF
chmod +x ~/affine-backup.sh
(crontab -l 2>/dev/null; echo '15 2 * * * $HOME/affine-backup.sh') | crontab -
```

Result: each night two files appear in `~/affine-backups`, a custom-format dump (about 270 KB on a fresh instance) and a tarball of uploads and config; the script fails loudly if `pg_restore --list` cannot read the dump.

## Guidelines

- Create the administrator immediately after the first start and do not expose port 3010 to the internet before that. Keep Postgres and Redis unpublished: the official Compose file publishes neither, and its Postgres uses trust authentication that is safe only on the private Compose network.
- Do not run `docker compose down -v` or delete `./data` and `./config` on a deployment with real data. Never delete old data directories before the upgraded or restored instance is verified.
- Pin the image version in production. `latest` and `stable` move; upgrade deliberately after reading the release notes.
- Back up `config/` as well as the database. Test a restore on a scratch directory before you need it.
- The docs recommend at least 4 CPU cores, 2 GB RAM for basic use and 4 GB if documents exceed 10k words; plan about 100 MB of Postgres growth per 1k documents and 10 GB of blob storage per 1k uploads.
- Licensing: see the Overview. The README and `packages/backend/server/LICENSE` say different things about the server; read both, and the AFFiNE Subscription Terms they point to, before running it for a business.
- Not covered here because it needs the apps or accounts: editing content, the desktop client workflow, the paid team license, AI provider keys. Use the cloud or desktop app when you do not want to operate Postgres, backups and HTTPS yourself.
