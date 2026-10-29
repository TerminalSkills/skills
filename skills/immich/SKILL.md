---
name: immich
description: >-
  Immich is a self-hosted photo and video library with a web app, mobile backup, face and object search, and a REST API. Use this skill to deploy Immich with Docker Compose, bulk-import an existing photo archive with the immich CLI, create scoped API keys, call the API from scripts, and back up the database and media. Triggers: "self-host Google Photos", "immich docker compose", "immich upload folder", "immich API key", "immich backup and restore", "photo library on my own server".
license: Apache-2.0
compatibility: "Docker Engine with the Compose plugin, 6 GB RAM (8 GB recommended), Node.js 22+ for the CLI; curl, jq and sha256sum for the verified download"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "immich, photos, self-hosted, docker-compose, backup"
  repository: https://github.com/immich-app/immich
---

# Immich — self-hosted photo and video library

## Overview

Immich stores photos and videos on your own server and gives you a web app, mobile apps with automatic backup, albums, sharing, map view and machine-learning search (faces, objects, text in images). Everything is also reachable through a documented REST API, which is what an agent works with: it deploys the stack, configures it through files and API calls, imports archives with the `immich` command-line tool, and sets up backups. Registering the first user, clicking through the mobile app and tuning settings in the admin screens stay with a human.

The stack is four containers started by one Compose file: the server (port 2283), machine learning, Valkey (Redis-compatible) and a PostgreSQL image with vector-search extensions. The photos live in `UPLOAD_LOCATION` on disk, while the database holds paths and metadata. Both are needed to restore.

## Instructions

### Install with Docker Compose

Requirements from the docs: Linux 64-bit (amd64 or arm64), at least 6 GB RAM and 2 cores, Docker Engine with the `docker compose` plugin (the old `docker-compose` binary is not supported). The Postgres data directory must be on local disk, never a network share.

Download the release's Compose file and example environment file into a new directory and check them against the SHA-256 digests GitHub records for each release asset (both lines must print `OK`):

```bash
mkdir -p ~/immich-app && cd ~/immich-app || exit 1
TAG=$(curl -fsSL https://api.github.com/repos/immich-app/immich/releases/latest | jq -r .tag_name)
curl -fsSL https://api.github.com/repos/immich-app/immich/releases/tags/$TAG \
  | jq -r '.assets[] | select(.name=="docker-compose.yml" or .name=="example.env") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' > SHA256SUMS
curl -fsSLO https://github.com/immich-app/immich/releases/download/$TAG/docker-compose.yml \
  -O https://github.com/immich-app/immich/releases/download/$TAG/example.env
sha256sum -c SHA256SUMS && mv example.env .env
```

The `.env` file has these settings (defaults shown):

| Variable | Default | Meaning |
|---|---|---|
| `UPLOAD_LOCATION` | `./library` | Where photos, thumbnails and database dumps are stored; point it at a disk with room |
| `DB_DATA_LOCATION` | `./postgres` | Postgres files; local SSD, no network shares |
| `TZ` | commented out | Uncomment and set, for example `Europe/Berlin` |
| `IMMICH_VERSION` | `v3` | Image tag; pin an exact release tag from the GitHub releases page for controlled upgrades |
| `DB_PASSWORD` | `postgres` | Change it; use only letters and digits |

Edit the values, then start the stack and check health:

```bash
sed -i 's|^UPLOAD_LOCATION=.*|UPLOAD_LOCATION=/srv/immich/library|; s|^DB_DATA_LOCATION=.*|DB_DATA_LOCATION=/srv/immich/postgres|' .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 16)|" .env
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:2283/api/server/ping
```

The ping returns `{"res":"pong"}` once the server is ready. Open `http://SERVER-IP:2283`; the first account you register becomes the administrator. For internet access put a reverse proxy with TLS in front of port 2283 (see the `traefik` skill) rather than publishing the port directly.

### Create an API key

In the web app's account settings, open the API Keys section and create a key. Keys are scoped by permission, so give a script only what it needs (for example `asset.upload` and `album.create` for an importer, or `asset.read` for a reporting job). The secret is shown once; keep it in an environment variable:

