---
name: plane
description: >-
  Plane is an open-source project management tool (work items, cycles, modules, pages) that can run on your own server or in Plane Cloud, as an alternative to Jira or Linear. Use this skill to self-host the Community edition with Docker, call the REST API with a personal access token, create and update work items from scripts, or connect an agent through the official Plane MCP server. Triggers: "self-host Plane", "makeplane", "Plane API key", "create Plane work items from a script", "Plane MCP server", "replace Jira with something self-hosted".
license: Apache-2.0
compatibility: "Docker with the Compose plugin, 2 CPU cores and 4 GB RAM (8 GB for production); Python 3.10+ for the MCP server and Python SDK, Node.js 20+ for the Node SDK; curl, jq and sha256sum for the verified download"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "plane, project-management, self-hosted, issue-tracker, rest-api"
  repository: https://github.com/makeplane/plane
---

# Plane — open-source project management you can host yourself

## Overview

Plane tracks work as projects containing work items (formerly "issues"), grouped into cycles (sprints), modules and pages, with states, labels, priorities and estimates. It exists as Plane Cloud (api.plane.so) and as self-hosted editions. The agent's job is to deploy and maintain the instance, and to read and write work items through the REST API, an official SDK, or the official MCP server. Planning meetings and board layout stay in the web app.

Naming has changed over time: the API paths now say `work-items`, older material and some field names say `issues`. Use `work-items`. The API reference at https://developers.plane.so/api-reference exposes API version v1 and a newer v2; the examples here use v1, which the docs still describe as the base path (`/api/v1/...`).

## Instructions

### Self-host the Community edition

Requirements from the docs: Docker with the current Compose plugin, 2 cores, 4 GB RAM (8 GB recommended for production). The docs also describe a Commercial edition installed by a one-line installer from `prime.plane.so` (free plan with 12 seats per workspace); this skill does not cover it.

The Community edition is installed by the release's `setup.sh` helper. Download it to a file, check it against the SHA-256 digest GitHub records for the release asset (must print `setup.sh: OK`), read it, then run it:

```bash
mkdir -p ~/plane-selfhost && cd ~/plane-selfhost || exit 1
TAG=$(curl -fsSL https://api.github.com/repos/makeplane/plane/releases/latest | jq -r .tag_name)
curl -fsSLO https://github.com/makeplane/plane/releases/download/$TAG/setup.sh
curl -fsSL https://api.github.com/repos/makeplane/plane/releases/tags/$TAG \
  | jq -r '.assets[] | select(.name=="setup.sh") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' | sha256sum -c -
less setup.sh
chmod +x setup.sh
./setup.sh install
```

The script accepts the action as its first argument (`install`, `start`, `stop`, `restart`, `upgrade`, `logs`, `backup`); without one it shows a numbered menu and waits for input. `install` creates a `plane-app` folder with `docker-compose.yaml` and `plane.env`.

Edit `plane-app/plane.env` before the first start. The keys the docs call out:

- `LISTEN_HTTP_PORT` and `LISTEN_HTTPS_PORT` — host ports, default 80 and 443; change them if taken.
- `WEB_URL` — the public address, for example `https://plane.northwind-labs.dev`; default `http://localhost`.
- `CORS_ALLOWED_ORIGINS` — set to the same address as `WEB_URL`.

Then start it and check:

```bash
./setup.sh start
docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env ps
```

Open `WEB_URL`; the first visit sets up the instance admin (the docs call the instance-admin settings "God mode"), after which you create a workspace. For production the docs strongly recommend external PostgreSQL and S3-compatible storage instead of the bundled containers, because the bundled ones live on one machine's disk.

Day-two operations use the same script: `./setup.sh upgrade` (it asks for a y/N confirmation, keeps a `plane.env.bak`, and you should compare the file for new variables afterwards), `./setup.sh backup` (archives the bundled database, object storage, message queue and Redis data under `plane-app/backup/`), `./setup.sh logs`.

Kubernetes and Docker AIO methods exist; see https://developers.plane.so/self-hosting/overview.

### Get an API key

Profile Settings, then Personal Access Tokens, then Add personal access token. Give it a title, ideally an expiry, and store it in an environment variable. Never commit it.

```bash
export PLANE_API_KEY="paste-the-token-here"
export PLANE_BASE_URL="https://plane.northwind-labs.dev"
export PLANE_WORKSPACE="northwind"
```

The workspace slug is the part of the URL after the host, for example `northwind` in `https://plane.northwind-labs.dev/northwind/projects/`. On Plane Cloud the base URL is `https://api.plane.so`. For a self-hosted instance the docs say the base URL depends on your domain and setup; use the address of the web app and check it with the projects call below.

### Call the REST API

