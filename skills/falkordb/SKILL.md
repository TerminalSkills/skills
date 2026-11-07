---
name: falkordb
description: >-
  FalkorDB is a graph database that runs as a Redis module and answers openCypher queries. Use it to store knowledge graphs, agent memory or connected data and to run vector similarity search next to graph traversal. Trigger phrases - "run FalkorDB", "GRAPH.QUERY", "store a knowledge graph in FalkorDB", "falkordb Python client", "vector index on graph nodes", "graph database on Redis", "Cypher in Docker".
license: Apache-2.0
compatibility: "Docker (the falkordb/falkordb image bundles Redis and the module), Python 3.10+ for the falkordb client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "falkordb, graph-database, cypher, redis, knowledge-graph"
  repository: https://github.com/FalkorDB/FalkorDB
---
# FalkorDB — a Redis-module graph database with Cypher and vector search

## Overview

FalkorDB stores property graphs inside Redis and executes openCypher queries with sparse-matrix algebra. Because it is a Redis module, any Redis client can talk to it: graph commands are `GRAPH.QUERY`, `GRAPH.RO_QUERY`, `GRAPH.EXPLAIN`, `GRAPH.LIST` and `GRAPH.DELETE`. Each graph is a separate Redis key, so one server holds many isolated graphs (one per tenant, per agent, per project).

It also supports range, full-text and vector indexes on node and edge properties, which makes it a fit for GraphRAG: embeddings and the entity graph live in the same store and the same query.

This skill was run against `falkordb/falkordb:v4.22.3` (the 4.22 line) and the PyPI `falkordb` client 1.8.1. A newer 6.0.x line is published and the `latest` tag now points to it; it was not tested here, so keep the pinned tag until you have checked your queries against the newer one.

## Instructions

### Run the server

Pin the image tag and bind to localhost; the server has no password by default.

```bash
docker run -d --name falkordb -p 127.0.0.1:6379:6379 -v falkordb-data:/var/lib/falkordb/data falkordb/falkordb:v4.22.3
```

Use another host port (`-p 127.0.0.1:6390:6379`) if 6379 is taken. The image ships a `redis-cli`:

```bash
docker exec falkordb redis-cli PING
docker exec falkordb redis-cli MODULE LIST
```

`MODULE LIST` shows the module named `graph`. The `falkordb/falkordb` image is the only thing you need; Redis and the module are inside it.

### Write and read with redis-cli

The graph is created by the first write that names it.

```bash
docker exec falkordb redis-cli GRAPH.QUERY supply "CREATE (:Supplier {name:'Baltic Steel', country:'EE'})-[:SHIPS_TO {days:3}]->(:Warehouse {name:'Rotterdam-1'})"
docker exec falkordb redis-cli GRAPH.QUERY supply "MATCH (s:Supplier)-[r:SHIPS_TO]->(w:Warehouse) RETURN s.name, r.days, w.name"
docker exec falkordb redis-cli GRAPH.LIST
docker exec falkordb redis-cli GRAPH.EXPLAIN supply "MATCH (s:Supplier) WHERE s.name = 'Baltic Steel' RETURN s"
```

The reply lists the header row, the data rows and statistics (nodes created, execution time). `GRAPH.RO_QUERY` is the same for read-only queries and is safe to send to replicas. `GRAPH.DELETE <graph>` drops a whole graph.

### Python client

```bash
pip install falkordb
```

```python
from falkordb import FalkorDB

db = FalkorDB(host="127.0.0.1", port=6379)   # password=... if the server requires one
g = db.select_graph("supply")                 # lazy: the graph exists after the first write

g.query(
    "MERGE (s:Supplier {name: $name}) SET s.country = $country",
    {"name": "Baltic Steel", "country": "EE"},
)
res = g.ro_query("MATCH (s:Supplier {country: $c}) RETURN s.name", {"c": "EE"})
for row in res.result_set:        # list of rows, each a list of column values
    print(row[0])
print(res.header, res.run_time_ms)
print(db.list_graphs())
```

Always pass values as the parameter dict (`$name`), never format them into the query string: it avoids injection and lets the server cache the query plan. Nodes and edges come back as objects with `.labels`, `.properties` and `.id` when you `RETURN s` instead of properties.

### Indexes

```python
g.query("CREATE INDEX FOR (s:Supplier) ON (s.name)")      # range index, speeds up lookups and MERGE
g.create_node_range_index("Warehouse", "name")            # same thing through the client
print(g.query("CALL db.indexes()").result_set)
```

### Vector search for GraphRAG

Create a vector index with a fixed dimension, store vectors with `vecf32(...)`, and search with `db.idx.vector.queryNodes`.

