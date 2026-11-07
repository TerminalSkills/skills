---
title: Migrate Files Between Cloud Storage Providers
slug: migrate-files-between-cloud-storage-providers-with-rclone
description: Move a team's shared files from Google Drive to an S3-compatible bucket, prove nothing was lost, and keep an encrypted copy in sync afterwards.
skills:
  - rclone
category: devops
tags:
  - rclone
  - cloud-storage
  - migration
  - encryption
  - object-storage
---

# Migrate Files Between Cloud Storage Providers

## The Problem

Marta runs operations at a 12-person design studio. For six years the team has kept client work in a shared Google Drive folder: 41,000 files, 380 GB, nested four levels deep. The Workspace plan is being downgraded, the storage quota will drop to 100 GB at the end of the month, and finance has already approved a Cloudflare R2 bucket as the new home for finished projects.

Downloading 380 GB through a browser and uploading it again would take days and fail halfway. Nobody can say afterwards whether every file arrived. The studio also has client contracts that require an encrypted off-site copy of finished work, which today is an external disk that nobody has plugged in for months.

## The Solution

The agent uses **rclone** to copy straight from Google Drive to the bucket without staging files on a laptop, verifies the result with a hash-based `rclone check`, and sets up a second, client-side encrypted copy through a `crypt` remote that a nightly job keeps current. Credentials stay in environment variables, and every destructive step starts as a dry run.

## Step-by-Step Walkthrough

### Step 1: Install rclone and connect the two remotes

Prompt to the agent: "Install rclone without root, connect our Google Drive read-only, and connect the R2 bucket `studio-archive` using the keys in my environment."

```bash
VER=v1.75.2
mkdir -p ~/tools/rclone && cd ~/tools/rclone || exit 1
curl -fsSLO https://downloads.rclone.org/$VER/rclone-$VER-linux-amd64.zip
curl -fsSLO https://downloads.rclone.org/$VER/SHA256SUMS
sha256sum -c --ignore-missing SHA256SUMS 2>&1 | grep rclone-$VER-linux-amd64.zip
unzip -q rclone-$VER-linux-amd64.zip
export PATH="$HOME/tools/rclone/rclone-$VER-linux-amd64:$PATH"

rclone config create gdrive drive scope=drive.readonly
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://3f9a1c0d5b7e4a2c8d6f1e0b9a7c5d3e.r2.cloudflarestorage.com"
rclone lsd gdrive:
rclone lsd R2:
```

The Drive login opens once in Marta's browser and the token is stored in rclone's config. The R2 keys never touch disk. Both `lsd` commands must list folders and buckets before anything is copied.

### Step 2: Preview, then copy

Prompt: "Copy the Clients folder to R2 under projects/. Skip temp files and show me what would happen first."

```bash
rclone copy gdrive:Clients R2:studio-archive/projects --exclude '*.tmp' --exclude '~$*' --dry-run -v 2>&1 | tail -5
rclone copy gdrive:Clients R2:studio-archive/projects --exclude '*.tmp' --exclude '~$*' \
  --transfers 4 --checkers 8 --fast-list \
  --log-file ~/clients-copy.log --log-level INFO -P
```

`copy` is used instead of `move`, so Drive is untouched until the check passes. Four transfers keep Drive's API rate limits quiet. If the run stops, running the same command resumes it, because identical files are skipped.

### Step 3: Prove nothing is missing

Prompt: "Compare Drive and the bucket and give me a list of anything that differs."

```bash
rclone check gdrive:Clients R2:studio-archive/projects --one-way \
  --exclude '*.tmp' --exclude '~$*' --combined ~/clients-diff.txt
echo "exit code $?"
grep -c '^=' ~/clients-diff.txt
grep -E '^[+*]' ~/clients-diff.txt | head
```

Exit code 0 means every source file exists on the destination with a matching size and hash. If rclone says hashes could not be checked because the two backends share no hash type, the agent reruns the command with `--download`, which reads both sides and takes longer. The `=` lines are matches; any `+` (missing on the destination) or `*` (different) lines are copied again with step 2.

### Step 4: Add the encrypted off-site copy

Prompt: "Set up an encrypted copy of finished projects in the same bucket, keep the previous version of changed files for a month, and run it at night."

```bash
export RCLONE_CONFIG_VAULT_TYPE=crypt
export RCLONE_CONFIG_VAULT_REMOTE=R2:studio-archive/vault
export RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$VAULT_PASSPHRASE")"

rclone sync R2:studio-archive/projects VAULT:current --max-delete 200 \
  --backup-dir VAULT:old/$(date +%F) --log-file ~/vault-sync.log --log-level INFO --dry-run
```

After reviewing the dry run the agent drops `--dry-run`, saves the commands as `/usr/local/bin/studio-vault-sync.sh` with the variables sourced from a root-only file, and adds `30 2 * * * /usr/local/bin/studio-vault-sync.sh` to cron. `--max-delete 200` stops the job if a bad source would wipe the copy.

### Step 5: Verify the encrypted copy and hand over

Prompt: "Verify the vault, and write down how to restore a file."

```bash
rclone cryptcheck R2:studio-archive/projects VAULT:current --one-way
rclone lsf R2:studio-archive/vault/current | head -3
rclone copyto VAULT:current/Northwind/brand-guide-v3.pdf ./restore/brand-guide-v3.pdf
```

`cryptcheck` compares hashes across the encryption layer. The raw `lsf` shows random-looking names, which is what the provider sees. The restore command pulls one file back and decrypts it.

## Real-World Example

Marta ran step 2 on a Friday evening; the first pass moved 372 GB in 5 hours 40 minutes with four transfers and finished with 27 skipped lock files. The check on Saturday morning reported 40,988 matches and 6 differences, all files a designer had saved again while the copy was running. The agent re-copied them with step 2 and the next check was clean. Marta deleted the Drive folder only after a second check passed, then fed the passphrase to the studio's password manager. The first nightly run of the vault took 11 minutes and transferred 1.2 GB; the old-version folder for that night held 14 files.

## Related Skills

- [rclone](/skills/rclone) — copies, checks and encrypts across the Drive and R2 remotes and schedules the nightly vault sync