Authenticate with the `X-API-Key` header. Limit: 60 requests per minute per key; each response carries `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds). Collections are cursor-paginated: `per_page` (max 100) and `cursor`, and responses carry `results`, `next_cursor` and `next_page_results`.

```bash
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/"
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PROJECT_ID/states/"
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PROJECT_ID/work-items/?per_page=50"
```

Create a work item (`POST .../work-items/`, scope `projects.work_items:write`). `name` is required; `priority` is one of `urgent`, `high`, `medium`, `low`, `none`; `state`, `labels` and `assignees` take IDs; `description_html` carries the body; `external_source` and `external_id` record where an imported item came from:

```bash
curl -s -X POST \
  -H "X-API-Key: $PLANE_API_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Checkout fails for EU cards", "priority": "high", "description_html": "<p>3DS challenge times out after 30 s.</p>", "external_source": "zendesk", "external_id": "ZD-48213"}' \
  "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PROJECT_ID/work-items/"
```

The same family has endpoints for states, labels, cycles, modules, comments, links, activity, pages and intake. Browse https://developers.plane.so/api-reference for the exact body of each; list projects first, because most calls need a project ID.

### SDKs and the MCP server

Official packages exist: `@makeplane/plane-node-sdk` on npm (`PlaneClient` with `apiKey` or `accessToken`, optional `baseUrl`) and `plane-sdk` on PyPI (`PlaneClient(base_url, api_key)`, where `base_url` must not include `/api/v1`). Plain HTTP as above is enough for most scripts.

For an interactive agent, the official `plane-mcp-server` (PyPI, Python 3.10+) runs over stdio. The README's configuration for an MCP client is a server entry with command `uvx`, arguments `["plane-mcp-server", "stdio"]`, and environment `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG` and, for self-hosted, `PLANE_BASE_URL`. Do not edit the user's MCP settings without being asked.

## Examples

### Example 1: Self-host Plane on a small VPS

Request: "Install Plane on this server at plane.northwind-labs.dev, ports 8080 and 8443 because Caddy owns 80/443."

```bash
mkdir -p ~/plane-selfhost && cd ~/plane-selfhost || exit 1
TAG=$(curl -fsSL https://api.github.com/repos/makeplane/plane/releases/latest | jq -r .tag_name)
curl -fsSLO https://github.com/makeplane/plane/releases/download/$TAG/setup.sh
curl -fsSL https://api.github.com/repos/makeplane/plane/releases/tags/$TAG \
  | jq -r '.assets[] | select(.name=="setup.sh") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' | sha256sum -c -
chmod +x setup.sh && ./setup.sh install
sed -i 's|^LISTEN_HTTP_PORT=.*|LISTEN_HTTP_PORT=8080|; s|^LISTEN_HTTPS_PORT=.*|LISTEN_HTTPS_PORT=8443|' plane-app/plane.env
sed -i 's|^WEB_URL=.*|WEB_URL=https://plane.northwind-labs.dev|; s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://plane.northwind-labs.dev|' plane-app/plane.env
./setup.sh start
```

Result: the containers come up (the one-off migrator container exits when the database is migrated), and the reverse proxy forwards the hostname to port 8080. The agent reminds the person to create the admin account and a personal access token.

### Example 2: Import a CSV of bugs as work items

Request: "Create work items in the Billing project from bugs.csv (columns: id, title, severity), mapping severity to priority."

```python
import csv, os, time, requests

base = os.environ["PLANE_BASE_URL"]
ws = os.environ["PLANE_WORKSPACE"]
project = os.environ["PLANE_PROJECT_ID"]
headers = {"X-API-Key": os.environ["PLANE_API_KEY"], "Content-Type": "application/json"}
url = f"{base}/api/v1/workspaces/{ws}/projects/{project}/work-items/"
priority = {"critical": "urgent", "major": "high", "minor": "low"}

with open("bugs.csv", newline="") as fh:
    for row in csv.DictReader(fh):
        body = {
            "name": row["title"],
            "priority": priority.get(row["severity"], "none"),
            "external_source": "bugs-csv",
            "external_id": row["id"],
        }
        r = requests.post(url, json=body, headers=headers, timeout=30)
        r.raise_for_status()
        if int(r.headers.get("X-RateLimit-Remaining", "1")) < 3:
            time.sleep(60)
```

Result: one work item per CSV row; `external_id` makes a later re-run checkable (list items filtered by `external_id`, which the list endpoint accepts as a query parameter) so the agent does not create duplicates. Sixty requests a minute means 600 rows take about ten minutes.

## Guidelines

- Use the `work-items` paths; the `issues` naming is the older one. Check the API version selector in the docs before relying on a field.
- Keep the API key in an environment variable or secret store, set an expiry, and revoke it when the integration is retired. Treat it as the user's own credentials: it can do whatever the user can.
- Stay under 60 requests per minute per key; read `X-RateLimit-Remaining` and back off.
- The bundled PostgreSQL and storage are fine for trials. For real data use external services and take backups with `./setup.sh backup` plus a copy off the machine.
- Run `./setup.sh upgrade` only after a backup, and compare `plane.env` with the new defaults.
- Do not pipe an installer into a shell, and do not expose the instance without HTTPS.
- Not the right tool for syncing several trackers into one view (see the `jira` and `linear` skills) or for building your own tracker.
