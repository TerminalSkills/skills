---
name: postiz
description: >-
  Postiz is an open-source social media scheduler that publishes and schedules posts to dozens of networks (X, LinkedIn, Bluesky, Instagram, YouTube, Reddit and more) from one calendar, with a public REST API and a command-line client. Use this skill to self-host Postiz with Docker Compose, connect channels, and schedule posts from scripts or an agent. Triggers: "self-host Postiz", "schedule social posts from the command line", "Postiz API", "postiz cli", "open-source Buffer alternative".
license: Apache-2.0
compatibility: "Docker with the Compose plugin (2 GB RAM, 2 vCPUs tested), Node.js 18+ for the postiz CLI; each social network needs its own developer app credentials when self-hosting"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: "postiz, social-media, scheduler, self-hosted, automation"
  repository: https://github.com/gitroomhq/postiz-app
---

# Postiz — open-source social media scheduling

## Overview

Postiz connects social accounts ("channels" in the app, "integrations" in the API), lets you draft and schedule posts on a calendar, and publishes them at the chosen time. It runs as Postiz Cloud (api.postiz.com) or self-hosted with Docker Compose; a self-hosted install has no plan limits. For an agent the useful parts are deploying the stack, and creating, listing and deleting posts through the Public API or the `postiz` CLI, which wraps that API and prints JSON.

Two things cannot be automated and should be handed to the person: the OAuth consent when a channel is connected, and registering developer apps with each social network when self-hosting.

## Instructions

### Self-host with Docker Compose

The maintained Compose file lives in a separate repository, which also contains the Temporal configuration the stack needs; clone it rather than copying a snapshot.

```bash
git clone https://github.com/gitroomhq/postiz-docker-compose
cd postiz-docker-compose || exit 1
```

Edit the environment of the `postiz` service in `docker-compose.yaml` (or use a `postiz.env` mounted at `/config`). The settings the docs mark as required:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (the file points at the bundled `postiz-postgres`) |
| `REDIS_URL` | Redis connection string (bundled `postiz-redis`) |
| `JWT_SECRET` | Long random string, unique per install; changing it logs everyone out |
| `FRONTEND_URL` | Address browsers use for the app, also the OAuth redirect base |
| `NEXT_PUBLIC_BACKEND_URL` | Address browsers use for the backend |
| `BACKEND_INTERNAL_URL` | How the frontend reaches the backend inside the container (`http://localhost:3000` in the shipped file) |

The shipped file also sets `MAIN_URL`, `IS_GENERAL: 'true'`, `RUN_CRON: 'true'` (needed so scheduled posts are actually published), `TEMPORAL_ADDRESS`, and local storage (`STORAGE_PROVIDER: 'local'`, `UPLOAD_DIRECTORY`). `DISABLE_REGISTRATION: 'true'` allows one signup and then closes registration; set it after creating your account. `API_LIMIT` caps create-post calls per hour for the public API (the docs say 90 by default, but the shipped Compose file sets 30).

Generate a secret and start:

```bash
openssl rand -hex 32
docker compose up -d
docker compose ps
```

The app answers on `http://localhost:4007` and the Temporal UI on 127.0.0.1:8080. The shipped file publishes the app as `"4007:5000"`, which listens on every interface; when a reverse proxy runs on the same host, change it to `"127.0.0.1:4007:5000"` so only the proxy is exposed. For a public hostname put a TLS reverse proxy in front and set `FRONTEND_URL`, `MAIN_URL` and `NEXT_PUBLIC_BACKEND_URL` to the public address (the backend is under `/api`, for example `https://social.harbor-studio.dev/api`). Upgrade by pulling a newer image and recreating the stack; read the migration notes at https://docs.postiz.com/installation/migration when crossing a major change.

### Connect channels

