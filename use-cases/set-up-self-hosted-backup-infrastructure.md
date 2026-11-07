---
title: Set Up Self-Hosted Backup Infrastructure
slug: set-up-self-hosted-backup-infrastructure
description: >-
  A small agency runs 3 client projects on a single VPS. They need reliable
  backups without paying for cloud storage. They deploy a Garage S3 endpoint
  on a second server, configure Restic for encrypted incremental backups
  of applications and databases, and put it behind Traefik with TLS.
  Daily automated backups with retention policies and integrity checks.
skills:
  - restic
  - minio
  - traefik
  - docker-helper
category: devops
tags:
  - backup
  - self-hosted
  - s3
  - encryption
  - automation
  - infrastructure
---

# Set Up Self-Hosted Backup Infrastructure

Lena runs a small web agency with 3 client projects on a production VPS: a Next.js app with PostgreSQL, a WordPress site with MySQL, and a static site with uploaded media files. She's been manually running `pg_dump` every few days and SCP-ing the files to her laptop. It's unreliable, unencrypted, and she once lost 2 days of data when she forgot to back up before a server migration.

She decides to set it up properly: a dedicated backup server running Garage (S3-compatible storage), Restic for encrypted incremental backups, Traefik for HTTPS access, and cron for daily automation. The only extra cost is a second VPS.

## Step 1: Deploy the Backup Server

The community MinIO repository (`minio/minio`) is no longer maintained: it ships as source only and the `minio/minio` image on Docker Hub can no longer be pulled. Lena does not want a storage server that gets no fixes, so the backup box runs Garage instead, a maintained, lightweight S3-compatible server (AGPL-3.0) that Restic supports. She runs it with Traefik on the backup VPS. Traefik reaches Docker through a read-only socket proxy instead of mounting the socket itself, and only the S3 API is published; Garage's admin and web endpoints are not enabled.

```toml
# backup-server/garage.toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "lmdb"
replication_factor = 1               # single node: no redundancy, which is why Step 6 adds a second copy

rpc_bind_addr = "127.0.0.1:3901"     # no other node ever connects
# the RPC secret comes from the GARAGE_RPC_SECRET environment variable (compose.yaml)

[s3_api]
s3_region = "garage"
api_bind_addr = "0.0.0.0:3900"       # reachable only on the compose network; Traefik publishes it
```

```yaml
# backup-server/compose.yaml — Garage + Traefik on the backup VPS
services:
  socket-proxy:                # read-only Docker API for Traefik (container listing only)
    image: tecnativa/docker-socket-proxy:v0.5.0
    environment:
      CONTAINERS: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [socket]

  traefik:
    image: traefik:v3.7
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.endpoint=tcp://socket-proxy:2375"
      - "--providers.docker.exposedByDefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=lena@agency.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.le.acme.tlschallenge=true"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - letsencrypt:/letsencrypt
    networks: [socket, default]

  garage:
    image: dxflrs/garage:v2.5.0
    restart: unless-stopped
    command: ["/garage", "server"]
    environment:
      GARAGE_RPC_SECRET: ${GARAGE_RPC_SECRET:?set it in .env}
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
      - garage_meta:/var/lib/garage/meta
      - garage_data:/var/lib/garage/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.s3.rule=Host(`s3.backup.agency.com`)"
      - "traefik.http.routers.s3.tls.certresolver=le"
      - "traefik.http.services.s3.loadbalancer.server.port=3900"

networks:
  socket:
    internal: true

volumes:
  letsencrypt:
  garage_meta:
  garage_data:
```

```bash
# .env next to compose.yaml — never commit this; generate the secret, do not type one
(umask 077; printf 'GARAGE_RPC_SECRET=%s\n' "$(openssl rand -hex 32)" > .env)
docker compose up -d
```

Traefik requests the certificate on the first request to `https://s3.backup.agency.com`. A request without credentials answers `403 AccessDenied`, which is the expected sign that Garage is behind the proxy. A new Garage node has no storage role yet, so Lena assigns one and applies the layout once (the capacity is the disk space she gives it):

```bash
g() { docker compose exec -T garage /garage "$@"; }
node_id=$(g status | awk '/^[0-9a-f]{16} /{print $1}')   # the node ID is the first column
g layout assign -z dc1 -c 200G "$node_id"
g layout apply --version 1
```

## Step 2: Create Per-Project Buckets and Scoped Keys

Each project gets its own bucket and its own key that is allowed on that bucket only, so a compromised key cannot read other clients' data. Garage keys are independent of buckets, and `garage bucket allow` grants access per bucket.

```bash
# On the backup server, in the compose directory
g() { docker compose exec -T garage /garage "$@"; }

for p in nextapp wordpress staticsite; do
  g bucket create "project-$p"
  out=$(g key create "$p-backup")                      # prints the key ID and the secret once
  id=$(printf '%s\n' "$out" | awk '/^Key ID:/{print $3}')
  secret=$(printf '%s\n' "$out" | awk '/^Secret key:/{print $3}')
  g bucket allow --read --write "project-$p" --key "$id"
  # kept in a local mode-600 file, to copy to the production server (Step 3)
  (umask 077; printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$id" "$secret" > "$p.env")
done
```

