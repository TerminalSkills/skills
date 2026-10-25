---
name: postgresql
description: >-
  Assists with designing schemas, writing performant queries, managing indexes, and operating
  PostgreSQL databases. Use when working with JSONB, full-text search, window functions,
  CTEs, row-level security, replication, or performance tuning. Trigger words: postgresql,
  postgres, sql, database, jsonb, rls, window functions, cte.
license: Apache-2.0
compatibility: "PostgreSQL 14+ (examples tested on 18.6); uuidv7() needs 18+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "postgresql, database, sql, relational, jsonb"
  repository: "https://github.com/postgres/postgres"
---

# PostgreSQL

## Overview

PostgreSQL is an open-source relational database with features that often replace separate tools: JSONB for semi-structured data, built-in full-text search, window functions, recursive CTEs, row-level security (RLS) for tenant isolation, and streaming replication. It offers partitioning and several index types (B-tree, GIN, GiST, BRIN). The current major version is 18 (18.6 as of August 2026); 14 reaches end of life on 12 November 2026, so new projects should start on 17 or 18.

## Instructions

- Schemas: use `uuid` primary keys with `DEFAULT gen_random_uuid()` (built in since 13, no extension needed), or `uuidv7()` on 18+ when you want time-ordered keys that keep B-tree inserts local. Use `timestamptz` for all timestamps, `text` rather than `varchar(n)` unless a limit is a real rule, `GENERATED ALWAYS AS IDENTITY` for integer keys, and CHECK, UNIQUE and foreign keys with explicit `ON DELETE`. Partition large time-series tables with `PARTITION BY RANGE`.
- JSON: use `jsonb` for genuinely dynamic data and a GIN index for containment (`@>`) queries; keep known fields in real columns.
- Indexing: read `EXPLAIN (ANALYZE, BUFFERS)` output before adding an index. Use partial indexes for filtered queries, expression indexes for computed values, and `INCLUDE` columns for index-only scans. Build on live tables with `CREATE INDEX CONCURRENTLY`.
- Full-text search: add a `tsvector` column declared `GENERATED ALWAYS AS (...) STORED` with a GIN index. Always pass the language config explicitly (`to_tsvector('english', ...)`), wrap nullable columns in `coalesce`, query with `websearch_to_tsquery` (accepts quotes and `-term`, never raises syntax errors) and rank with `ts_rank`.
- Multi-tenancy: enable RLS and write policies with `USING` and `WITH CHECK`. Table owners, superusers and roles with `BYPASSRLS` skip policies, so connect the application as a separate non-owner role (or add `FORCE ROW LEVEL SECURITY`). Pass the tenant with `set_config('app.tenant_id', $1, true)` inside the transaction.
- Operations: pool connections (PgBouncer, or the pooler your platform provides) because each connection is a server process; enable `pg_stat_statements` through `shared_preload_libraries` followed by `CREATE EXTENSION pg_stat_statements`; rely on autovacuum and run `ANALYZE` by hand after bulk loads; use Patroni or a managed service for failover.

## Examples

### Example 1: Multi-tenant table with row-level security

**User request:** "Set up row-level security so each tenant only sees its own projects"

```sql
CREATE ROLE app_user LOGIN;  -- the application connects as this role, not as the table owner

CREATE TABLE projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_tenant_idx ON projects (tenant_id, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO app_user;
```

Per request, inside one transaction:

```sql
BEGIN;
SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
SELECT id, name FROM projects;   -- only tenant 1111... rows
COMMIT;
```

**Result:** another tenant's setting returns zero rows, an insert with a foreign `tenant_id` fails with `new row violates row-level security policy for table "projects"`. The `NULLIF` matters: after the transaction ends the setting is an empty string, not NULL, and a bare `::uuid` cast would raise `invalid input syntax for type uuid: ""` instead of returning no rows. Because the setting is transaction-local (`true`), it is also safe behind PgBouncer in transaction mode; a session-level `SET` would leak to the next client.

### Example 2: Full-text search with ranking and highlighting

**User request:** "Implement search across articles with relevance ranking and highlighting"

```sql
CREATE TABLE articles (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  body  text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED
);
CREATE INDEX articles_search_idx ON articles USING gin (search_vector);

SELECT id, title,
       ts_rank(search_vector, q) AS rank,
       ts_headline('english', body, q, 'StartSel=<b>, StopSel=</b>') AS snippet
FROM articles, websearch_to_tsquery('english', 'autovacuum tuning') AS q
WHERE search_vector @@ q
ORDER BY rank DESC
LIMIT 20;
```

**Result:** rows matching both stems, title matches ranked above body matches, with matched words wrapped in `<b>` tags (for example `How to <b>tune</b> <b>autovacuum</b> settings for large tables`), served from the GIN index.

## Guidelines

- Use `timestamptz`, not `timestamp`; the latter drops the time zone.
- Prefer random or time-ordered UUIDs over sequential public IDs if IDs are exposed in URLs.
- Measure with `EXPLAIN (ANALYZE, BUFFERS)` before and after adding an index; every index slows writes.
- Do not run application code as the table owner or a superuser if you rely on RLS; both bypass it unless the table has `FORCE ROW LEVEL SECURITY`, and superusers and `BYPASSRLS` roles bypass it even then.
- Never build SQL by string concatenation; pass tenant IDs and search terms as bind parameters.
- Expect more than about 20 to 50 concurrent clients to need a pooler. In transaction pooling mode, avoid session state (`SET` without `LOCAL`, advisory locks held across transactions, session-level prepared statements on older PgBouncer).
- Official Docker images from 18 on keep data under `/var/lib/postgresql` (the versioned subdirectory is inside it); mount the volume there, not at `/var/lib/postgresql/data`.
- Upgrade across major versions with `pg_upgrade` or logical replication, not by copying the data directory.
