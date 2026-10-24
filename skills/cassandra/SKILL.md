---
name: cassandra
description: |
  Apache Cassandra is a distributed NoSQL database designed for high availability and linear scalability.
  Learn CQL (Cassandra Query Language), data modeling with partition keys, replication strategies,
  and integration with Node.js using the DataStax driver.
license: Apache-2.0
compatibility: 'Cassandra 5.0.x, Docker or Linux; Node.js 20+ for cassandra-driver 4.10, Python 3.10+ for cassandra-driver 3.30'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - cassandra
    - nosql
    - distributed-database
    - cql
    - nodejs
  repository: https://github.com/apache/cassandra
---

# Cassandra

## Overview

Apache Cassandra is a peer-to-peer distributed database that provides high availability with no single point of failure. Data is distributed across nodes using consistent hashing.

## Instructions

### Installation

```bash
# Docker: current stable line is 5.0 (5.0.9 on 2026-10-24); bind to localhost only
docker run -d --name cassandra -p 127.0.0.1:9042:9042 cassandra:5.0

# Startup takes about a minute; retry until this prints the cqlsh/Cassandra versions
docker exec -it cassandra cqlsh -e "show version"

# Node.js driver
npm install cassandra-driver

# Python driver
pip install cassandra-driver
```

### CQL Basics

```sql
-- keyspace.cql: Create keyspace with replication strategy
CREATE KEYSPACE IF NOT EXISTS myapp
  WITH replication = {
    'class': 'NetworkTopologyStrategy',
    'datacenter1': 1
  }
  AND durable_writes = true;

USE myapp;
```

The replication factor must not exceed the number of nodes you can reach. With one Docker node, `'datacenter1': 3` is accepted (with a warning) but every `QUORUM` or `LOCAL_QUORUM` request then fails with "Cannot achieve consistency level" (verified on 5.0.9). Use 1 for a single node and 3 per datacenter in production. Check the datacenter name with `nodetool status`; the Docker image uses `datacenter1`.

### Data Modeling

```sql
-- tables.cql: Design tables around query patterns (partition key + clustering key)
-- Rule: one table per query pattern

-- Users by email (partition key: email)
CREATE TABLE users (
  email text PRIMARY KEY,
  name text,
  created_at timestamp
);

-- Posts by user, ordered by time (partition: user_id, clustering: created_at DESC)
CREATE TABLE posts_by_user (
  user_id uuid,
  created_at timestamp,
  post_id uuid,
  title text,
  body text,
  PRIMARY KEY (user_id, created_at)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- Support tables used by the batch examples below
CREATE TABLE user_post_counts (user_id uuid PRIMARY KEY, post_count int);
CREATE TABLE user_stats (user_id uuid PRIMARY KEY, post_count counter);

-- Time-series: sensor readings bucketed by day
CREATE TABLE sensor_readings (
  sensor_id text,
  day text,
  reading_time timestamp,
  value double,
  PRIMARY KEY ((sensor_id, day), reading_time)
) WITH CLUSTERING ORDER BY (reading_time DESC);
```

### CRUD Operations

```sql
-- crud.cql: Basic insert, select, update, delete
INSERT INTO users (email, name, created_at)
VALUES ('alice@northwind-shop.io', 'Alice', toTimestamp(now()));

SELECT * FROM users WHERE email = 'alice@northwind-shop.io';

-- Query with partition and clustering key
SELECT * FROM posts_by_user
WHERE user_id = 550e8400-e29b-41d4-a716-446655440000
  AND created_at > '2026-01-01'
LIMIT 20;

UPDATE users SET name = 'Alice Smith' WHERE email = 'alice@northwind-shop.io';

DELETE FROM users WHERE email = 'alice@northwind-shop.io';

-- Logged batch: all-or-nothing across tables, for keeping denormalized copies in step.
-- Not a performance tool; keep it to a few statements. Counter updates cannot be mixed in
-- (rejected: "Counter and non-counter mutations cannot exist in the same batch").
BEGIN BATCH
  INSERT INTO posts_by_user (user_id, created_at, post_id, title)
    VALUES (550e8400-e29b-41d4-a716-446655440000, toTimestamp(now()), uuid(), 'Hello');
  UPDATE user_post_counts SET post_count = 1 WHERE user_id = 550e8400-e29b-41d4-a716-446655440000;
APPLY BATCH;

-- Counters live in their own table and their own batch type
BEGIN COUNTER BATCH
  UPDATE user_stats SET post_count = post_count + 1 WHERE user_id = 550e8400-e29b-41d4-a716-446655440000;
APPLY BATCH;
```

### Node.js Driver

