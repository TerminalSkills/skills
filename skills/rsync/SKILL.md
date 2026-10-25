---
name: rsync
description: >-
  rsync copies and synchronizes files locally or over SSH, sending only the
  parts that changed. Use when someone asks to "copy files to a server", "sync
  two directories", "mirror a folder", "make incremental backups with
  hard links", "deploy a build to a remote host", "resume a big transfer" or
  "exclude node_modules when copying".
license: Apache-2.0
compatibility: "Linux, macOS, BSD; rsync 3.2+ on both ends for the options shown, SSH access for remote paths"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "rsync, sync, backup, deploy, file-transfer"
  repository: https://github.com/RsyncProject/rsync
---

# rsync

## Overview

rsync compares source and destination and transfers only what differs (a changed file is sent as a delta). It preserves permissions, times and symlinks with `-a`, talks to remote hosts through SSH by default, and is the usual tool for deployments, mirrors and snapshot backups. The current release is 3.5.1 (September 2026, protocol 33); 3.5.0 fixed 33 security issues in path and symlink handling, so keep both ends updated (`brew install rsync` on macOS, since the bundled binary can be an older or different implementation; check `rsync --version`).

## Instructions

### 1. Copy and sync

```bash
rsync -a --info=progress2 ./dist/ deploy@web01.example.net:/var/www/shop/   # local to remote
rsync -a deploy@web01.example.net:/var/log/shop/ ./logs/                     # remote to local
rsync -a --mkpath ./site/ /backups/daily/site/                               # create missing destination dirs (3.2.3+)
```

`-a` is archive mode (recursive, keeps permissions, times, symlinks, owner and group when allowed). Add `-z` only for slow links with compressible data; it wastes CPU on LAN transfers and on already compressed files (images, archives). `-h` prints human-readable sizes.

Trailing slash on the source decides what is copied: `src/` copies the contents into the destination, `src` copies the directory itself as `dest/src`. A trailing slash on the destination does not matter.

### 2. Preview before changing anything

```console
$ rsync -an --itemize-changes --exclude=node_modules app/ mirror/
cd+++++++++ ./
cd+++++++++ src/
>f+++++++++ src/a.txt
```

`-n` (dry run) with `-i` lists exactly what would happen. `+++++++++` means new, `*deleting` means a file removed from the destination.

### 3. Mirror, exclude, filter

```bash
rsync -a --delete --exclude='node_modules' --exclude='.git' --exclude='.env' ./build/ deploy@web01.example.net:/var/www/shop/
rsync -a --exclude-from=.rsync-ignore ./app/ /backups/app/
rsync -a --files-from=changed.txt ./app/ deploy@web01.example.net:/srv/app/   # paths relative to ./app/
```

`--delete` removes destination files that no longer exist in the source, so run it with `-n` first. Exclude patterns are matched relative to the transfer root; anchor with a leading slash (`--exclude='/.env'`).

### 4. Remote options

```bash
rsync -a -e "ssh -p 2222 -i ~/.ssh/deploy_ed25519" ./dist/ deploy@web01.example.net:/var/www/shop/
rsync -a --rsync-path="sudo rsync" ./conf/ ops@db01.example.net:/etc/shop/    # needs passwordless sudo for rsync there
rsync -a --partial --append-verify --info=progress2 big.iso backup@nas01.example.net:/vol/iso/   # resume a big file
rsync -a --bwlimit=5m ./media/ backup@nas01.example.net:/vol/media/            # 5 MiB/s; plain number = KiB/s
```

`--partial` keeps an interrupted file so the next run continues it. rsync over SSH is encrypted; the `rsync://` daemon protocol is not. Use a restricted key and `command=` with `rrsync` in `authorized_keys` for unattended jobs.

### 5. Snapshot backups with hard links

Each run produces a complete-looking directory, but unchanged files are hard links to the previous snapshot, so they cost no space:

```bash
#!/usr/bin/env bash
set -euo pipefail
SRC=/srv/shop/
DEST=/backups/shop
TODAY=$(date +%F)
mkdir -p "$DEST"
rsync -a --delete --exclude='/cache/' --link-dest="$DEST/latest" "$SRC" "$DEST/$TODAY/"
ln -sfn "$DEST/$TODAY" "$DEST/latest"
```

Give `--link-dest` an absolute path. On the very first run `latest` does not exist and rsync prints a `--link-dest arg does not exist` warning but still makes a full copy.

## Examples

### Example 1: "Deploy the build to the server without touching the uploads folder"

```bash
npm run build
rsync -a --delete --exclude='/uploads/' --exclude='/.env' -n -i ./dist/ deploy@web01.example.net:/var/www/shop/
rsync -a --delete --exclude='/uploads/' --exclude='/.env' ./dist/ deploy@web01.example.net:/var/www/shop/
ssh deploy@web01.example.net "sudo systemctl reload nginx"
```

The first command is the dry run: review the `*deleting` lines. Excluded paths are also protected from `--delete`, so `uploads/` and `.env` on the server survive.

### Example 2: "Nightly backup that keeps 14 days"

Use the script from step 5 from cron (`15 2 * * * /usr/local/bin/shop-backup.sh`), then prune: `find /backups/shop -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf {} +`. Check the saving with `du -sh /backups/shop/*`: the second snapshot only counts files that changed (verified: unchanged `src/a.txt` shared one inode across both snapshots, the modified file got a new one).

## Guidelines

- Always dry-run (`-n -i`) before `--delete`, and never point `--delete` at a path built from an unchecked variable (an empty `$DEST` can mean `/`).
- Quote paths with spaces; a remote path with spaces needs quoting for both shells.
- `-a` keeps owner and group only when run as root on the receiver; add `-A -X` for ACLs and extended attributes and `-H` for hard links inside the tree.
- `--checksum` compares file contents instead of size and time: accurate but reads every file on both sides.
- Do not sync live database files; dump first, then sync the dump.
- Do not store the SSH key passphrase or passwords in scripts; use `ssh-agent` or a dedicated deploy key.
- For one-way deployment prefer a new release directory plus a symlink switch if you need atomic cutover; rsync on its own updates files one by one.