Garage does not implement S3 bucket policies or ACLs; this per-bucket allow list is its access control. Key names do not have to be unique, so the script passes the key ID, not the name, to `bucket allow`, and it should be run once per project.

## Step 3: Initialize Restic Repositories

On the production server, each project has a root-only file `/etc/backups/<project>.env` (mode 600) with the S3 key from Step 2 (the contents of the `<project>.env` file that step wrote) plus its own repository location and Restic password file. Restic encrypts everything client-side before it reaches Garage.

```bash
# /etc/backups/nextapp.env
AWS_ACCESS_KEY_ID=REPLACE_WITH_KEY_ID_FROM_STEP_2
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_SECRET_FROM_STEP_2
RESTIC_REPOSITORY=s3:https://s3.backup.agency.com/project-nextapp
RESTIC_PASSWORD_FILE=/etc/backups/nextapp.restic-password   # generated with: openssl rand -base64 32
```

```bash
# Run once per project, as root
set -a; . /etc/backups/nextapp.env; set +a
restic init
```

Every project has its own encryption password. Even with access to the Garage storage nobody can read the data without it. Lena stores the passwords in her team's password manager; without them the backups are unrecoverable.

## Step 4: Write the Backup Script

One script serves all projects; the per-project settings sit in a small file next to the credentials.

```bash
#!/bin/bash
# /opt/backups/backup.sh <project> — files + database dump into the project's Restic repo
set -euo pipefail
project="$1"

set -a; . "/etc/backups/${project}.env"; set +a   # credentials and repository
. "/etc/backups/${project}.conf"                  # PATHS=(...) and DUMP_CMD=(...)

mkdir -p /var/log/backups
exec >> "/var/log/backups/${project}-$(date +%Y%m%d).log" 2>&1
echo "=== Backup started: $(date) ==="

restic backup "${PATHS[@]}" --exclude node_modules --exclude .next --exclude .env.local --tag files

# --stdin-from-command: if the dump fails, Restic reports it and saves no snapshot
restic backup --stdin-from-command --stdin-filename "${project}_db.sql" --tag database -- "${DUMP_CMD[@]}"

# Keep 7 daily, 4 weekly, 6 monthly
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
echo "=== Backup completed: $(date) ==="
```

```bash
# /etc/backups/nextapp.conf
PATHS=(/var/www/nextapp)
DUMP_CMD=(docker exec postgres pg_dump -U appuser nextapp_db)

# /etc/backups/wordpress.conf — the MySQL root password stays inside the container's own environment
PATHS=(/var/www/wordpress/wp-content)
DUMP_CMD=(docker exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction wordpress_db')
```

## Step 5: Schedule with Cron

```bash
# /etc/cron.d/backups — staggered, at night
0 1 * * *  root /opt/backups/backup.sh nextapp
30 1 * * * root /opt/backups/backup.sh wordpress
0 2 * * *  root /opt/backups/backup.sh staticsite

# Weekly integrity check — Sunday 4:00 AM
0 4 * * 0  root /opt/backups/verify-all.sh
```

```bash
#!/bin/bash
# /opt/backups/verify-all.sh — catches corruption before you need to restore
set -uo pipefail
part=$(( 10#$(date +%V) % 10 + 1 ))        # week-of-year picks slice 1..10 of 10
for project in nextapp wordpress staticsite; do
  ( set -a; . "/etc/backups/${project}.env"; set +a
    echo "Checking ${project}, slice ${part}/10..."
    restic check --read-data-subset="${part}/10" ) || echo "CHECK FAILED: ${project}" >&2
done
```

`--read-data-subset=n/t` reads one tenth of the stored data per run, so ten weekly runs cover the whole repository. (`--read-data-subset=10%` would read a different random 10% each time and never guarantees full coverage.) Send the script's stderr somewhere you read, such as cron mail, so a failure does not go unnoticed.

## Step 6: Test a Restore

A backup system you have never restored from is a comfort blanket. Lena restores the PostgreSQL dump into a scratch database:

```console
$ set -a; . /etc/backups/nextapp.env; set +a
$ restic snapshots --tag database
ID        Time                 Host      Tags
abc123de  2026-11-04 01:05:12  prod-vps  database

$ docker exec postgres createdb -U appuser nextapp_test_db
$ restic dump --tag database latest nextapp_db.sql | docker exec -i postgres psql -U appuser -d nextapp_test_db
$ docker exec postgres psql -U appuser -d nextapp_test_db -c "SELECT count(*) FROM users;"
```

She compares the row count with production and drops the scratch database. Now she has encrypted, deduplicated, incremental backups of all three projects, running every night, with six months of history. When a client deletes their blog posts three weeks later, she restores the MySQL dump from the exact date and fixes it in minutes. Her server's compromised key can still delete its own bucket's objects (Restic needs that to prune), so she keeps one extra copy of the repositories elsewhere, for example with `restic copy` to a second location.

## Related Skills

- `restic`: encrypted, deduplicated backups and restores
- `minio`: per-bucket policies if you already run MinIO; Restic usage is the same on any S3-compatible store
- `traefik`: TLS in front of the S3 endpoint
- `docker-helper`: Compose patterns for the backup server