```javascript
// db.js: Cassandra client with DataStax Node.js driver
const { Client, types } = require('cassandra-driver');

const client = new Client({
  contactPoints: ['127.0.0.1:9042'],
  localDataCenter: 'datacenter1',
  keyspace: 'myapp',
  queryOptions: { consistency: types.consistencies.localQuorum },
});

async function main() {
  await client.connect();

  // Insert
  await client.execute(
    'INSERT INTO users (email, name, created_at) VALUES (?, ?, ?)',
    ['bob@northwind-shop.io', 'Bob', new Date()],
    { prepare: true }
  );

  // Query
  const result = await client.execute(
    'SELECT * FROM users WHERE email = ?',
    ['bob@northwind-shop.io'],
    { prepare: true }
  );
  console.log(result.rows[0]);

  // Stream every row of one partition (the driver pages internally)
  const userId = types.Uuid.fromString('550e8400-e29b-41d4-a716-446655440000');
  const query = 'SELECT * FROM posts_by_user WHERE user_id = ?';
  for await (const row of client.stream(query, [userId], { prepare: true })) {
    console.log(row.title);
  }

  // Manual paging: one page per call, pass result.pageState back to continue
  const page = await client.execute(query, [userId], { prepare: true, fetchSize: 20 });
  const next = page.pageState; // undefined when there are no more pages

  await client.shutdown();
}

main().catch(console.error);
```

### Python Driver

```python
# app.py: Cassandra with Python DataStax driver
from cassandra.cluster import Cluster
from cassandra.query import SimpleStatement, ConsistencyLevel

cluster = Cluster(['127.0.0.1'], port=9042)
session = cluster.connect('myapp')

# Insert
session.execute(
    "INSERT INTO users (email, name, created_at) VALUES (%s, %s, toTimestamp(now()))",
    ('alice@northwind-shop.io', 'Alice')
)

# Query with consistency level
stmt = SimpleStatement(
    "SELECT * FROM users WHERE email = %s",
    consistency_level=ConsistencyLevel.LOCAL_QUORUM
)
row = session.execute(stmt, ('alice@northwind-shop.io',)).one()
print(row.name)

cluster.shutdown()
```

### Replication and Consistency

```text
Consistency Levels:
- ONE: Fast, low consistency. Good for logs/metrics.
- QUORUM: Majority of replicas. Balanced read/write.
- LOCAL_QUORUM: Majority in local datacenter. Best for multi-DC.
- ALL: All replicas must respond. Slowest, strongest consistency.

Rule of thumb: Write CL + Read CL > Replication Factor = strong consistency
Example: RF=3, Write=QUORUM(2), Read=QUORUM(2) → 2+2 > 3 ✓
```

### Operations

```bash
# nodetool.sh: Common operational commands
# Check cluster status
docker exec cassandra nodetool status

# Check ring token distribution
docker exec cassandra nodetool ring

# Repair data (run regularly on multi-node clusters; on a single node it aborts with
# "Nothing to repair", which is expected)
docker exec cassandra nodetool repair -pr myapp

# Force a major compaction (rarely needed; avoid on large tables in production)
docker exec cassandra nodetool compact myapp posts_by_user

# Take a snapshot backup
docker exec cassandra nodetool snapshot myapp -t backup_20261024
```

## Examples

### Example 1: Start a local node and create the schema
**User request:** "Spin up Cassandra locally and create the users and posts tables."

Run the `docker run` command from Installation, wait until `cqlsh -e "show version"` prints `Cassandra 5.0.x`, then pipe `keyspace.cql` and `tables.cql` through `docker exec -i cassandra cqlsh`. `describe tables` in `myapp` lists `users`, `posts_by_user`, `sensor_readings`, `user_post_counts` and `user_stats`.

### Example 2: Read a user's latest posts from Node.js
**User request:** "Show the 20 newest posts for one user."

```javascript
const rs = await client.execute(
  'SELECT title, created_at FROM posts_by_user WHERE user_id = ? LIMIT 20',
  [userId], { prepare: true });
```

The clustering order `created_at DESC` returns the newest rows first from a single partition, so no sorting or filtering is needed.

## Guidelines

- Model tables from the queries you must answer; Cassandra has no joins, so denormalize.
- Always restrict reads by the full partition key; avoid `ALLOW FILTERING` and unbounded partitions (bucket time series by day or hour as in `sensor_readings`).
- Use prepared statements (`prepare: true` in Node.js, `session.prepare()` in Python) for repeated queries.
- Pick the replication factor and consistency levels together: reads plus writes above RF gives strong consistency.
- Do not publish port 9042 beyond localhost without enabling authentication and TLS in `cassandra.yaml`.
