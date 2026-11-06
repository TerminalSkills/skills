---
name: vikunja
description: >-
  Vikunja is a self-hosted to-do and project management app with lists, kanban and gantt views, labels, assignees and a full REST API, shipped as one Go binary or Docker image. Use this skill to deploy Vikunja, register a user, create a scoped API token and manage projects and tasks from scripts or agents. Trigger phrases: "self-host a todo app", "vikunja api", "create tasks in vikunja", "replace a hosted task tracker", "back up vikunja", "import tasks".
license: Apache-2.0
compatibility: "Docker 24+ (or the Vikunja release binary), curl and jq for the API examples"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "vikunja, todo, project-management, self-hosted, rest-api"
  repository: https://github.com/go-vikunja/vikunja
---

# Vikunja — self-hosted tasks and projects with an API

## Overview

Vikunja organizes work into projects (nestable), tasks with due dates, priorities, labels, assignees, comments and attachments, and shows them as list, kanban, gantt or table views. The same container serves the web UI and the REST API under `/api/v1`, and it also speaks CalDAV for calendar apps. The default database is SQLite; PostgreSQL and MySQL are supported.

This skill is pinned to release `v2.8.0` (Docker image `vikunja/vikunja:2.8.0`). Responses and routes below were exercised against that image. The built-in API reference is served by the running instance at `/api/v1/docs.json`; read it for fields this skill does not list.

An agent can deploy and configure Vikunja and drive it through the API. It does not operate the web UI.

## Instructions

### Install with Docker

The image runs as UID 1000. Create the two data directories and give them to that user, otherwise the server exits with `permission denied` on `/app/vikunja/files`.

```bash
mkdir -p ~/vikunja/db ~/vikunja/files && sudo chown 1000:1000 ~/vikunja/db ~/vikunja/files
```

```bash
docker run -d --name vikunja \
  -p 127.0.0.1:3456:3456 \
  -e VIKUNJA_SERVICE_PUBLICURL=http://127.0.0.1:3456/ \
  -e VIKUNJA_SERVICE_SECRET="$VIKUNJA_SECRET" \
  -e VIKUNJA_DATABASE_PATH=/db/vikunja.db \
  -v ~/vikunja/db:/db \
  -v ~/vikunja/files:/app/vikunja/files \
  vikunja/vikunja:2.8.0
```

- `VIKUNJA_SERVICE_PUBLICURL` must be the address users open, with trailing slash (it appears in emails and links). It is required: without it the server exits with `service.publicurl is required when cors.enable is true`.
- `VIKUNJA_SERVICE_SECRET` signs login tokens. Generate a long random value once (`openssl rand -hex 32`), keep it in your secret store and reuse it on every restart. The older `service.jwtsecret` key prints a deprecation warning.
- Any config key can be set as `VIKUNJA_<SECTION>_<KEY>`. Useful ones: `VIKUNJA_SERVICE_ENABLEREGISTRATION=false` (registration is open by default; close it after you create your accounts, then `/register` answers `Not Found`), `VIKUNJA_DATABASE_TYPE` (`sqlite`, `postgres`, `mysql`).

Check it is up: `curl -s http://127.0.0.1:3456/health` prints `OK`, and `curl -s http://127.0.0.1:3456/api/v1/info | jq .version` prints `"v2.8.0"`.

### Register and log in

```bash
VIKUNJA=http://127.0.0.1:3456/api/v1

curl -s -X POST $VIKUNJA/register -H 'Content-Type: application/json' \
  -d "{\"username\":\"dmitri\",\"email\":\"dmitri@renovation-crew.net\",\"password\":\"$VIKUNJA_PASSWORD\"}"

TOKEN=$(curl -s -X POST $VIKUNJA/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"dmitri\",\"password\":\"$VIKUNJA_PASSWORD\"}" | jq -r .token)
```

The login token is a short-lived JWT. Send it as `Authorization: Bearer $TOKEN`. Registration is open by default, so create your accounts right after start, then recreate the container with `VIKUNJA_SERVICE_ENABLEREGISTRATION=false` (same data directories) before exposing the port.

### Create a scoped API token for automation

An API token limits an agent to named permission groups, which is safer than handing it the login. Groups map to routes (list them with `GET /api/v1/routes`); each group has actions such as `read_all`, `read_one`, `create`, `update`, `delete`. Comments are their own group, `tasks_comments`.

```bash
curl -s -X PUT $VIKUNJA/tokens -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"planning-agent","expires_at":"2027-06-01T00:00:00Z",
       "permissions":{"projects":["read_all","read_one"],
                      "tasks":["read_all","read_one","create","update","delete"],
                      "tasks_comments":["create","read_all"]}}' | jq -r .token
```

The value starts with `tk_` and is shown once. Export it as `VIKUNJA_API_TOKEN` and use it as a Bearer token. A call outside the granted groups fails with `missing, malformed, expired or otherwise invalid token provided` (code 11), which is how a missing permission shows up.

### Projects and tasks

Vikunja's verbs are unusual: `PUT` creates, `POST` updates.

