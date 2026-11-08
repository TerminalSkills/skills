---
title: Self-Host a Private Team Docs Workspace with AFFiNE
slug: self-host-a-team-docs-workspace-with-affine
description: Run an open-source docs, whiteboard and database workspace on your own server for a small team, behind HTTPS, with nightly backups and a safe upgrade routine.
skills:
  - affine
  - docker-helper
  - caddy
  - db-backup
category: productivity
tags:
  - self-hosted
  - team-wiki
  - notion-alternative
  - docker-compose
  - backups
---

# Self-Host a Private Team Docs Workspace with AFFiNE

## The Problem

Ines Duarte leads a six-person design and research studio. Their meeting notes, client briefs and whiteboards sit in a hosted workspace that bills per seat, and two client contracts now require that project documents stay on servers the studio controls. She has a small VPS with Caddy already running on ports 80 and 443. She wants a shared workspace for documents, whiteboards and tables on that VPS, reachable only over HTTPS, and she does not want to find out during an outage that nobody ever tested a backup.

## The Solution

AFFiNE ships an official Docker Compose stack: the server, a migration job, Postgres and Redis. The agent downloads the release files, pins the image version, binds the port to loopback so only Caddy can reach it, sets the public URL, and adds a backup script that dumps Postgres and archives uploads and configuration. Ines creates the administrator account and invites her colleagues in the app. Before relying on it for client work she also reads the licensing note in the skill: the server code carries its own license file with production-use terms, which the studio must check against the contracts. The agent never touches page content; its job ends at a healthy, backed-up server.

## Step-by-Step Walkthrough

### 1. Install the stack, pinned and loopback-only

Prompt: "Set up AFFiNE on this VPS in ~/affine. Pin version 0.27.4 and make sure it is only reachable through Caddy."

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
grep -n "3010\|image:" docker-compose.yml
docker compose up -d
```

The agent waits about half a minute, then checks `docker compose ps`: Postgres and Redis healthy, the migration job exited, the server up on 127.0.0.1:3010. `curl -s http://127.0.0.1:3010/info` returns a JSON body with `"type":"selfhosted"` and the version.

### 2. Put it behind Caddy and set the public URL

Prompt: "The studio domain is docs.duarte-studio.design. Add it to Caddy and tell AFFiNE its external URL."

```bash
sudo tee -a /etc/caddy/Caddyfile <<'EOF'
docs.duarte-studio.design {
  reverse_proxy 127.0.0.1:3010
}
EOF
caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Then the agent edits `config/config.json` so `server.externalUrl` is `https://docs.duarte-studio.design`, and applies it with `docker compose up -d`. Caddy forwards WebSocket traffic without extra settings, which the sync feature needs. A wrong `externalUrl` breaks invitation and share links, so the agent checks it by reading the file back.

### 3. Hand over the first-run step

Prompt: "Tell me what I need to do next."

The agent explains that the first visitor to `https://docs.duarte-studio.design/admin` creates the administrator account, so Ines should do it right away. The agent can confirm the state without logging in:

```bash
curl -s https://docs.duarte-studio.design/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ serverConfig { name version initialized } }"}'
```

After Ines finishes, `initialized` reads `true`. She then adds the server in the desktop app's workspace list and signs in.

### 4. Schedule backups and check they are readable

Prompt: "Back up AFFiNE every night at 02:15, keep two weeks, and fail loudly if the dump is unreadable."

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
~/affine-backup.sh && ls -la ~/affine-backups
(crontab -l 2>/dev/null; echo '15 2 * * * $HOME/affine-backup.sh') | crontab -
```

The first manual run produces a dump (a few hundred KB on a fresh instance) and a tarball. The agent reminds Ines that these files sit on the same VPS and must also be copied off it, using the backup skill's tooling.

### 5. Upgrade without surprises

Prompt: "A new AFFiNE release is out. Upgrade us to it."

The agent runs the backup script first, downloads the target release's Compose file under a new name, and compares it:

```bash
cd ~/affine || exit 1
~/affine-backup.sh
AFFINE_VERSION="$TARGET_AFFINE_VERSION"   # the new release number from the GitHub releases page, without the v
mkdir -p ~/affine/next && cd ~/affine/next || exit 1
curl -fsSLO "https://github.com/toeverything/AFFiNE/releases/download/v${AFFINE_VERSION}/docker-compose.yml"
curl -fsSL "https://api.github.com/repos/toeverything/AFFiNE/releases/tags/v${AFFINE_VERSION}" \
  | jq -r '.assets[] | select(.name=="docker-compose.yml") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1
cd ~/affine && diff -u docker-compose.yml next/docker-compose.yml
```

The diff shows the changed image tag plus the two lines the agent edited earlier (loopback port and pin). It re-applies those, moves the file into place, runs `docker compose pull && docker compose up -d`, and checks `/info` for the new version. If the diff shows changed storage paths or database settings, the agent stops and asks before continuing, because the official upgrade notes warn that mismatched paths start Postgres on an empty directory.

## Real-World Example

Ines's studio had 38 GB of client files in the old workspace and six paid seats. After the move the VPS holds the AFFiNE stack alongside two other small services. The install and Caddy route took the agent about ten minutes. The nightly job writes roughly 270 KB of database dump on day one and grows with content; uploads are archived separately. Three weeks later the agent ran the upgrade routine for a point release: backup, diff, pull, check. The step that mattered came from the diff: it showed the image tag change only, so the pin and loopback binding carried over cleanly and nobody lost a page.

## Related Skills

- [affine](/skills/affine) — the Compose stack, `config.json`, backup, restore and upgrade procedures for the server
- [docker-helper](/skills/docker-helper) — inspecting containers, logs and health when a service will not start
- [caddy](/skills/caddy) — the HTTPS reverse proxy in front of the loopback-only port
- [db-backup](/skills/db-backup) — copying and rotating the Postgres dumps and archives off the host