```bash
export IMMICH_API_KEY="paste-the-key-here"
```

Keys can also be created through `POST /api/api-keys` with a body of `{"name": "importer", "permissions": ["asset.upload", "album.create"]}`, but that call itself needs an existing credential with the `apiKey.create` permission.

### Bulk upload with the CLI

The `@immich/cli` package needs Node.js 22 or newer:

```bash
npm install -g @immich/cli
immich --version
immich login http://192.168.1.50:2283/api "$IMMICH_API_KEY"
immich server-info
```

The URL must end in `/api`. `login` stores the credentials in `~/.config/immich/auth.yml` (override the folder with `-d` or `IMMICH_CONFIG_DIR`); run `immich logout` afterwards on shared machines. Instead of `login` you can pass `-u`/`--url` and `-k`/`--key` on each call or set `IMMICH_INSTANCE_URL` and `IMMICH_API_KEY`.

Always rehearse an import with `--dry-run`:

```bash
immich upload --dry-run --recursive ~/Pictures/2019
immich upload --recursive --album ~/Pictures/2019
immich upload --recursive --album-name "Lisbon trip 2019" ~/Pictures/2019/lisbon
```

Useful `upload` options, all confirmed from `immich upload --help` (CLI 3.3.5): `-r/--recursive`, `-a/--album` (one album per folder name), `-A/--album-name`, `-i/--ignore` (pattern to skip), `-H/--include-hidden`, `-c/--concurrency`, `--skip-hash`, `--visibility` (`timeline`, `archive`, `hidden`, `locked`), `-j/--json-output`, `--no-progress`, `--watch` (keep uploading new files). `--delete` removes local files after upload and `--delete-duplicates` removes local files the server already has; use either only after the library is backed up. Re-running an upload is safe because the server deduplicates by file hash.

Google Photos Takeout archives are better imported with the community tool `immich-go` (named in the Immich docs), which keeps the album and date metadata from Takeout JSON files.

### Call the API

The OpenAPI reference is at https://api.immich.app. Send the key in the `x-api-key` header:

```bash
BASE=http://192.168.1.50:2283/api
curl -s "$BASE/server/ping"
curl -s -H "x-api-key: $IMMICH_API_KEY" "$BASE/server/about"
curl -s -H "x-api-key: $IMMICH_API_KEY" "$BASE/assets/statistics"
curl -s -H "x-api-key: $IMMICH_API_KEY" "$BASE/albums"
curl -s -H "x-api-key: $IMMICH_API_KEY" -H "Content-Type: application/json" \
  -d '{"city": "Lisbon", "takenAfter": "2019-01-01T00:00:00.000Z", "size": 20}' \
  "$BASE/search/metadata"
```

`/server/ping` needs no key. Statistics, albums and metadata search need the `asset.statistics`, `album.read` and `asset.read` permissions respectively. The spec lives in the repository at `open-api/immich-openapi-specs.json` and tracks the development branch, so check a path against `https://api.immich.app` for your server version.

### Back up

Immich writes a database dump every night at 2:00 into `UPLOAD_LOCATION/backups` and keeps the last 14 (changeable in Administration, Settings, Database Dump Settings). These dumps contain metadata only. A real backup needs both the dump and the whole `UPLOAD_LOCATION` folder copied somewhere else; the docs recommend a 3-2-1 strategy. A manual dump straight from the database container (the default user is `postgres` and the database `immich`):

```bash
docker exec -t immich_postgres pg_dump --clean --if-exists --dbname=immich --username=postgres | gzip > /srv/backups/immich-db-$(date +%F).sql.gz
```

Copy the media with any file-level tool, for example `restic` (see the `restic` skill) or `rsync`, pointed at `UPLOAD_LOCATION`.

To restore on a fresh machine: download the Compose file and `.env`, move the old `backups`, `encoded-video`, `library`, `profile`, `thumbs` and `upload` folders into the new `UPLOAD_LOCATION`, run `docker compose up -d`, and pick "Restore from backup" on the welcome screen. The CLI restore path starts with `docker compose down -v` and deletes the existing database, so run it only on a deliberate rebuild.