```python
g = db.select_graph("kb")
g.query("CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {dimension: 4, similarityFunction: 'cosine'}")

g.query(
    "CREATE (:Chunk {id: $id, text: $text, embedding: vecf32($vec)})",
    {"id": "c1", "text": "Baltic Steel supplies the Rotterdam warehouse", "vec": [0.1, 0.2, 0.3, 0.4]},
)

hits = g.ro_query(
    "CALL db.idx.vector.queryNodes('Chunk', 'embedding', 5, vecf32($q)) "
    "YIELD node, score RETURN node.id, node.text, score",
    {"q": [0.1, 0.2, 0.3, 0.35]},
).result_set
```

The `dimension` must equal your embedding model's output size (for example 1536 for OpenAI `text-embedding-3-small`). With `cosine` the returned `score` is a distance: smaller means closer, so the best match has a score near 0. Combine the search with traversal by chaining a `MATCH` after the `YIELD`, for instance `MATCH (node)-[:MENTIONS]->(e:Entity) RETURN e.name`.

### Housekeeping

- Remove a graph: `g.delete()` in Python or `GRAPH.DELETE name`.
- Persistence follows Redis persistence; the volume at `/var/lib/falkordb/data` keeps the data across container restarts.
- Stop and clean up a test server with `docker rm -fv falkordb`.

## Examples

### Example 1: a small supply-chain graph

**Request:** "Start FalkorDB locally and model that Baltic Steel ships to the Rotterdam-1 warehouse in 3 days; then tell me which suppliers reach Rotterdam-1."

```bash
docker run -d --name falkordb -p 127.0.0.1:6379:6379 falkordb/falkordb:v4.22.3
docker exec falkordb redis-cli GRAPH.QUERY supply "CREATE (:Supplier {name:'Baltic Steel'})-[:SHIPS_TO {days:3}]->(:Warehouse {name:'Rotterdam-1'})"
docker exec falkordb redis-cli GRAPH.QUERY supply "MATCH (s:Supplier)-[r:SHIPS_TO]->(:Warehouse {name:'Rotterdam-1'}) RETURN s.name, r.days"
```

**Result:** the first query reports `Nodes created: 2` and `Relationships created: 1`; the second prints the header `s.name`, `r.days` followed by `Baltic Steel` and `3`.

### Example 2: chunks with embeddings and a hybrid lookup

**Request:** "Store my document chunks with their embeddings in FalkorDB and find the 3 chunks closest to a question, plus the entities they mention."

```python
import os
from falkordb import FalkorDB
from openai import OpenAI

client = OpenAI()   # reads OPENAI_API_KEY from the environment (create it at platform.openai.com)
embed = lambda t: client.embeddings.create(model="text-embedding-3-small", input=t).data[0].embedding

g = FalkorDB(host="127.0.0.1", port=6379).select_graph("kb")
g.query("CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {dimension: 1536, similarityFunction: 'cosine'}")

g.query("CREATE (c:Chunk {id: $id, text: $text, embedding: vecf32($v)}) "
        "MERGE (e:Entity {name: $ent}) MERGE (c)-[:MENTIONS]->(e)",
        {"id": "doc1-0", "text": "Baltic Steel opened a depot in Rotterdam.", "v": embed("Baltic Steel opened a depot in Rotterdam."), "ent": "Baltic Steel"})

q = embed("Which supplier has a Dutch depot?")
rows = g.ro_query(
    "CALL db.idx.vector.queryNodes('Chunk','embedding',3,vecf32($q)) YIELD node, score "
    "MATCH (node)-[:MENTIONS]->(e:Entity) RETURN node.text, e.name, score ORDER BY score",
    {"q": q},
).result_set
```

**Result:** rows of `[chunk text, entity name, distance]`, nearest first.

## Guidelines

- The server is unauthenticated unless you configure a Redis password: bind to `127.0.0.1` or put it on a private network, never publish 6379.
- The server code is licensed under the Server Side Public License (SSPL), not an OSI open-source license; check it against your distribution plans before offering FalkorDB as a managed service.
- Graph names are Redis keys and case-sensitive. One `GRAPH.QUERY` addresses one graph; cross-graph queries are not possible.
- Use `MERGE` for idempotent ingestion and put a range index on the property you merge on, otherwise ingestion slows down with graph size.
- Vector dimensions are fixed per index; changing the embedding model means a new index and re-embedding.
- openCypher support is broad but not identical to Neo4j: test queries ported from Neo4j with `GRAPH.EXPLAIN` before relying on them. For a Neo4j-based walkthrough see the neo4j skill.
- Not the right tool for large analytical scans or documents without relations; use a document or columnar store there.