```bash
AUTH="Authorization: Bearer $VIKUNJA_API_TOKEN"
JSON='Content-Type: application/json'

# create a project (needs the projects create permission, i.e. use the login token)
curl -s -X PUT $VIKUNJA/projects -H "Authorization: Bearer $TOKEN" -H "$JSON" \
  -d '{"title":"Kitchen renovation","description":"Spring remodel"}' | jq '{id, title}'

# find a project id
curl -s $VIKUNJA/projects -H "$AUTH" | jq '.[] | {id, title}'

# create a task in project 2 (priority 0-5, 5 is highest)
curl -s -X PUT $VIKUNJA/projects/2/tasks -H "$AUTH" -H "$JSON" \
  -d '{"title":"Order cabinets","due_date":"2026-12-01T09:00:00Z","priority":4}' | jq '{id, title, identifier}'

# mark done: POST replaces the task, so read it, change the field, send it all back
curl -s $VIKUNJA/tasks/1 -H "$AUTH" | jq '.done = true' |
  curl -s -X POST $VIKUNJA/tasks/1 -H "$AUTH" -H "$JSON" -d @- | jq '{done, done_at, priority, due_date}'

# comment on a task
curl -s -X PUT $VIKUNJA/tasks/2/comments -H "$AUTH" -H "$JSON" -d '{"comment":"Quote arrives Monday"}'

# delete a task
curl -s -X DELETE $VIKUNJA/tasks/2 -H "$AUTH"
```

A task response includes `id`, per-project `index` and `identifier` such as `#1`, `done`, `due_date`, `priority`, `assignees`, `labels`. Timestamps are RFC 3339; an unset date is `0001-01-01T00:00:00Z`, not null.

### Filter, sort and page

`GET /projects/{id}/tasks` and `GET /tasks` accept `filter`, `sort_by`, `order_by` (`asc` or `desc`), `page` and `per_page` (the server caps this at the `max_items_per_page` value from `/info`, 50 by default).

```bash
curl -s -G $VIKUNJA/projects/2/tasks -H "$AUTH" \
  --data-urlencode 'filter=done = false && priority >= 3' \
  --data-urlencode 'sort_by=priority' --data-urlencode 'order_by=desc' \
  --data-urlencode 'per_page=20' | jq -r '.[] | "\(.id)\t\(.priority)\t\(.title)"'
```

`filter=done = false` and the compound form above were run on v2.8.0. Check `/api/v1/docs.json` before using other fields or operators.

### Labels and assignees

With a login token (the API-token groups above do not include these):

```bash
curl -s -X PUT $VIKUNJA/labels -H "Authorization: Bearer $TOKEN" -H "$JSON" -d '{"title":"urgent"}' | jq .id
curl -s -X PUT $VIKUNJA/tasks/2/labels -H "Authorization: Bearer $TOKEN" -H "$JSON" -d '{"label_id":1}'
```

To grant an agent label access, add the `labels` and `tasks_labels` groups from `/routes` to its token.

### Back up and upgrade

Stop the container, archive `~/vikunja/db` and `~/vikunja/files`, start it again. Upgrading means changing the tag, recreating the container on the same directories and checking `/api/v1/info`. Take the backup first; schema migrations run at start-up.

## Examples

### Example 1: deploy a private task server and prove it works

Request: "Put Vikunja on this machine, localhost only, and show me an API round trip."

```bash
mkdir -p ~/vikunja/db ~/vikunja/files && sudo chown 1000:1000 ~/vikunja/db ~/vikunja/files
docker run -d --name vikunja -p 127.0.0.1:3456:3456 \
  -e VIKUNJA_SERVICE_PUBLICURL=http://127.0.0.1:3456/ -e VIKUNJA_SERVICE_SECRET="$VIKUNJA_SECRET" \
  -e VIKUNJA_DATABASE_PATH=/db/vikunja.db -v ~/vikunja/db:/db -v ~/vikunja/files:/app/vikunja/files \
  vikunja/vikunja:2.8.0
sleep 5; curl -s http://127.0.0.1:3456/health; curl -s http://127.0.0.1:3456/api/v1/info | jq -r .version
```

Result: `OK` and `v2.8.0`. Then register, log in, create a project and one task as shown above and print `jq '{id, title}'` of the task as proof.

### Example 2: move a client punch list into Vikunja

Request: "Dmitri's crew has a CSV of open jobs. Create them as tasks in the Kitchen renovation project, highest priority first."

```bash
# jobs.csv: title,due,priority   e.g.  Order cabinets,2026-12-01,4
tail -n +2 jobs.csv | while IFS=, read -r title due prio; do
  jq -n --arg t "$title" --arg d "${due}T09:00:00Z" --argjson p "$prio" \
    '{title:$t, due_date:$d, priority:$p}' |
  curl -s -X PUT $VIKUNJA/projects/2/tasks -H "Authorization: Bearer $VIKUNJA_API_TOKEN" \
    -H 'Content-Type: application/json' -d @- | jq -r '"\(.identifier) \(.title)"'
done
```

Result: one line such as `#1 Order cabinets` per row. Verify with the filtered list call sorted by `priority` descending.

## Guidelines

- Remember `PUT` = create and `POST` = update, and a task `POST` overwrites the whole task: a body of only `title` and `done` reset `priority` and `due_date` to 0 and unset when tested on v2.8.0. Always GET the task, change the field and POST the full object back.
- Pin the image tag and set `VIKUNJA_SERVICE_SECRET` explicitly; without it a random secret is generated and sessions break when the container is recreated.
- Chown the data directories to UID 1000 or the container will not start.
- Prefer scoped `tk_` API tokens with an expiry for agents; never paste tokens or passwords into notes, commits or logs.
- Set `VIKUNJA_SERVICE_ENABLEREGISTRATION=false` once the accounts exist (verified: `/register` then returns `Not Found`), and put TLS in front before exposing the server.
- Use `/api/v1/docs.json` as the source of truth for fields; this skill covers only calls that were run on v2.8.0.
- Vikunja is a task manager, not an issue tracker with sprints and code integrations, and not a notes store. For engineering backlogs consider Plane; for quick notes, Memos.
