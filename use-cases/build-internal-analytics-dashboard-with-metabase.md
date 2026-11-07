---
title: Build an Internal Analytics Dashboard with Metabase
slug: build-internal-analytics-dashboard-with-metabase
description: Deploy Metabase with Docker Compose, connect it to PostgreSQL, and build interactive dashboards for tracking business metrics like revenue, users, and retention.
skills:
  - metabase
  - postgresql
  - docker-helper
category: data-ai
tags:
  - business-intelligence
  - dashboards
  - metrics
  - docker
  - postgresql
---

# Build an Internal Analytics Dashboard with Metabase

Every growing team needs visibility into key metrics. Instead of building custom dashboards from scratch, you can deploy Metabase, an open-source BI tool that lets anyone create charts and dashboards without writing code. This walkthrough deploys Metabase, connects it to your PostgreSQL database through a read-only role, and builds dashboards for revenue, user growth and plan mix.

## Infrastructure Setup (docker-helper)

Metabase needs its own database for dashboards and settings, separate from your application database. This Compose file runs both, plus a demo app database to build against. Everything listens on 127.0.0.1 only, and passwords come from a `.env` file instead of the YAML.

```yaml
# compose.yaml: Metabase, its own Postgres, and a demo application database
services:
  metabase:
    image: metabase/metabase:v0.65.3.3   # pin a tag; check hub.docker.com/r/metabase/metabase for the latest
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: ${METABASE_DB_PASSWORD:?set it in .env}
      MB_DB_HOST: metabase-db
      MB_SITE_NAME: "Acme Analytics"
      MB_ANON_TRACKING_ENABLED: "false"   # turns off usage telemetry
      MB_PASSWORD_COMPLEXITY: strong
    depends_on:
      metabase-db:
        condition: service_healthy
    restart: unless-stopped

  metabase-db:
    image: postgres:18
    environment:
      POSTGRES_USER: metabase
      POSTGRES_PASSWORD: ${METABASE_DB_PASSWORD:?set it in .env}
      POSTGRES_DB: metabase
    volumes:
      - metabase-data:/var/lib/postgresql   # Postgres 18 keeps data in a versioned subdirectory
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U metabase -d metabase"]
      interval: 5s
      timeout: 5s
      retries: 5

  app-db:
    image: postgres:18
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${APP_DB_PASSWORD:?set it in .env}
      POSTGRES_DB: myapp
      METABASE_READER_PASSWORD: ${METABASE_READER_PASSWORD:?set it in .env}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - app-data:/var/lib/postgresql
      - ./initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  metabase-data:
  app-data:
```

```bash
# .env: generate the three passwords once; keep this file out of git
printf 'METABASE_DB_PASSWORD=%s\nAPP_DB_PASSWORD=%s\nMETABASE_READER_PASSWORD=%s\n' \
  "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > .env
echo ".env" >> .gitignore
```

## Seed Data and a Read-Only Role (postgresql)

Postgres runs every file in `initdb/` once, on first start, in name order. The first creates demo tables, the second creates the role Metabase will use. The role gets `SELECT` only, so a mistaken question can never modify your data.

```sql
-- initdb/01-schema.sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (name, email, plan, created_at)
SELECT 'User ' || i, 'user' || i || '@example.com',
       (ARRAY['free', 'pro', 'enterprise'])[1 + floor(random() * 3)::int],
       NOW() - (random() * interval '365 days')
FROM generate_series(1, 500) AS i;

INSERT INTO orders (user_id, amount, status, created_at)
SELECT 1 + floor(random() * 500)::int,
       round((10 + random() * 490)::numeric, 2),
       (ARRAY['pending', 'completed', 'completed', 'completed', 'cancelled'])[1 + floor(random() * 5)::int],
       NOW() - (random() * interval '180 days')
FROM generate_series(1, 2000);

-- Dashboards filter by date range on every load
CREATE INDEX orders_created_at_idx ON orders (created_at);
```

```bash
#!/bin/sh
# initdb/02-reader.sh: runs once; the password comes from the container environment
set -e
psql -v ON_ERROR_STOP=1 -v pw="$METABASE_READER_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE metabase_reader LOGIN PASSWORD :'pw';
GRANT CONNECT ON DATABASE myapp TO metabase_reader;
GRANT USAGE ON SCHEMA public TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_reader;
SQL
```

Mark the script executable with `chmod +x initdb/02-reader.sh`.

