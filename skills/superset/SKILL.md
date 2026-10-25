---
name: superset
description: |
  Apache Superset is an open-source data exploration and visualization platform.
  Learn Docker deployment, database connections, chart creation, dashboard building,
  SQL Lab usage, and programmatic access via the REST API.
license: Apache-2.0
compatibility: 'macos, linux'
metadata:
  author: terminal-skills
  repository: https://github.com/apache/superset
  version: 1.1.0
  category: data-ai
  tags: "superset, apache-superset, business-intelligence, dashboards, docker"
---

# Superset

## Overview

Apache Superset is a BI platform with a no-code chart builder, SQL Lab for ad-hoc queries, dashboards and a REST API. It connects to most SQL databases through SQLAlchemy drivers. The current release is 6.1.0 (May 2026). This skill covers a local or single-host install, first-run setup, connecting a database, scripting charts and dashboards through the API, and access control.

## Instructions

### Install with Docker Compose

The upstream compose files are for trying Superset and for development. The docs state plainly that a docker compose install is not production-ready (the metadata database lives in an unbacked-up volume, no high availability); for production use the Helm chart on Kubernetes.

```bash
git clone --depth=1 https://github.com/apache/superset.git
cd superset
export TAG=6.1.0-dev   # the plain 6.1.0 image has no database drivers, so it cannot reach the compose Postgres
git fetch --depth=1 origin tag 6.1.0
git checkout 6.1.0        # keeps docker/ scripts in sync with the image
docker compose -f docker-compose-image-tag.yml up -d
# UI at http://localhost:8088, login admin / admin (dev defaults, change them)
```

`docker-compose-non-dev.yml` builds an image from the checked-out branch instead; plain `docker-compose.yml` is the hot-reload development setup. Settings are in `docker/.env`; override them in `docker/.env-local`. `SUPERSET_LOAD_EXAMPLES=yes` loads sample dashboards.

### Your own compose file

The plain `apache/superset:6.1.0` image is the lean build: no database drivers (not even for the metadata database) and no headless browser. The `6.1.0-dev` tag adds `psycopg2-binary`, `mysqlclient` and Chromium and runs as root, which is fine locally; for production extend the lean image with your own drivers (see Docker Builds in the docs). Superset refuses to start without a strong `SECRET_KEY` (generate one with `openssl rand -base64 42`). The app does not read a `DATABASE_URL` variable: put the metadata database in `superset_config.py`.

### Minimal compose file and config

```yaml
# docker-compose.yml: Minimal Superset with PostgreSQL
services:
  superset:
    image: apache/superset:6.1.0-dev
    ports:
      - "8088:8088"
    environment:
      SUPERSET_SECRET_KEY: ${SUPERSET_SECRET_KEY}
    depends_on:
      - postgres
      - redis
    volumes:
      - ./superset_config.py:/app/pythonpath/superset_config.py

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: superset
      POSTGRES_PASSWORD: superset
      POSTGRES_DB: superset
    volumes:
      - pg-data:/var/lib/postgresql/data

  redis:
    image: redis:7

volumes:
  pg-data:
```

```python
# superset_config.py: Basic Superset configuration
import os
SECRET_KEY = os.environ['SUPERSET_SECRET_KEY']  # openssl rand -base64 42
SQLALCHEMY_DATABASE_URI = 'postgresql+psycopg2://superset:superset@postgres/superset'

# Feature flags (native filters are always on since 4.0; the old
# DASHBOARD_NATIVE_FILTERS flag was removed)
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
    'EMBEDDED_SUPERSET': True,
}

# Cache config
CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 300,
    'CACHE_KEY_PREFIX': 'superset_',
    'CACHE_REDIS_URL': 'redis://redis:6379/0',
}
```

### First-run setup

```bash
# setup.sh: Initialize Superset after first deploy
# Create admin user
# (own compose file only; the upstream compose files run these in superset_init)
# Order matters: migrate first, then create the admin, then init roles
docker compose exec superset superset db upgrade
docker compose exec superset superset fab create-admin \
  --username admin --firstname Ada --lastname Okafor \
  --email ada.okafor@northwind-analytics.io --password "$SUPERSET_ADMIN_PASSWORD"
docker compose exec superset superset init
# Optional sample dashboards
docker compose exec superset superset load_examples
```

### Connect a database

