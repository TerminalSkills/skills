---
title: Build an Internal Analytics Dashboard with Metabase
slug: build-internal-analytics-dashboard-with-metabase
description: Deploy Metabase with Docker Compose, connect it to PostgreSQL, and build interactive dashboards for tracking business metrics like revenue, users, and retention.
skills:
  - metabase
  - postgresql
  - docker-compose
category: analytics
tags:
  - business-intelligence
  - dashboards
  - metrics
  - docker
  - postgresql
---

# Build an Internal Analytics Dashboard with Metabase

Every growing team needs visibility into key metrics. Instead of building custom dashboards from scratch, you can deploy Metabase — an open-source BI tool that lets anyone create charts and dashboards without writing code. This walkthrough covers deploying Metabase, connecting it to your PostgreSQL database, and creating dashboards for common business metrics.

## Infrastructure Setup

Metabase needs its own database for storing dashboards and settings, separate from your application database. This Docker Compose setup runs both.

```yaml
# docker-compose.yml: Metabase with its own PostgreSQL and your app database
services:
  metabase:
    image: metabase/metabase:v0.50.0
    ports:
      - "3000:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: metabase
      MB_DB_HOST: metabase-db
      MB_SITE_NAME: "Acme Analytics"
      MB_ANON_TRACKING_ENABLED: "false"
    depends_on:
      metabase-db:
        condition: service_healthy
      app-db:
        condition: service_healthy

  metabase-db:
    image: postgres:16
    environment:
      POSTGRES_USER: metabase
      POSTGRES_PASSWORD: metabase
      POSTGRES_DB: metabase
    volumes:
      - metabase-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U metabase"]
      interval: 5s
      retries: 5

  app-db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: myapp
    ports:
      - "5432:5432"
    volumes:
      - app-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

volumes:
  metabase-data:
  app-data:
```

## Seed Data

Create sample tables and data to build dashboards against.

```sql
-- init.sql: Application schema with sample business data
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE page_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    page TEXT NOT NULL,
    referrer TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create a read-only user for Metabase
CREATE USER metabase_reader WITH PASSWORD 'readonly';
GRANT CONNECT ON DATABASE myapp TO metabase_reader;
GRANT USAGE ON SCHEMA public TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_reader;

-- Insert sample data
INSERT INTO users (name, email, plan, created_at)
SELECT
    'User ' || i,
    'user' || i || '@example.com',
    (ARRAY['free', 'pro', 'enterprise'])[1 + (random() * 2)::int],
    NOW() - (random() * interval '365 days')
FROM generate_series(1, 500) AS i;

INSERT INTO orders (user_id, amount, status, created_at)
SELECT
    (random() * 499 + 1)::int,
    (random() * 500 + 10)::numeric(10,2),
    (ARRAY['pending', 'completed', 'completed', 'completed', 'cancelled'])[1 + (random() * 4)::int],
    NOW() - (random() * interval '180 days')
FROM generate_series(1, 2000);
```

## Deploying and Connecting

```bash
# deploy.sh: Launch and configure Metabase
docker compose up -d

# Wait for Metabase to initialize (takes 1-2 minutes on first run)
echo "Waiting for Metabase..."
until curl -s http://localhost:3000/api/health | grep -q '"status":"ok"'; do
  sleep 5
done
echo "Metabase is ready at http://localhost:3000"
```

Open `http://localhost:3000` and complete the setup wizard:

1. Create your admin account
2. When prompted to add a database, use these settings:
   - **Database type:** PostgreSQL
   - **Host:** `app-db`
   - **Port:** `5432`
   - **Database name:** `myapp`
   - **Username:** `metabase_reader`
   - **Password:** `readonly`

## Building Key Dashboards

### Revenue Overview

Create a new dashboard called "Revenue Overview" and add these questions:

```sql
-- revenue-monthly.sql: Monthly revenue trend (New Question → Native Query)
SELECT
    DATE_TRUNC('month', created_at)::date AS month,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS revenue,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_orders,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders
FROM orders
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1
```

```sql
-- revenue-kpis.sql: Current month KPIs for metric cards
SELECT
    SUM(amount) FILTER (WHERE status = 'completed') AS total_revenue,
    COUNT(*) FILTER (WHERE status = 'completed') AS total_orders,
    COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed') AS paying_customers,
    AVG(amount) FILTER (WHERE status = 'completed') AS avg_order_value
FROM orders
WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
```

### User Growth

```sql
-- user-growth.sql: Weekly new signups with cumulative total
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
SELECT
    week,
    new_users,
    new_pro,
    new_enterprise,
    SUM(new_users) OVER (ORDER BY week) AS cumulative_users
FROM weekly
ORDER BY week
```

### Plan Distribution

```sql
-- plan-distribution.sql: Current user distribution by plan (use as pie chart)
SELECT
    plan,
    COUNT(*) AS user_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM users
GROUP BY plan
ORDER BY user_count DESC
```

## Setting Up Alerts

Metabase can notify you when metrics cross thresholds. After saving a question:

1. Click the bell icon on any saved question
2. Choose "Alert me when results meet conditions"
3. Set the condition (e.g., "daily revenue drops below $1,000")
4. Add email recipients or a Slack channel

## Automating Dashboard Reports

Schedule email digests of your dashboards:

1. Open the dashboard → click the sharing icon → "Dashboard subscriptions"
2. Set the schedule (daily at 9 AM, weekly on Monday, etc.)
3. Add recipient email addresses
4. Metabase sends a rendered snapshot of the dashboard on schedule

## Security Best Practices

```text
Production checklist:
1. Use a read-only database user (never give Metabase write access)
2. Enable HTTPS via reverse proxy (nginx/Caddy)
3. Set MB_PASSWORD_COMPLEXITY=strong
4. Disable anonymous access: MB_ANON_TRACKING_ENABLED=false
5. Use SSO/LDAP for team authentication
6. Create Metabase groups matching team roles (Marketing, Engineering, Exec)
7. Assign data permissions per group — not everyone needs access to all tables
```

This setup gives your team self-serve analytics without building custom dashboards. Non-technical users can create their own questions using the visual query builder, while analysts can write SQL directly. The Docker Compose stack makes it easy to deploy anywhere and scale as your data grows.
