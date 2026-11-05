---
name: rclone
description: >-
  Rclone is a command-line tool that copies, syncs, checks, encrypts, mounts and serves files across more than 70 storage backends, including S3-compatible object storage, Google Drive, Dropbox, SFTP, WebDAV and the local disk. Use it when asked to "sync a folder to a bucket", "migrate files from one cloud to another", "back up to Backblaze or Cloudflare R2", "encrypt files before uploading", "verify that two storages match", or "serve a bucket over HTTP".
license: Apache-2.0
compatibility: "Linux, macOS, Windows or FreeBSD; rclone 1.70+ (tested with 1.75.2); FUSE only for rclone mount"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "rclone, cloud-storage, sync, backup, s3"
  repository: https://github.com/rclone/rclone
---

# rclone — rsync for cloud storage

## Overview

Rclone talks to a storage system through a named **remote** (`name:path`) and offers the same verbs for every backend: `copy`, `sync`, `move`, `check`, `ls`, `lsjson`, `mount`, `serve`, `bisync`. Source and destination may be any two remotes, so one command migrates a Google Drive folder into an S3 bucket without touching the local disk. A `crypt` remote wraps another remote and encrypts file names and contents client-side.

An agent mostly runs it for four jobs: one-way copies and backups, migrations between providers, integrity checks after a transfer, and exposing a remote over a local HTTP/WebDAV/SFTP server. Remotes that need a browser login (Google Drive, Dropbox, OneDrive) require the user to authorize once; everything else can be configured non-interactively.

## Instructions

### Installation

Prefer the system package manager (`sudo apt install rclone`, `brew install rclone`), but those packages can be old. For a current release without root, download the zip and verify it against the published checksums:

```bash
VER=v1.75.2
mkdir -p ~/tools/rclone && cd ~/tools/rclone || exit 1
curl -fsSLO https://downloads.rclone.org/$VER/rclone-$VER-linux-amd64.zip
curl -fsSLO https://downloads.rclone.org/$VER/SHA256SUMS
sha256sum -c --ignore-missing SHA256SUMS 2>&1 | grep rclone-$VER-linux-amd64.zip
unzip -q rclone-$VER-linux-amd64.zip
./rclone-$VER-linux-amd64/rclone version
```

`SHA256SUMS` is a PGP-clearsigned file, so `sha256sum` prints a warning about improperly formatted lines; the line for the zip must say `OK`. Put the binary on `PATH` afterwards. The official `install.sh` exists, but download it to a file and read it before running.

### Configuring remotes without prompts

Config lives in `~/.config/rclone/rclone.conf` (`rclone config file` prints the path). Never read that file back to a user or commit it: it holds tokens. Three ways to define a remote without the interactive wizard:

```bash
# 1. Write into rclone.conf. Secrets passed this way are stored in the file.
rclone config create nas sftp host=192.168.1.20 user=andrey key_file=~/.ssh/id_ed25519

# 2. Environment variables, nothing written to disk: RCLONE_CONFIG_<REMOTE>_<OPTION>
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://3f9a1c0d5b7e4a2c8d6f1e0b9a7c5d3e.r2.cloudflarestorage.com"

# 3. Inline connection string, no config at all
rclone lsd ':sftp,host=192.168.1.20,user=andrey:' 
```

Option names are the backend's config keys in upper case (`rclone config create` lists them; `rclone help backend s3` documents the S3 ones). Use the connection-string form only for non-secret options.

Check a remote works before moving data:

```bash
rclone listremotes
rclone lsd R2:            # buckets
rclone about nas:         # free space, when the backend reports it
```

### copy, sync and move

- `rclone copy SRC DST` transfers new and changed files and never deletes at the destination.
- `rclone sync SRC DST` makes DST identical to SRC and **deletes** extra files in DST. Only the destination is changed.
- `rclone move SRC DST` copies, then deletes from the source. Add `--delete-empty-src-dirs` to prune folders.
- `rclone copyto` / `moveto` treat the arguments as exact file paths, for copying or renaming a single file.

Always preview first, then run for real, logging to a file:

```bash
rclone sync /srv/projects R2:client-archive/projects --exclude '*.tmp' --dry-run -v
rclone sync /srv/projects R2:client-archive/projects --exclude '*.tmp' \
  --max-delete 50 --log-file ~/rclone-projects.log --log-level INFO
```

`--max-delete N` aborts a sync that would remove more than N files, a cheap guard against an empty or unmounted source. Other useful flags: `--transfers 8`, `--checkers 16`, `--bwlimit 8M` (cap bandwidth; timetables like `"08:00,512k 22:00,off"` are accepted), `--fast-list` (fewer API calls on object storage, more memory), `--track-renames` (move instead of re-upload), `--immutable` (fail instead of overwriting), `--max-age 24h` and `--min-size 100M` for selecting files.

### Keep the old version of overwritten files

`--backup-dir` moves files that sync would overwrite or delete into a second location, with `--suffix` to avoid name clashes. The backup directory must be on the **same remote** as the destination and outside it, otherwise rclone refuses to start:

```bash
rclone sync /srv/projects R2:client-archive/current \
  --backup-dir R2:client-archive/old/2026-11-05 --suffix -2026-11-05
```

A changed `reports/q2.csv` ends up as `old/2026-11-05/reports/q2.csv-2026-11-05`.

### Filters

Pass `--include`, `--exclude`, or a rules file with `--filter-from`. Rules are read top to bottom and the first match wins; `-` excludes and `+` includes:

```text
- *.tmp
- node_modules/**
+ **
```

`rclone lsf SRC --filter-from filters.txt -R` shows what would be selected without transferring anything.

### Verify with check

