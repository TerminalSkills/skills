---
name: memos
description: >-
  Memos is a self-hosted note-taking service: a private timeline of short Markdown notes with tags, search and a REST API, stored in one SQLite file. Use this skill to deploy Memos with Docker, create the first user, mint an access token and write or query notes from scripts and agents. Trigger phrases: "self-host a notes app", "quick capture timeline", "memos api", "post notes to memos", "back up memos", "upgrade memos".
license: Apache-2.0
compatibility: "Docker 24+ (or Docker Compose v2), curl and jq for the API examples"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "memos, note-taking, self-hosted, markdown, rest-api"
  repository: https://github.com/usememos/memos
---

# Memos — a self-hosted timeline of short Markdown notes

## Overview

Memos keeps quick notes ("memos") in a single chronological stream. Each memo is Markdown, can carry `#tags`, attachments, comments and reactions, and is private, protected (signed-in users) or public. The server is one Go binary with the web UI embedded; data lives in a SQLite file by default (MySQL and PostgreSQL are supported through `--driver` and `--dsn`).

This skill is pinned to release `26.11.0` (Docker image `neosmemo/memos:26.11.0`). The project moved to calendar versions in 2026 and changes its API between releases, so always read the API changelog (`proto/api/CHANGELOG.md` in the repository) before upgrading a client. In 26.10 the REST routes moved from `/api/v1/...` to `/api/...`; the old prefix answers `410 Gone`.

An agent can deploy and configure Memos and drive its HTTP API. It does not click through the web UI.

## Instructions

### Install with Docker

```bash
docker run -d --name memos \
  -p 127.0.0.1:5230:5230 \
  -v memos-data:/var/opt/memos \
  neosmemo/memos:26.11.0
```

The container listens on 5230 and stores everything under `/var/opt/memos` (the database `memos_prod.db` plus uploads). Wait for the line `Service ready.` in `docker logs memos`, then check `curl -s http://127.0.0.1:5230/healthz`.

Docker Compose equivalent:

```yaml
services:
  memos:
    image: neosmemo/memos:26.11.0
    container_name: memos
    restart: unless-stopped
    ports:
      - "127.0.0.1:5230:5230"
    environment:
      MEMOS_INSTANCE_URL: https://notes.martas-lab.net
    volumes:
      - memos-data:/var/opt/memos
volumes:
  memos-data:
```

Settings are the command-line flags (`memos --help`) written as `MEMOS_<FLAG>` environment variables with dashes turned into underscores: `MEMOS_INSTANCE_URL`, `MEMOS_PORT`, `MEMOS_DRIVER`, `MEMOS_DSN`, `MEMOS_LOG_LEVEL`. Put a TLS reverse proxy (Caddy, nginx, Traefik) in front for anything beyond localhost.

### Create the first user

On a fresh database, `POST /api/users` with `"role":"ADMIN"` worked without credentials on 26.11.0 and created the administrator. Do this immediately after the container starts, while the port is bound to localhost only.

```bash
curl -s -X POST http://127.0.0.1:5230/api/users \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"marta\",\"password\":\"$MEMOS_ADMIN_PASSWORD\",\"role\":\"ADMIN\"}"
```

The response is a `User` with `"name":"users/marta"`. `GET /api/instance/profile` reports `"needsSetup":true` until this first administrator exists. Resource names in this API look like `users/marta` and `memos/<id>`, and they are used directly in paths (`/api/memos/<id>`).

### Turn off open sign-up

On 26.11.0 registration is open by default: after the administrator exists, anyone who can reach the port can create a `USER` account with an unauthenticated `POST /api/users` (confirmed on a live container; such accounts cannot become admins, but they can post and read public memos). Close it with a token from the next section, then confirm:

```bash
curl -s -X PATCH "http://127.0.0.1:5230/api/instance/settings/GENERAL?updateMask=generalSetting.disallowUserRegistration" \
  -H "Authorization: Bearer $MEMOS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"instance/settings/GENERAL","generalSetting":{"disallowUserRegistration":true}}'
```

An unauthenticated sign-up attempt now returns `{"code":7,"message":"user registration is not allowed"}`. The administrator can still add users with an authenticated `POST /api/users`.

### Authenticate

Interactive sign-in returns a short-lived access token:

```bash
curl -s -X POST http://127.0.0.1:5230/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d "{\"passwordCredentials\":{\"username\":\"marta\",\"password\":\"$MEMOS_ADMIN_PASSWORD\"}}" \
  | jq -r .accessToken
```

For scripts and agents create a personal access token (value starts with `memos_pat_`, shown once). Use an access token to create it:

```bash
curl -s -X POST http://127.0.0.1:5230/api/users/marta/personalAccessTokens \
  -H "Authorization: Bearer $MEMOS_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"nightly-notes-agent","expiresInDays":90}' | jq -r .token
```

Store it in `MEMOS_TOKEN` and send `Authorization: Bearer $MEMOS_TOKEN` on every call. Since 26.10, access tokens stop working when the user's password changes. Unauthenticated requests get `401 authentication required`.

