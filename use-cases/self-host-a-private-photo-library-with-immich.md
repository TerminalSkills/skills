---
title: Self-Host a Private Photo Library with Immich
slug: self-host-a-private-photo-library-with-immich
description: Move a family's photo archive off a paid cloud plan onto a home server with Immich, import 15 years of folders, and set up nightly encrypted backups.
skills:
  - immich
  - restic
  - traefik
category: devops
tags:
  - photos
  - self-hosted
  - google-photos-alternative
  - backup
  - docker-compose
---

# Self-Host a Private Photo Library with Immich

## The Problem

Marta Kowalczyk's family has 62,000 photos and videos: 41 GB on an old external drive, 90 GB on two phones and the rest in a cloud photo plan that just went up in price. Nothing is organised; the drive has folders named "iPhone 2014", "Italy", "New folder (3)". Her brother cannot see the wedding pictures unless someone sends a link, and she does not like that every picture sits on a third party's servers. She has a spare mini-PC with a 2 TB disk and does not want to learn Docker properly just to run a photo app.

## The Solution

Immich gives the family a Google-Photos-like web app and phone backup on their own hardware. The agent deploys it with Docker Compose, imports the archive folder by folder with the `immich` CLI, puts it behind HTTPS, and sets up a nightly backup of both the database and the photos using restic to a second disk. Marta only registers the admin account and creates one API key.

## Step-by-Step Walkthrough

### 1. Deploy the stack

Prompt: "Install Immich on this mini-PC, store photos in /srv/immich/library, and keep the database on the SSD."

```bash
mkdir -p /srv/immich && cd /srv/immich || exit 1
TAG=$(curl -fsSL https://api.github.com/repos/immich-app/immich/releases/latest | jq -r .tag_name)
curl -fsSL https://api.github.com/repos/immich-app/immich/releases/tags/$TAG \
  | jq -r '.assets[] | select(.name=="docker-compose.yml" or .name=="example.env") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' > SHA256SUMS
curl -fsSLO https://github.com/immich-app/immich/releases/download/$TAG/docker-compose.yml \
  -O https://github.com/immich-app/immich/releases/download/$TAG/example.env
sha256sum -c SHA256SUMS && mv example.env .env
sed -i 's|^UPLOAD_LOCATION=.*|UPLOAD_LOCATION=/srv/immich/library|; s|^DB_DATA_LOCATION=.*|DB_DATA_LOCATION=/srv/immich/postgres|; s|^# TZ=.*|TZ=Europe/Warsaw|' .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 16)|" .env
docker compose up -d
curl -s http://127.0.0.1:2283/api/server/ping
```

The ping answers `{"res":"pong"}` after a minute or two. The agent tells Marta to open the server address, register the first account (it becomes the administrator) and create an API key in her account settings.

### 2. Put it behind HTTPS

Prompt: "Make it reachable as photos.kowalczyk.family with a real certificate, but keep the database private."

The agent follows the `traefik` skill: Traefik terminates TLS and routes the hostname to the `immich-server` service on port 2283. Postgres and Valkey are not published on any host port.

### 3. Import the old drive

Prompt: "Import everything from /mnt/old-drive/Photos. One album per folder, but show me what will happen first."

```bash
export IMMICH_API_KEY="the-key-marta-created"
immich login http://127.0.0.1:2283/api "$IMMICH_API_KEY"
immich upload --dry-run --recursive --album /mnt/old-drive/Photos | tail -20
immich upload --recursive --album --concurrency 4 /mnt/old-drive/Photos
```

The dry run reports the number of files and the albums it would create, with duplicates marked. The real run takes a few hours; afterwards the server keeps generating thumbnails and face groups in the background. Re-running the command later only uploads files the server does not have yet.

### 4. Check the result through the API

Prompt: "Confirm that all 62,000 files arrived."

```bash
curl -s -H "x-api-key: $IMMICH_API_KEY" http://127.0.0.1:2283/api/assets/statistics
curl -s -H "x-api-key: $IMMICH_API_KEY" http://127.0.0.1:2283/api/albums | head -c 400
```

The statistics show the image and video counts; the agent compares them with the number of media files found on the drive and lists any uploads the CLI reported as failed.

### 5. Back up database and photos

Prompt: "Back this up every night to the USB disk, keep 30 days, and tell me how to restore."

```bash
restic -r /mnt/usb-backup/immich-restic init   # once; the repository password comes from RESTIC_PASSWORD_FILE
mkdir -p /srv/immich/db-dumps
docker exec -t immich_postgres pg_dump --clean --if-exists --dbname=immich --username=postgres | gzip > /srv/immich/db-dumps/immich-db-$(date +%F).sql.gz
restic -r /mnt/usb-backup/immich-restic backup /srv/immich/library /srv/immich/db-dumps
restic -r /mnt/usb-backup/immich-restic forget --keep-daily 30 --prune
```

The agent wraps these in a script, schedules it with cron, and tests a restore of one folder into a temporary directory. Immich's own nightly database dump already lands in `library/backups`, so the restic snapshot contains photos and metadata together. It also writes down the restore recipe from the Immich docs: put the folders back into a fresh `UPLOAD_LOCATION`, start the stack and choose "Restore from backup" on the welcome screen.

## Real-World Example

After a weekend, Marta's mini-PC serves the library at photos.kowalczyk.family. All 62,114 files are in, grouped in 214 albums, and her brother has his own user plus a shared album of the wedding. The two phones upload new pictures automatically over Wi-Fi from the Immich mobile app, and the cloud plan is cancelled once the first restore test succeeds. The nightly job uses about 3 GB of extra disk per month for changed files, and `restic snapshots` shows 30 daily points.

## Related Skills

- [immich](/skills/immich) — the photo server, the `immich` CLI import and the REST API checks
- [restic](/skills/restic) — encrypted, deduplicated nightly backups of the photo library
- [traefik](/skills/traefik) — HTTPS and hostname routing in front of the server
