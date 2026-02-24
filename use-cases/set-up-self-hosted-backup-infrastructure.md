---
title: Set Up Self-Hosted Backup Infrastructure
slug: set-up-self-hosted-backup-infrastructure
description: >-
  A small agency runs 3 client projects on a single VPS. They need reliable
  backups without paying for cloud storage. They deploy MinIO as a local S3
  store on a second server, configure Restic for encrypted incremental backups
  of applications and databases, and put everything behind Traefik with TLS.
  Daily automated backups with retention policies and integrity checks.
skills:
  - restic
  - minio
  - traefik
  - docker-compose
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

She decides to set it up properly: a dedicated backup server running MinIO (S3-compatible storage), Restic for encrypted incremental backups, Traefik for HTTPS access, and cron for daily automation. Total cost: the price of a second cheap VPS (~$5/month).

## Step 1: Deploy the Backup Server

Lena provisions a second VPS (the "backup box") with a large disk. She deploys MinIO and Traefik together with Docker Compose.

```yaml
# backup-server/docker-compose.yml — MinIO + Traefik on the backup VPS
# Traefik handles TLS via Let's Encrypt; MinIO stores backup data

services:
  traefik:
    image: traefik:v3.2
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedByDefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.tlschallenge=true"
      - "--certificatesresolvers.le.acme.email=lena@agency.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    labels:
      # S3 API — Restic connects here
      - "traefik.enable=true"
      - "traefik.http.routers.minio-api.rule=Host(`s3.backup.agency.com`)"
      - "traefik.http.routers.minio-api.tls.certresolver=le"
      - "traefik.http.services.minio-api.loadbalancer.server.port=9000"
      # Console UI — for manual browsing
      - "traefik.http.routers.minio-console.rule=Host(`console.backup.agency.com`)"
      - "traefik.http.routers.minio-console.tls.certresolver=le"
      - "traefik.http.services.minio-console.loadbalancer.server.port=9001"

volumes:
  letsencrypt:
  minio_data:
```

```bash
# .env — Credentials (generate strong passwords, never commit this)
MINIO_ROOT_USER=backup-admin
MINIO_ROOT_PASSWORD=a-very-long-random-password-here
```

After `docker compose up -d`, the S3 API is live at `https://s3.backup.agency.com` with automatic TLS. Traefik provisions the certificate on first request.

## Step 2: Create Per-Project Buckets

Lena creates isolated buckets for each client project using the MinIO client. Each project gets its own access key so a compromised key can't access other clients' data.

```bash
# Set up mc (MinIO Client) on the production server
curl -L https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configure alias pointing to the backup server
mc alias set backup https://s3.backup.agency.com backup-admin 'a-very-long-random-password-here'

# Create per-project buckets
mc mb backup/project-nextapp
mc mb backup/project-wordpress
mc mb backup/project-staticsite

# Create per-project access keys (principle of least privilege)
mc admin user add backup nextapp-backup nextapp-secret-key
mc admin user add backup wordpress-backup wordpress-secret-key
mc admin user add backup staticsite-backup staticsite-secret-key

# Grant each user access only to their bucket
mc admin policy attach backup readwrite --user nextapp-backup
# (In production, create custom policies scoped to specific buckets)
```

## Step 3: Initialize Restic Repositories

On the production server, Lena initializes a Restic repository for each project. Restic encrypts everything client-side before sending to MinIO.

```bash
# init_repos.sh — Initialize Restic repos for each project
# Run once on the production server

# Project 1: Next.js app + PostgreSQL
export AWS_ACCESS_KEY_ID=nextapp-backup
export AWS_SECRET_ACCESS_KEY=nextapp-secret-key
export RESTIC_PASSWORD="unique-encryption-password-for-nextapp"
restic init --repo s3:https://s3.backup.agency.com/project-nextapp

# Project 2: WordPress + MySQL
export AWS_ACCESS_KEY_ID=wordpress-backup
export AWS_SECRET_ACCESS_KEY=wordpress-secret-key
export RESTIC_PASSWORD="unique-encryption-password-for-wordpress"
restic init --repo s3:https://s3.backup.agency.com/project-wordpress

# Project 3: Static site + uploads
export AWS_ACCESS_KEY_ID=staticsite-backup
export AWS_SECRET_ACCESS_KEY=staticsite-secret-key
export RESTIC_PASSWORD="unique-encryption-password-for-staticsite"
restic init --repo s3:https://s3.backup.agency.com/project-staticsite
```

Each project has its own encryption password. Even if someone gains access to the MinIO storage, they can't read the backup data without the password. Lena stores these passwords in her team's password manager.

## Step 4: Write the Backup Scripts