### Upgrade

Read the release notes first (major versions have had breaking changes), then:

```bash
cd ~/immich-app || exit 1
docker compose pull
docker compose up -d
```

If `IMMICH_VERSION` is pinned, change it in `.env` before pulling.

## Examples

### Example 1: Stand up Immich and import a 40 GB archive

Request: "Set up Immich on the home server at /srv/immich and load my 2015–2022 photos from /mnt/archive/photos, one album per folder."

```bash
mkdir -p /srv/immich && cd /srv/immich || exit 1
TAG=$(curl -fsSL https://api.github.com/repos/immich-app/immich/releases/latest | jq -r .tag_name)
curl -fsSL https://api.github.com/repos/immich-app/immich/releases/tags/$TAG \
  | jq -r '.assets[] | select(.name=="docker-compose.yml" or .name=="example.env") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' > SHA256SUMS
curl -fsSLO https://github.com/immich-app/immich/releases/download/$TAG/docker-compose.yml \
  -O https://github.com/immich-app/immich/releases/download/$TAG/example.env
sha256sum -c SHA256SUMS && mv example.env .env
sed -i 's|^UPLOAD_LOCATION=.*|UPLOAD_LOCATION=/srv/immich/library|; s|^DB_DATA_LOCATION=.*|DB_DATA_LOCATION=/srv/immich/postgres|; s|^# TZ=.*|TZ=Europe/Lisbon|' .env
docker compose up -d
curl -s http://127.0.0.1:2283/api/server/ping
```

After the person registers the admin account and creates an API key (stored as `IMMICH_API_KEY`):

```bash
immich login http://127.0.0.1:2283/api "$IMMICH_API_KEY"
immich upload --dry-run --recursive --album /mnt/archive/photos | tail -5
immich upload --recursive --album --concurrency 4 /mnt/archive/photos
```

The dry run lists the files and the albums that would be created. The real run prints progress bars and a summary of uploaded, duplicate and failed files; the timeline fills in while the server generates thumbnails and runs face and smart-search jobs in the background.

### Example 2: Nightly offsite backup of database and media

Request: "Back up Immich every night, keep 30 days."

```bash
mkdir -p /srv/immich/db-dumps
cat > /srv/immich/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
docker exec -t immich_postgres pg_dump --clean --if-exists --dbname=immich --username=postgres | gzip > /srv/immich/db-dumps/immich-db-$(date +%F).sql.gz
restic -r sftp:backup@vault.lan:/srv/restic/immich backup /srv/immich/library /srv/immich/db-dumps
restic -r sftp:backup@vault.lan:/srv/restic/immich forget --keep-daily 30 --prune
EOF
chmod +x /srv/immich/backup.sh
```

The agent adds a cron entry such as `15 3 * * * /srv/immich/backup.sh` (after the restic repository is initialised and its password supplied through `RESTIC_PASSWORD_FILE`). Result: each night a fresh dump sits next to the media in the restic snapshot, and `restic snapshots` lists 30 daily points.

## Guidelines

- Keep `UPLOAD_LOCATION` and the database on local disks. Postgres on NFS or SMB leads to corruption and slow queries.
- The built-in database dumps are not a backup by themselves: they live in the same folder as the photos and contain no media. Copy both to another machine.
- Pin `IMMICH_VERSION` for production and upgrade deliberately; never run `docker compose down -v` unless you mean to wipe the database volume.
- Do not publish port 2283 or the database to the internet; terminate TLS in a reverse proxy and keep Postgres internal.
- Use scoped API keys, one per script, and revoke them from the web app when done. Never put a key in a Compose file or a repository.
- `--delete` and `--delete-duplicates` on `immich upload` delete local files. Use them only with a verified backup.
- The web app needs 6 GB RAM for smooth uploads; on a 4 GB machine the docs say machine learning has to be turned off.
- Not the right tool when you only need a shared folder of files (use a file-sync tool) or a media-delivery pipeline for a website (use object storage with a CDN).