```bash
# add-database.sh: Add a data source via API
TOKEN=$(curl -s -X POST http://localhost:8088/api/v1/security/login \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"admin\", \"password\": \"$SUPERSET_ADMIN_PASSWORD\", \"provider\": \"db\"}" \
  | jq -r '.access_token')

# POST/PUT/DELETE also need a CSRF token and the session cookie it belongs to
CSRF=$(curl -s -c cookies.txt -H "Authorization: Bearer $TOKEN" \
  http://localhost:8088/api/v1/security/csrf_token/ | jq -r '.result')

curl -X POST http://localhost:8088/api/v1/database/ \
  -b cookies.txt -H "Authorization: Bearer $TOKEN" \
  -H "X-CSRFToken: $CSRF" -H "Referer: http://localhost:8088/" \
  -H "Content-Type: application/json" \
  -d @- <<JSON
{
    "database_name": "Production Analytics",
    "engine": "postgresql",
    "sqlalchemy_uri": "postgresql://readonly:${ANALYTICS_RO_PASSWORD}@prod-db:5432/analytics",
    "expose_in_sqllab": true,
    "allow_ctas": false,
    "allow_cvas": false
}
JSON
```

### SQL Lab

```text
SQL Lab is Superset's interactive SQL editor:

1. Navigate to SQL Lab → SQL Editor
2. Select your database and schema
3. Write and execute queries
4. Save results as a dataset for chart building
5. Use Jinja templates for dynamic queries:
   SELECT * FROM orders
   WHERE created_at >= '{{ from_dttm }}' AND created_at < '{{ to_dttm }}'
```

## Examples

### Create a chart through the API

```python
# create-chart.py: Programmatically create a chart
import os
import requests

BASE = 'http://localhost:8088/api/v1'
TOKEN = os.environ['SUPERSET_TOKEN']  # from /security/login

# Writes need a CSRF token plus the session cookie it belongs to: use one Session
session = requests.Session()
session.headers.update({'Authorization': f'Bearer {TOKEN}', 'Referer': 'http://localhost:8088/'})
session.headers['X-CSRFToken'] = session.get(f'{BASE}/security/csrf_token/').json()['result']

# Create a chart (slice)
chart = session.post(f'{BASE}/chart/', json={
    'slice_name': 'Monthly Revenue',
    'viz_type': 'echarts_timeseries_line',
    'datasource_id': 1,
    'datasource_type': 'table',
    'params': '{"metrics": ["sum__revenue"], "groupby": ["category"], "time_range": "Last year"}',
}).json()

print(f"Chart created: {chart['id']}")
```

### Create a dashboard through the API

```python
# create-dashboard.py: Create a dashboard (reuses `session` from above)
dashboard = session.post(f'{BASE}/dashboard/', json={
    'dashboard_title': 'Revenue Analytics',
    'published': True,
    'slug': 'revenue-analytics',
}).json()

dashboard_id = dashboard['id']   # the new id is top-level; 'result' only echoes the fields you sent
print(f"Dashboard: http://localhost:8088/superset/dashboard/{dashboard_id}/")
```

### Export and import dashboards

```bash
# export-import.sh: Export dashboards for version control
# Export dashboard as ZIP
# (-g: stop curl treating [1] as a URL range)
curl -g -o dashboard.zip \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8088/api/v1/dashboard/export/?q=[1]"

# Import dashboard (CSRF token and cookies.txt from the Connect a database step)
curl -X POST "http://localhost:8088/api/v1/dashboard/import/" \
  -b cookies.txt -H "Authorization: Bearer $TOKEN" \
  -H "X-CSRFToken: $CSRF" -H "Referer: http://localhost:8088/" \
  -F "formData=@dashboard.zip" \
  -F "overwrite=true"
# Database passwords are not exported; add a `passwords` form field (JSON map such as {"databases/MyDb.yaml": "..."}) when importing
```

### Role-based access

```text
Superset RBAC:
- Admin: Full access to all features
- Alpha: Access to all data sources, can create charts/dashboards
- Gamma: Access only to granted datasets and dashboards
- sql_lab: Permission to use SQL Lab

Custom roles: Settings → List Roles → Add new role with specific permissions
Row-level security: Settings → Row Level Security → Add filter per role
```

## Guidelines

- Never ship the dev defaults: admin/admin and the sample `SECRET_KEY` in `docker/.env`. Set your own `SUPERSET_SECRET_KEY`; to rotate it, put the old value in `superset_config.py` as `PREVIOUS_SECRET_KEY = '...'` (a config key, not an environment variable) and run `superset re-encrypt-secrets`.
- Do not run the upstream compose files in production, and back up the metadata database.
- Give Superset a read-only database user for analytics sources, and keep `allow_ctas`/`allow_cvas` off unless users must write.
- Pin the image tag and check out the matching git tag so the `docker/` scripts match the image.
- A chart's `params` is a JSON string, and its keys depend on `viz_type`; build the chart once in the UI and copy its saved params when scripting.