### Create, read, update and delete memos

```bash
MEMOS=http://127.0.0.1:5230
AUTH="Authorization: Bearer $MEMOS_TOKEN"

# create (visibility: PRIVATE, PROTECTED or PUBLIC)
curl -s -X POST $MEMOS/api/memos -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"content":"Standup notes #work/standup\n- ship invoice export","visibility":"PRIVATE"}'

# update only some fields: name the fields in updateMask
curl -s -X PATCH "$MEMOS/api/memos/EXTTzcD8WSxKccrZPmmojp?updateMask=content,pinned" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"content":"Standup notes #work/standup\n- [ ] ship invoice export","pinned":true}'

# comment on a memo
curl -s -X POST $MEMOS/api/memos/EXTTzcD8WSxKccrZPmmojp/comments \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{"content":"Done on Friday"}'

# delete
curl -s -X DELETE $MEMOS/api/memos/EXTTzcD8WSxKccrZPmmojp -H "$AUTH"
```

A created memo comes back with `name`, parsed `tags` (a nested tag such as `#work/standup` yields both `work` and `work/standup`) and a `property` block (`hasTaskList`, `hasIncompleteTasks`, `hasLink`, `hasCode`). Task lists written as `- [ ]` are tracked in that block.

### List and search

`GET /api/memos` takes `pageSize`, `pageToken` (use `nextPageToken` from the previous page), `orderBy` and a CEL `filter`. URL-encode the filter with `curl -G --data-urlencode`.

```bash
# everything tagged #ideas
curl -s -G $MEMOS/api/memos -H "$AUTH" --data-urlencode 'filter=tag in ["ideas"]' | jq '.memos[].content'

# full-text match
curl -s -G $MEMOS/api/memos -H "$AUTH" --data-urlencode 'filter=content.contains("invoice")' | jq '.memos[].name'
```

Both filters above were run against a live 26.11.0 server. Other filter fields exist (the web UI builds them), but use only the ones you have tried on your version.

### Back up and upgrade

```bash
# stop the container briefly so the SQLite files are consistent
docker stop memos
docker run --rm -v memos-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/memos-$(date +%F).tgz -C /data .
docker start memos
```

To upgrade, change the image tag, run `docker compose pull && docker compose up -d` (or recreate the `docker run` container on the same volume), then read the changelog for API breaks. Take the backup first; migrations run on start-up and are not reversible.

## Examples

### Example 1: stand up Memos for one person and verify it

Request: "Set up Memos on this box for me, private, only reachable from localhost, and prove the API works."

```bash
docker run -d --name memos -p 127.0.0.1:5230:5230 -v memos-data:/var/opt/memos neosmemo/memos:26.11.0
sleep 5 && curl -s http://127.0.0.1:5230/healthz
curl -s -X POST http://127.0.0.1:5230/api/users -H 'Content-Type: application/json' \
  -d "{\"username\":\"marta\",\"password\":\"$MEMOS_ADMIN_PASSWORD\",\"role\":\"ADMIN\"}" | jq -r .name
```

Then mint a token (see "Authenticate") and close open sign-up (see "Turn off open sign-up"). Result: `Service ready.` in the logs, `users/marta` printed, and the browser at `http://127.0.0.1:5230` signs in with that account. Report the container name, volume and the backup command to the user.

### Example 2: file a daily summary from a script

Request: "Every evening, post the list of commits I made today as one memo tagged #devlog."

```bash
SUMMARY=$(git -C ~/work/billing-api log --since=midnight --author="$(git config user.email)" --pretty='- %s')
jq -n --arg c "Daily log #devlog
$SUMMARY" '{content:$c,visibility:"PRIVATE"}' \
 | curl -s -X POST http://127.0.0.1:5230/api/memos \
     -H "Authorization: Bearer $MEMOS_TOKEN" -H 'Content-Type: application/json' -d @- | jq -r .name
```

Result: a `memos/<id>` name is printed; the memo appears at the top of the timeline and is found later with `filter=tag in ["devlog"]`. Put the script in cron or a systemd timer.

## Guidelines

- Pin the image tag. `:stable` and `:latest` move, and this project breaks API paths between releases (`/api/v1` became `/api` in 26.10).
- Create the admin account right after first start, before exposing the port, so nobody else can claim it, then set `disallowUserRegistration` to `true` (open sign-up is on by default).
- Keep the port on `127.0.0.1` and use a reverse proxy with TLS, and set `MEMOS_INSTANCE_URL` to the public address.
- A personal access token acts as the user with full rights; give each integration its own token with a short expiry and delete it from `users/<name>/personalAccessTokens` when done.
- Never print or log tokens or the password; read them from environment variables.
- Back up the whole data volume, not only the `.db` file: attachments are stored beside it.
- Memos is a capture stream, not a linked knowledge graph or a task manager. For a vault with backlinks and plugins use Obsidian; for projects with due dates and assignees use a tracker such as Vikunja or Plane.
