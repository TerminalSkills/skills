---
name: superset
description: |
  Apache Superset is an open-source data exploration and visualization platform.
  Learn Docker deployment, database connections, chart creation, dashboard building,
  SQL Lab usage, and programmatic access via the REST API.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - superset
    - apache-superset
    - business-intelligence
    - dashboards
    - docker
---

# Superset

Apache Superset is a modern BI platform that supports rich visualizations, SQL Lab for ad-hoc queries, and a no-code chart builder. It connects to most SQL databases.

## Installation

```bash
# Docker Compose (official method)
git clone https://github.com/apache/superset.git
cd superset
docker compose -f docker-compose-non-dev.yml up -d

# Access at http://localhost:8088 (admin/admin)
```

```yaml
# docker-compose.yml: Minimal Superset with PostgreSQL
services:
  superset:
    image: apache/superset:3.1.0
    ports:
      - "8088:8088"
    environment:
      SUPERSET_SECRET_KEY: your-secret-key-change-me
      DATABASE_URL: postgresql+psycopg2://superset:superset@postgres/superset
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
SECRET_KEY = 'your-secret-key-change-me'
SQLALCHEMY_DATABASE_URI = 'postgresql+psycopg2://superset:superset@postgres/superset'

# Feature flags
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
    'DASHBOARD_NATIVE_FILTERS': True,
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

## Initial Setup

```bash
# setup.sh: Initialize Superset after first deploy
# Create admin user
docker exec -it superset superset fab create-admin \
  --username admin \
  --firstname Admin \
  --lastname User \
  --email admin@example.com \
  --password admin

# Initialize the database
docker exec -it superset superset db upgrade

# Load example dashboards (optional)
docker exec -it superset superset load_examples

# Initialize roles and permissions
docker exec -it superset superset init
```

## Connect a Database

```bash
# add-database.sh: Add a data source via API
TOKEN=$(curl -s -X POST http://localhost:8088/api/v1/security/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin", "provider": "db"}' \
  | jq -r '.access_token')

curl -X POST http://localhost:8088/api/v1/database/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database_name": "Production Analytics",
    "engine": "postgresql",
    "sqlalchemy_uri": "postgresql://readonly:pass@prod-db:5432/analytics",
    "expose_in_sqllab": true,
    "allow_ctas": false,
    "allow_cvas": false
  }'
```

## SQL Lab

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

## Create Charts via API

```python
# create-chart.py: Programmatically create a chart
import requests

BASE = 'http://localhost:8088/api/v1'
TOKEN = 'your-access-token'
headers = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}

# Create a chart (slice)
chart = requests.post(f'{BASE}/chart/', headers=headers, json={
    'slice_name': 'Monthly Revenue',
    'viz_type': 'echarts_timeseries_line',
    'datasource_id': 1,
    'datasource_type': 'table',
    'params': '{"metrics": ["sum__revenue"], "groupby": ["category"], "time_range": "Last year"}',
}).json()

print(f"Chart created: {chart['id']}")
```

## Create Dashboard via API

```python
# create-dashboard.py: Create a dashboard and add charts
dashboard = requests.post(f'{BASE}/dashboard/', headers=headers, json={
    'dashboard_title': 'Revenue Analytics',
    'published': True,
    'slug': 'revenue-analytics',
}).json()

dashboard_id = dashboard['result']['id']
print(f"Dashboard: http://localhost:8088/superset/dashboard/{dashboard_id}/")
```

## Export and Import

```bash
# export-import.sh: Export dashboards for version control
# Export dashboard as ZIP
curl -o dashboard.zip \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8088/api/v1/dashboard/export/?q=[1]"

# Import dashboard
curl -X POST "http://localhost:8088/api/v1/dashboard/import/" \
  -H "Authorization: Bearer $TOKEN" \
  -F "formData=@dashboard.zip" \
  -F "overwrite=true"
```

## Role-Based Access

```text
Superset RBAC:
- Admin: Full access to all features
- Alpha: Access to all data sources, can create charts/dashboards
- Gamma: Access only to granted datasets and dashboards
- sql_lab: Permission to use SQL Lab

Custom roles: Settings → List Roles → Add new role with specific permissions
Row-level security: Settings → Row Level Security → Add filter per role
```
