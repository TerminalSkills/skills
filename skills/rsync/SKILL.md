---
name: rsync
description: >-
  Sync files and directories with rsync. Use when a user asks to copy files
  between servers, sync directories, create incremental backups, deploy files
  to a remote server, or mirror directories efficiently.
license: Apache-2.0
compatibility: 'Linux, macOS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - rsync
    - sync
    - backup
    - deploy
    - file-transfer
---

# rsync

## Overview

rsync is the standard tool for efficient file synchronization. It only transfers changed parts of files (delta transfer), supports SSH, handles permissions, and works for backups, deployments, and directory mirroring.

## Instructions

### Step 1: Basic Usage

```bash
# Sync local directories
rsync -avz source/ destination/
# -a = archive (preserves permissions, timestamps, symlinks)
# -v = verbose
# -z = compress during transfer

# Sync to remote server
rsync -avz ./dist/ deploy@server:/var/www/myapp/

# Sync from remote
rsync -avz deploy@server:/var/log/myapp/ ./logs/

# Dry run (show what would change without doing it)
rsync -avzn source/ destination/
```

### Step 2: Common Patterns

```bash
# Deploy website (delete files on destination that don't exist in source)
rsync -avz --delete ./build/ deploy@server:/var/www/site/

# Backup with exclude
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='.env' \
  /opt/myapp/ /backups/myapp/

# Incremental backup with hard links (space-efficient)
rsync -avz --link-dest=/backups/latest \
  /opt/myapp/ /backups/$(date +%Y%m%d)/
ln -snf /backups/$(date +%Y%m%d) /backups/latest

# Bandwidth limited (useful for large transfers)
rsync -avz --bwlimit=5000 source/ destination/    # 5000 KB/s
```

### Step 3: Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh — Deploy app with rsync
SERVER="deploy@prod.example.com"
REMOTE_DIR="/var/www/myapp"

echo "Building..."
npm run build

echo "Syncing files..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.git' \
  ./dist/ ${SERVER}:${REMOTE_DIR}/

echo "Restarting service..."
ssh ${SERVER} "sudo systemctl restart myapp"

echo "Deploy complete!"
```

## Guidelines

- Always use `-n` (dry run) first when using `--delete` to avoid accidental data loss.
- Trailing slash matters: `source/` syncs contents, `source` syncs the directory itself.
- For large transfers, add `--progress` to see per-file progress.
- rsync over SSH is encrypted by default — safe for internet transfers.
