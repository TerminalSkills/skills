# Coolify API Reference

Base URL: `https://<your-coolify-instance>/api/v1`

## Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Applications](#applications)
  - [Databases](#databases)
  - [Services](#services)
  - [Servers](#servers)
  - [Deployments](#deployments)
  - [Projects & Environments](#projects--environments)
  - [Security Keys](#security-keys)
  - [Teams](#teams)
  - [System](#system)
- [Common Patterns](#common-patterns)
  - [Deploy and wait for completion](#deploy-and-wait-for-completion)
  - [Bulk sync env vars from .env file](#bulk-sync-env-vars-from-env-file)

## Authentication

All requests require a Bearer token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer $COOLIFY_TOKEN" https://coolify.example.com/api/v1/version
```

Token permissions: `read`, `read:sensitive`, `write`, `write:sensitive`, `deploy`, `root` (everything). Give CI pipelines only `deploy`.

## Endpoints

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/applications` | List all applications |
| POST | `/applications/public` | Create from public Git repo |
| POST | `/applications/private-github-app` | Create from private GitHub repo |
| POST | `/applications/private-deploy-key` | Create from private repo via deploy key |
| POST | `/applications/dockerfile` | Create from Dockerfile |
| POST | `/applications/dockerimage` | Create from Docker image |
| GET | `/applications/{uuid}` | Get application details |
| PATCH | `/applications/{uuid}` | Update application |
| DELETE | `/applications/{uuid}` | Delete application |
| GET | `/applications/{uuid}/envs` | List env vars |
| POST | `/applications/{uuid}/envs` | Create env var |
| PATCH | `/applications/{uuid}/envs/bulk` | Bulk update env vars |
| PATCH | `/applications/{uuid}/envs` | Update one env var (identified by `key` in the body) |
| DELETE | `/applications/{uuid}/envs/{env_uuid}` | Delete env var |
| GET | `/applications/{uuid}/logs` | Get application logs |
| POST | `/applications/{uuid}/start` | Start application |
| POST | `/applications/{uuid}/stop` | Stop application |
| POST | `/applications/{uuid}/restart` | Restart application |

### Databases

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/databases` | List all databases |
| POST | `/databases/postgresql` | Create PostgreSQL |
| POST | `/databases/mysql` | Create MySQL |
| POST | `/databases/mariadb` | Create MariaDB |
| POST | `/databases/mongodb` | Create MongoDB |
| POST | `/databases/redis` | Create Redis |
| POST | `/databases/clickhouse` | Create ClickHouse |
| POST | `/databases/dragonfly` | Create Dragonfly |
| POST | `/databases/keydb` | Create KeyDB |
| POST | `/databases/sqlite` | Create SQLite |
| GET | `/databases/{uuid}` | Get database details |
| PATCH | `/databases/{uuid}` | Update database |
| DELETE | `/databases/{uuid}` | Delete database |
| POST | `/databases/{uuid}/start` | Start database |
| POST | `/databases/{uuid}/stop` | Stop database |
| POST | `/databases/{uuid}/restart` | Restart database |
| GET | `/databases/{uuid}/backups` | List backups |
| POST | `/databases/{uuid}/backups` | Create backup config |
| GET | `/databases/{uuid}/backups/{scheduled_backup_uuid}/executions` | List backup runs |
| PATCH | `/databases/{uuid}/backups/{scheduled_backup_uuid}` | Update backup (`"backup_now": true` runs it immediately) |
| DELETE | `/databases/{uuid}/backups/{scheduled_backup_uuid}` | Delete backup |

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/services` | List all services |
| POST | `/services` | Create service |
| GET | `/services/{uuid}` | Get service details |
| PATCH | `/services/{uuid}` | Update service |
| DELETE | `/services/{uuid}` | Delete service |
| GET | `/services/{uuid}/envs` | List env vars |
| POST | `/services/{uuid}/envs` | Create env var |
| PATCH | `/services/{uuid}/envs/bulk` | Bulk update env vars |
| PATCH | `/services/{uuid}/envs` | Update one env var (identified by `key` in the body) |
| DELETE | `/services/{uuid}/envs/{env_uuid}` | Delete env var |
| POST | `/services/{uuid}/start` | Start service |
| POST | `/services/{uuid}/stop` | Stop service |
| POST | `/services/{uuid}/restart` | Restart service |

### Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers` | List all servers |
| POST | `/servers` | Create server |
| GET | `/servers/{uuid}` | Get server details |
| PATCH | `/servers/{uuid}` | Update server |
| DELETE | `/servers/{uuid}` | Delete server |
| POST | `/servers/{uuid}/validate` | Validate server |
| GET | `/servers/{uuid}/domains` | List server domains |
| GET | `/servers/{uuid}/resources` | List server resources |

### Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/deploy` | Trigger deployment (query: `uuid` or `tag`, comma-separated lists allowed; also `force`, `pr`) |
| GET | `/deployments` | List deployments |
| GET | `/deployments/{uuid}` | Get deployment details |
| GET | `/deployments/applications/{uuid}` | List an application's deployments |
| POST | `/deployments/{uuid}/cancel` | Cancel deployment |

### Projects & Environments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/{uuid}` | Get project |
| PATCH | `/projects/{uuid}` | Update project |
| DELETE | `/projects/{uuid}` | Delete project |
| GET | `/projects/{uuid}/environments` | List environments |
| POST | `/projects/{uuid}/environments` | Create environment |
| GET | `/projects/{uuid}/{environment_name_or_uuid}` | Get environment |
| DELETE | `/projects/{uuid}/environments/{environment_name_or_uuid}` | Delete environment |

### Security Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/security/keys` | List SSH keys |
| POST | `/security/keys` | Create SSH key |
| GET | `/security/keys/{uuid}` | Get key details |
| PATCH | `/security/keys/{uuid}` | Update key |
| DELETE | `/security/keys/{uuid}` | Delete key |

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/teams` | List teams |
| GET | `/teams/current` | Get current team |
| GET | `/teams/current/members` | Get team members |
| GET | `/teams/{id}` | Get team by ID |
| GET | `/teams/{id}/members` | Get team members by ID |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/version` | Get Coolify version |
| POST | `/enable` | Enable API |
| POST | `/disable` | Disable API |

## Common Patterns

### Deploy and wait for completion

```bash
# Trigger deploy and capture deployment UUID
DEPLOY_UUID=$(curl -s --fail-with-body -X POST "$COOLIFY_URL/api/v1/deploy?uuid=app-uuid" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq -r '.deployments[0].deployment_uuid')

# Poll until complete
while true; do
  STATUS=$(curl -s "$COOLIFY_URL/api/v1/deployments/$DEPLOY_UUID" \
    -H "Authorization: Bearer $COOLIFY_TOKEN" | jq -r '.status')
  echo "Status: $STATUS"
  case "$STATUS" in finished|error|killed|cancelled|closed) break ;; esac
  sleep 5
done
```

### Bulk sync env vars from .env file

```bash
# Convert .env file to {"data": [...]} and push
jq -R -s '{data: (split("\n") | map(select(length > 0 and (startswith("#") | not))) |
  map(split("=") | {key: .[0], value: (.[1:] | join("="))}))}' .env.production | \
curl -X PATCH "$COOLIFY_URL/api/v1/applications/<uuid>/envs/bulk" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d @-
```
