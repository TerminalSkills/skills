---
title: Move Team Issue Tracking to Self-Hosted Plane
slug: move-team-issue-tracking-to-self-hosted-plane
description: Replace a per-seat hosted issue tracker with self-hosted Plane for a ten-person team, import the open backlog through the API, and keep nightly backups.
skills:
  - plane
  - docker-helper
  - cron
category: productivity
tags:
  - project-management
  - self-hosted
  - issue-tracker
  - migration
  - rest-api
---

# Move Team Issue Tracking to Self-Hosted Plane

## The Problem

Tomasz Nowak runs engineering at Northwind Labs, a ten-person software shop. Their hosted issue tracker costs more every renewal, and the client contracts for two projects say project data must stay on infrastructure the company controls. The open backlog is 312 tickets, exported from the old tool as a CSV. He wants the same basics (projects, states, priorities, sprints) on a server he already pays for, and he does not want a weekend of copy-pasting tickets or a tracker nobody maintains.

## The Solution

Plane is an open-source tracker with projects, work items, cycles and modules. The agent installs the Community edition with Plane's release script, points it at the company hostname, imports the CSV through the REST API with a personal access token, and schedules backups. Tomasz creates the admin account and the token, and decides how the team's states and sprints should look.

## Step-by-Step Walkthrough

### 1. Install Plane on the existing server

Prompt: "Install Plane on this server. Caddy already uses 80 and 443, so use 8080 and 8443; the public name is plane.northwind-labs.dev."

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

The agent first reads `setup.sh` as the skill instructs, then checks the containers with `docker compose -f plane-app/docker-compose.yaml --env-file plane-app/plane.env ps` and adds a Caddy route from the hostname to port 8080.

### 2. Create the workspace and a token

Tomasz opens the site, creates the admin account and the workspace `northwind`, adds the project "Billing", and creates a personal access token under Profile Settings. He exports it for the agent as `PLANE_API_KEY`.

### 3. Read the project and its states

Prompt: "List my projects and the states of Billing."

```bash
export PLANE_BASE_URL="https://plane.northwind-labs.dev"
export PLANE_WORKSPACE="northwind"
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/"
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PLANE_PROJECT_ID/states/"
```

The agent takes the Billing project ID from the first response and the state IDs (Backlog, Todo, In Progress, Done) from the second, so imported tickets can be placed in the right column.

### 4. Import the backlog

Prompt: "Import backlog.csv (columns id, title, severity, status) into Billing. Keep the old ticket number so we can trace it."

The agent runs a short Python script, as in the skill's CSV example. It posts to `/api/v1/workspaces/northwind/projects/{project}/work-items/` with `name`, `priority` mapped from severity (`critical` to `urgent`, `major` to `high`, `minor` to `low`), `state` from the status mapping, and `external_source` / `external_id` set to the old tool name and ticket number. It reads `X-RateLimit-Remaining` after every call and pauses when the 60-requests-per-minute budget is nearly used up, so 312 tickets take about six minutes.

### 5. Verify and back up

Prompt: "Check that the count matches and set up a nightly backup."

```bash
curl -s -H "X-API-Key: $PLANE_API_KEY" "$PLANE_BASE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PLANE_PROJECT_ID/work-items/?per_page=1"
```

The `total_results` field in the response is compared with the 312 rows of the CSV. For backups the agent adds a cron entry that runs `./setup.sh backup` from `~/plane-selfhost` and then copies the new folder under `plane-app/backup/` to the company's storage box.

## Real-World Example

By Monday, the Billing board shows 312 work items in the right columns with their old ticket numbers in the external ID field. The team creates its first cycle from the web app, and Tomasz cancels the hosted plan at the end of the month. A test restore on a spare machine, done from the backup copy before cancelling, confirms that data survives a lost server. Total running cost is the existing server, and every ticket stays in the company's own network.

## Related Skills

- [plane](/skills/plane) — install, API key, work-item calls and backups for the tracker
- [docker-helper](/skills/docker-helper) — inspect and troubleshoot the Compose services Plane runs on
- [cron](/skills/cron) — schedule the nightly backup job