## Deploying and Connecting

```bash
docker compose up -d
# First start runs Metabase's database migrations and takes a minute or two
until curl -s http://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; do sleep 5; done
echo "Metabase is ready at http://127.0.0.1:3000"
```

Open `http://127.0.0.1:3000` and complete the setup wizard. Choose a strong admin password (the compose file enforces the `strong` rule), then add the database:

- **Database type:** PostgreSQL
- **Host:** `app-db` (the Compose service name, not `localhost`)
- **Port:** `5432`
- **Database name:** `myapp`
- **Username:** `metabase_reader`
- **Password:** the `METABASE_READER_PASSWORD` value from `.env`

For a real database, point the host at it instead, keep the read-only user, and enable SSL. To script this step, use the `metabase` skill's API connection example with an API key.

## Building Key Dashboards (metabase)

Create a dashboard called "Revenue Overview". For each query below choose **New > SQL query**, pick the database, paste the SQL, run it, save it as a question, and add it to the dashboard. Each query was run against the seeded data above.

```sql
-- Monthly revenue trend (use a line or bar chart)
SELECT
    DATE_TRUNC('month', created_at)::date AS month,
    SUM(amount) FILTER (WHERE status = 'completed') AS revenue,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_orders,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders
FROM orders
WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
GROUP BY 1
ORDER BY 1
```

```sql
-- Current-month KPIs (one number card per column)
SELECT
    SUM(amount) FILTER (WHERE status = 'completed') AS total_revenue,
    COUNT(*) FILTER (WHERE status = 'completed') AS total_orders,
    COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed') AS paying_customers,
    ROUND(AVG(amount) FILTER (WHERE status = 'completed'), 2) AS avg_order_value
FROM orders
WHERE created_at >= DATE_TRUNC('month', NOW())
```

```sql
-- User growth: weekly signups with a running total
WITH weekly AS (
    SELECT
        DATE_TRUNC('week', created_at)::date AS week,
        COUNT(*) AS new_users,
        COUNT(*) FILTER (WHERE plan = 'pro') AS new_pro,
        COUNT(*) FILTER (WHERE plan = 'enterprise') AS new_enterprise
    FROM users
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY 1
)
SELECT week, new_users, new_pro, new_enterprise,
       SUM(new_users) OVER (ORDER BY week) AS cumulative_users
FROM weekly
ORDER BY week
```

```sql
-- Plan distribution (use a pie chart)
SELECT plan, COUNT(*) AS user_count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM users
GROUP BY plan
ORDER BY user_count DESC
```

If a question gets slow on a real dataset, run `EXPLAIN` on it in `psql` and index the column it filters on, as `orders_created_at_idx` does above.

## Alerts and Scheduled Reports

Alerts apply to saved questions. Open the question, click the three dots, choose **Create an alert**, pick the condition (a result is returned, a time series crosses a goal line, or a progress bar reaches its goal), a check schedule, and a destination (email, Slack or webhook). An administrator must first configure at least one notification channel in the admin settings.

Dashboard subscriptions send a rendered dashboard on a schedule: open the dashboard, click the three dots, choose **Subscriptions**, and set recipients and frequency (hourly, daily, weekly or monthly). Use **Send email now** to test it before the first scheduled delivery.

## Security Checklist

1. Connect Metabase with a read-only database role, never the application's owner account.
2. Bind published ports to 127.0.0.1 and put Metabase behind an HTTPS reverse proxy (Caddy or nginx) before anyone outside the machine uses it.
3. Keep passwords in `.env` or a secrets manager; set `MB_PASSWORD_COMPLEXITY=strong`.
4. `MB_ANON_TRACKING_ENABLED=false` turns off usage telemetry. It is not an access control; to restrict who sees data, use groups and data permissions.
5. Create Metabase groups that match team roles (Marketing, Engineering, Exec) and grant each group access only to the tables it needs. Single sign-on options are under Admin > Settings > Authentication.
6. Back up the `metabase` database before upgrading Metabase, because its schema cannot be downgraded.

Non-technical users can build their own questions with the visual query builder, while analysts write SQL directly.

## Related Skills

- [metabase](/skills/metabase) — dashboards, API connections, embedding and subscriptions
- [postgresql](/skills/postgresql) — the read-only role, indexes and query plans
- [docker-helper](/skills/docker-helper) — the Compose stack with healthchecks and loopback-only ports