`rclone check SRC DST` compares sizes and hashes and exits with code 1 when they differ, so it fits a script. Use `--one-way` to ignore extra files at the destination, and `--download` when the two sides share no hash type. For a `crypt` remote use `rclone cryptcheck SRC CRYPTREMOTE:`; `rclone check` against a crypt remote only compares sizes and warns "No common hash found".

### Encrypt with a crypt remote

```bash
rclone config create vault crypt remote=R2:client-archive/vault \
  password="$(rclone obscure "$VAULT_PASSPHRASE")"
rclone copy /srv/projects vault: --exclude '*.tmp'
rclone lsf vault: -R            # decrypted view
rclone lsf R2:client-archive/vault -R   # what the provider sees: random names
```

Store `VAULT_PASSPHRASE` in a secrets manager. If the passphrase and the config are lost, the data cannot be recovered. A second password (`password2`, the salt) is optional.

### Two-way sync with bisync

```bash
rclone bisync /srv/shared nas:shared --resync     # first run only, builds the baseline
rclone bisync /srv/shared nas:shared --conflict-resolve newer
```

`--resync` copies the union of both sides and is required once, or after an error that rclone reports. Try `--dry-run` first, add `--check-access` with `RCLONE_TEST` marker files to protect against an unavailable side, and prefer `sync` or `copy` whenever one side is the source of truth.

### Mount and serve

```bash
mkdir -p ~/mnt/archive
rclone mount R2:client-archive ~/mnt/archive --read-only --vfs-cache-mode full --daemon
fusermount3 -u ~/mnt/archive    # unmount (macOS: umount)
```

Mount needs FUSE (`/dev/fuse` and `fusermount3` on Linux; macFUSE or FUSE-T on macOS; WinFsp on Windows). Without `--vfs-cache-mode` (`writes` or `full`) many programs cannot write to the mount.

`rclone serve http|webdav|sftp|ftp|s3|dlna REMOTE:path` publishes a remote. The default listen address is `127.0.0.1:8080`; change it with `--addr 127.0.0.1:9090`. Add `--read-only`, and `--user`/`--pass` (HTTP) or `--htpasswd` (WebDAV) before binding to anything other than loopback. `rclone rcd` starts the remote-control API on `127.0.0.1:5572` (`--rc-addr` to move it, `--rc-user`/`--rc-pass` for auth).

## Examples

### 1. Nightly encrypted offsite copy of project files

**Request:** "Copy /srv/projects to our Cloudflare R2 bucket every night, encrypted, and keep a week of old versions."

```bash
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://3f9a1c0d5b7e4a2c8d6f1e0b9a7c5d3e.r2.cloudflarestorage.com"
export RCLONE_CONFIG_VAULT_TYPE=crypt
export RCLONE_CONFIG_VAULT_REMOTE=R2:client-archive/vault
export RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$VAULT_PASSPHRASE")"

rclone sync /srv/projects VAULT:current --exclude '*.tmp' --max-delete 100 \
  --backup-dir VAULT:old/$(date +%F) --log-file /var/log/rclone-projects.log --log-level INFO
```

The R2 keys come from the Cloudflare dashboard (R2, Manage API tokens). The backup directory is on the same crypt remote, so rclone accepts it. **Result:** the bucket contains only encrypted names; a changed file's previous version appears under `old/2026-11-05/`. A cron entry runs the script at 02:30 and a separate job deletes old folders with `rclone purge VAULT:old/2026-10-29`.

### 2. Migrate a team folder from Google Drive to S3 and prove it

**Request:** "Move the Design Assets folder from Google Drive to our S3 bucket and tell me if anything is missing."

```bash
rclone config create gdrive drive scope=drive.readonly   # user finishes the browser login
rclone copy gdrive:"Design Assets" S3:studio-assets/design --transfers 8 -P
rclone check gdrive:"Design Assets" S3:studio-assets/design --one-way --combined diff.txt
```

`copy` is used, not `move`, so the source stays intact until the check passes. If `check` reports that hashes could not be checked (the two backends share no hash type), rerun with `--download`. **Result:** `diff.txt` lists `= path` for matching files, `+ path` for files missing on the destination, `* path` for files that differ and `- path` for files only on the destination (not reported with `--one-way`). Only when it has no `+` or `*` lines does the user delete the source.

### 3. Read-only browser view of a bucket for the team

**Request:** "Let the team browse last quarter's reports in a browser, only inside the office network."

```bash
rclone serve http R2:client-archive/reports --addr 10.0.4.12:8081 --read-only \
  --user reports --pass "$REPORTS_HTTP_PASSWORD"
```

**Result:** `http://10.0.4.12:8081/` shows a directory listing with downloads and a zip option. Run it under systemd; stop it with `kill`.

## Guidelines

- `sync` deletes. Run with `--dry-run -v` first, set `--max-delete`, and never point it at a source that could be empty (an unmounted disk). Use `copy` when in doubt.
- Do not create or configure a real cloud account on a user's behalf. Take credentials from environment variables, and never print them or `rclone config show` output into chat or logs.
- `--backup-dir` must share the destination's remote and must not sit inside the destination path.
- Trailing slashes do not matter for directories, unlike rsync: `copy src dst` always copies the contents of `src` into `dst`.
- Google Drive and Dropbox throttle API calls; keep `--transfers` low (4) and use your own OAuth client ID for heavy jobs.
- Rclone does not deduplicate or keep history by itself. For versioned, deduplicated backups use restic (it can use rclone as a transport with `-r rclone:remote:path`).
- `bisync` is stable enough for personal folders but is not a replacement for a real sync service; resolve conflicts explicitly.
- Do not use rclone for tiny one-off transfers where `scp` is enough, or for live databases.