In the app, Add Channel, pick a network and authorise. On Postiz Cloud every network works immediately. When self-hosting, most networks need a developer app that you register with that network, with its redirect URL pointing at your `FRONTEND_URL`, and its keys placed in the `postiz` service environment (for example `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`, `X_API_KEY` and `X_API_SECRET`, `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`; the provider pages at https://docs.postiz.com/self-host/providers/ give the exact steps per network). Restart after changing them. Ten platforms need no app, because each user supplies the credentials in the connect dialog: Bluesky, Lemmy, Nostr, Medium, Dev.to, Hashnode, WordPress, Listmonk, Moltbook and Skool (Skool via the browser extension). They are the quickest way to test an install.

### Create an API key

Open Settings in the app, copy the API key and keep it in an environment variable. The header is the key alone, with no `Bearer` prefix:

```bash
export POSTIZ_API_KEY="paste-the-key-from-settings"
export POSTIZ_API="http://localhost:4007/api/public/v1"
curl -s -H "Authorization: $POSTIZ_API_KEY" "$POSTIZ_API/is-connected"
curl -s -H "Authorization: $POSTIZ_API_KEY" "$POSTIZ_API/integrations"
```

Cloud uses the host api.postiz.com with the path `/public/v1`; self-hosted uses `https://your-domain/api/public/v1`. The integrations response is a list of channels with `id`, `name`, `identifier` (the network), `profile` and `disabled`; you need the `id` values to post.

### Schedule a post through the API

`POST /posts` takes a top-level `type` (`now`, `schedule` or `draft`), an ISO 8601 `date`, and a `posts` array with one entry per channel. Every entry needs a `settings` object with a `__type` naming the network (`x`, `linkedin`, `linkedin-page`, `bluesky`, `mastodon`, `threads`, `facebook`, `instagram`, `youtube`, `reddit`, ...). Some networks require more settings (YouTube: `title` and `type`; Reddit: `subreddit[]`; Instagram: `post_type`). The first `value` item is the post and later items are thread replies or comments:

```bash
curl -s -X POST "$POSTIZ_API/posts" \
  -H "Authorization: $POSTIZ_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "date": "2026-11-03T09:30:00.000Z",
    "shortLink": false,
    "tags": [],
    "posts": [
      {
        "integration": {"id": "ID-FROM-INTEGRATIONS-LIST"},
        "value": [{"content": "Harbor Studio ships its autumn print drop on Friday.", "image": []}],
        "settings": {"__type": "bluesky"}
      }
    ]
  }'
```

A successful call returns a list of objects with `postId` and `integration`. Rate limit: the create-post endpoint is limited per hour for the whole instance, and one request can schedule many posts, so batch them in one call. Upload images first (`POST /upload` with multipart form data, or `/upload-from-url`) and reference the returned media in `image`; base64-inlining pushes the body over the 50 MB limit (HTTP 413). Other documented endpoints: `GET /posts` (date range), `DELETE /posts/{id}`, `GET /integration-settings/{id}` (posting rules and settings schema for a channel), `GET /find-slot/{id}` for the next free slot, and analytics for a channel or a post.

### The postiz CLI

```bash
npm install -g postiz
postiz --help
export POSTIZ_API_KEY="paste-the-key-from-settings"
export POSTIZ_API_URL="http://localhost:4007/api"
postiz integrations:list
```

For self-hosted, `POSTIZ_API_URL` must include the `/api` prefix: the CLI appends `/public/v1` itself (checked against the installed 2.0.26 package). Alternatively `postiz auth:login` runs an OAuth2 device flow and stores credentials in `~/.postiz/credentials.json`; OAuth credentials take priority over the key. All output is JSON.

```bash
postiz posts:create -c "Autumn print drop is live" -s "2026-11-03T09:30:00Z" -i "ID-FROM-INTEGRATIONS-LIST"
postiz posts:create -c "Draft for review" -t draft -s "2026-11-03T09:30:00Z" -i "ID-FROM-INTEGRATIONS-LIST"
postiz posts:list --startDate "2026-11-01T00:00:00Z" --endDate "2026-11-30T23:59:59Z"
postiz posts:status POST-ID -s schedule
postiz upload ./poster.png
postiz posts:delete POST-ID
```

`-c` can be repeated for a thread, `-m` attaches media URLs per `-c`, `-i` takes comma-separated channel IDs, `--settings` takes a JSON string for network-specific settings, and `-j post.json` sends a full post structure. `-s` is required. Also available: `integrations:settings`, `integrations:trigger`, `analytics:platform`, `analytics:post`, `media:list`, `clipping:*`. The project documents an agent skill, installed with `npx skills add gitroomhq/postiz-agent`; installing it changes the user's agent setup, so only do that when asked.

## Examples

### Example 1: Stand up Postiz and test with Bluesky

Request: "Deploy Postiz on the studio server and prove it can post, without registering any developer apps."

```bash
git clone https://github.com/gitroomhq/postiz-docker-compose && cd postiz-docker-compose || exit 1
sed -i "s|JWT_SECRET: '.*'|JWT_SECRET: '$(openssl rand -hex 32)'|" docker-compose.yaml
sed -i 's|"4007:5000"|"127.0.0.1:4007:5000"|' docker-compose.yaml
docker compose up -d
curl -sI http://127.0.0.1:4007 | head -1
```

The person registers the first account at port 4007 and adds a Bluesky channel (handle plus an app password typed into the dialog). They copy the API key from Settings; the agent then lists the channel with `curl -H "Authorization: $POSTIZ_API_KEY" http://127.0.0.1:4007/api/public/v1/integrations` and creates a draft with `postiz posts:create -t draft`. The draft shows on the calendar, which proves the stack, queue and API work.

### Example 2: Schedule a week of posts from a spreadsheet

Request: "Schedule the five posts in launch-week.csv (date, text) to our LinkedIn page and Bluesky."

```bash
export POSTIZ_API_URL="https://social.harbor-studio.dev/api"
postiz integrations:list > channels.json
python3 - <<'EOF'
import csv, json, os, subprocess
channels = json.load(open("channels.json"))
ids = ",".join(c["id"] for c in channels if c.get("identifier") in ("linkedin-page", "bluesky"))
for row in csv.DictReader(open("launch-week.csv")):
    subprocess.run(["postiz", "posts:create", "-c", row["text"], "-s", row["date"], "-t", "schedule", "-i", ids], check=True)
EOF
postiz posts:list --startDate "2026-11-02T00:00:00Z" --endDate "2026-11-09T00:00:00Z"
```

The CLI prints JSON for each created post and the final list shows five scheduled posts, each on both channels. Each channel in `channels.json` carries `id`, `name` and `identifier` (the network, such as `x` or `bluesky`), which is what the script filters on. A network that requires extra settings surfaces as a 400 error naming the failing field.

## Guidelines

- Self-hosting means registering a developer app per network; some (Meta, TikTok, X) have review steps and fees. If that is too much, use Postiz Cloud or start with the credential-based networks.
- Keep `RUN_CRON` on for the process that publishes; without it scheduled posts are never sent.
- The API key belongs to the whole workspace: anyone with it can publish to every connected channel. Keep it in an environment variable and rotate it if exposed.
- Do not set `NOT_SECURED` (dev only) or `DISABLE_SSRF_PROTECTION` (only on a trusted single-tenant network) in production.
- Use `draft` for anything a human should review; promote it with `postiz posts:status POST-ID -s schedule`.
- A 404 on delete means the post is already gone; a 429 means the hourly create-post limit was hit, so batch posts into one request.
- Not the right tool for building a bespoke scheduler inside your own product, or for community management such as replying to comments.