```bash
#!/bin/bash
# /opt/backups/backup-nextapp.sh — Back up Next.js app + PostgreSQL
# Includes application files and a streaming database dump

set -euo pipefail

export AWS_ACCESS_KEY_ID=nextapp-backup
export AWS_SECRET_ACCESS_KEY=nextapp-secret-key
export RESTIC_PASSWORD_FILE=/opt/backups/.nextapp-password
export RESTIC_REPOSITORY=s3:https://s3.backup.agency.com/project-nextapp

LOG="/var/log/backups/nextapp-$(date +%Y%m%d).log"
mkdir -p /var/log/backups

echo "=== Backup started: $(date) ===" >> "$LOG"

# Back up application files (excluding node_modules, .next cache)
restic backup /var/www/nextapp \
  --exclude="node_modules" \
  --exclude=".next" \
  --exclude=".env.local" \
  --tag app \
  >> "$LOG" 2>&1

# Stream PostgreSQL dump directly into Restic (no temp file on disk)
docker exec postgres pg_dump -U appuser nextapp_db \
  | restic backup --stdin --stdin-filename nextapp_db.sql --tag database \
  >> "$LOG" 2>&1

# Apply retention: keep 7 daily, 4 weekly, 6 monthly
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --prune \
  >> "$LOG" 2>&1

echo "=== Backup completed: $(date) ===" >> "$LOG"
```

```bash
#!/bin/bash
# /opt/backups/backup-wordpress.sh — Back up WordPress files + MySQL
set -euo pipefail

export AWS_ACCESS_KEY_ID=wordpress-backup
export AWS_SECRET_ACCESS_KEY=wordpress-secret-key
export RESTIC_PASSWORD_FILE=/opt/backups/.wordpress-password
export RESTIC_REPOSITORY=s3:https://s3.backup.agency.com/project-wordpress

LOG="/var/log/backups/wordpress-$(date +%Y%m%d).log"
echo "=== Backup started: $(date) ===" >> "$LOG"

# WordPress files (wp-content has uploads, themes, plugins)
restic backup /var/www/wordpress/wp-content \
  --tag files \
  >> "$LOG" 2>&1

# MySQL dump
docker exec mysql mysqldump -u root --password="${MYSQL_ROOT_PASSWORD}" wordpress_db \
  | restic backup --stdin --stdin-filename wordpress_db.sql --tag database \
  >> "$LOG" 2>&1

restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune >> "$LOG" 2>&1

echo "=== Backup completed: $(date) ===" >> "$LOG"
```

## Step 5: Schedule with Cron

```bash
# /etc/cron.d/backups — Stagger backups so they don't overlap
# Backups run at night, 30 minutes apart

# Next.js app + PostgreSQL — 1:00 AM
0 1 * * * root /opt/backups/backup-nextapp.sh

# WordPress + MySQL — 1:30 AM
30 1 * * * root /opt/backups/backup-wordpress.sh

# Static site + uploads — 2:00 AM
0 2 * * * root /opt/backups/backup-staticsite.sh

# Weekly integrity check — Sunday 4:00 AM
0 4 * * 0 root /opt/backups/verify-all.sh
```

```bash
#!/bin/bash
# /opt/backups/verify-all.sh — Weekly integrity check for all repos
# Catches data corruption before you need to restore

for project in nextapp wordpress staticsite; do
  export RESTIC_PASSWORD_FILE="/opt/backups/.${project}-password"
  export RESTIC_REPOSITORY="s3:https://s3.backup.agency.com/project-${project}"
  # Set credentials per project...

  echo "Checking ${project}..."
  restic check --read-data-subset=10%    # verify 10% of data blobs each week
done
```

The `--read-data-subset=10%` flag verifies a random 10% of stored data each week. Over 10 weeks, it covers the entire repository without spending hours reading everything at once.

## Step 6: Test a Restore

A backup system you've never tested is just a comfort blanket. Lena tests a restore of the PostgreSQL database:

```bash
# Test restore: dump the latest database backup to verify it works
export RESTIC_PASSWORD_FILE=/opt/backups/.nextapp-password
export RESTIC_REPOSITORY=s3:https://s3.backup.agency.com/project-nextapp

# List snapshots to see what's available
restic snapshots --tag database
# ID        Time                 Host        Tags
# abc123    2025-03-15 01:05     prod-vps    database

# Restore the SQL dump to a test database
restic dump latest nextapp_db.sql | docker exec -i postgres psql -U appuser nextapp_test_db

# Verify: check row counts match production
docker exec postgres psql -U appuser -c "SELECT count(*) FROM users;" nextapp_test_db
```

The whole infrastructure costs Lena about $5/month for the backup VPS. She has encrypted, deduplicated, incremental backups of all 3 client projects, running automatically every night, with retention policies that keep 6 months of history. When a client accidentally deletes their blog posts 3 weeks later, she restores the MySQL dump from the exact date and saves the day in 5 minutes.
