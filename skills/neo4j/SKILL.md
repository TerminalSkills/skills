---
name: neo4j
description: >-
  Neo4j is a graph database that stores nodes and relationships and is queried with Cypher. Use when a user asks to model connected data, write Cypher queries, find shortest paths or recommendations, create indexes and constraints, run Neo4j in Docker, or connect from Node.js or Python with the official drivers. Covers social graphs, fraud detection, knowledge graphs and vector search.
license: Apache-2.0
compatibility: 'Neo4j 2026.x or 5.26 LTS (Docker or Neo4j Desktop), neo4j-driver 6 (Node.js 18+), neo4j Python driver 6 (Python 3.10+)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - neo4j
    - graph-database
    - cypher
    - nodejs
    - relationships
  repository: https://github.com/neo4j/neo4j
---

# Neo4j

## Overview
Neo4j stores data as nodes (with labels and properties) and typed, directed relationships, which makes multi-hop questions (friends of friends, who bought what others bought, which accounts share a device) cheap compared with SQL joins. Releases now use calendar versions (2026.10 at the time of writing) next to the 5.26 long-term line; Docker tags `neo4j:latest`, `neo4j:2026.10.1` and `neo4j:5.26` exist. Queries run in Cypher; examples below were run against Neo4j 2026.10.1 Community with `neo4j-driver` 6.2 and the Python `neo4j` 6.4 driver.

## Instructions

### Step 1: Run Neo4j locally
```bash
export NEO4J_PASSWORD="$(openssl rand -base64 18)"   # keep it in your secret store
docker run -d --name neo4j \
  -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
  -v neo4j_data:/data \
  -e NEO4J_AUTH="neo4j/${NEO4J_PASSWORD}" \
  neo4j:2026.10.1
```
Browser UI at http://localhost:7474, Bolt at `neo4j://localhost:7687`. The password must be at least 8 characters and is applied only on the first start of an empty `/data` volume. Publishing ports on `127.0.0.1` keeps the database off the network. Run queries from a shell with `docker exec -it neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD"`.

Drivers:
```bash
npm install neo4j-driver
pip install neo4j
```

### Step 2: Create data
Use `MERGE` for anything that may already exist; `CREATE` always makes a new node.
```cypher
CREATE (alice:Person {name: 'Alice', email: 'alice@northwind.io', age: 30})
CREATE (bob:Person {name: 'Bob', email: 'bob@northwind.io', age: 28})
CREATE (neo:Technology {name: 'Neo4j', category: 'Database'})
RETURN alice, bob, neo;

MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[:KNOWS {since: 2024}]->(b);

MATCH (a:Person {name: 'Alice'}), (t:Technology {name: 'Neo4j'})
CREATE (a)-[:USES {skill_level: 'expert'}]->(t);
```
Each `MATCH ... CREATE` makes one relationship per matched pair; if `MATCH` finds nothing, nothing is created and no error is raised.

### Step 3: Query
```cypher
// Friends of friends
MATCH (p:Person {name: 'Alice'})-[:KNOWS]->()-[:KNOWS]->(fof)
WHERE fof <> p
RETURN DISTINCT fof.name;

// Shortest path, any direction, at most 6 hops
MATCH path = shortestPath((a:Person {name: 'Alice'})-[:KNOWS*..6]-(b:Person {name: 'Charlie'}))
RETURN path, length(path);

// Same with the newer quantified-path syntax (Cypher 25 / GQL)
MATCH path = SHORTEST 1 (a:Person {name: 'Alice'})-[:KNOWS]-+(b:Person {name: 'Charlie'})
RETURN length(path);

// Filter on a relationship property and collect
MATCH (p:Person)-[r:USES]->(t:Technology)
WHERE r.skill_level = 'expert'
RETURN p.name, collect(t.name) AS technologies;

// Aggregation
MATCH (p:Person)-[:KNOWS]->(friend)
RETURN p.name, count(friend) AS friend_count
ORDER BY friend_count DESC LIMIT 10;
```
Never build Cypher by string concatenation. Pass values as parameters (`$name`); this prevents Cypher injection and lets Neo4j reuse the query plan. Labels, relationship types and property keys cannot be parameters.

### Step 4: Indexes and constraints
Create them before loading data at scale; a `MERGE` or `MATCH` on an unindexed property scans every node with the label.
```cypher
CREATE CONSTRAINT person_email IF NOT EXISTS
  FOR (p:Person) REQUIRE p.email IS UNIQUE;          // also creates a backing index

CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name);

CREATE INDEX order_status_date IF NOT EXISTS
  FOR (o:Order) ON (o.status, o.created_at);          // composite

CREATE FULLTEXT INDEX person_search IF NOT EXISTS
  FOR (p:Person) ON EACH [p.name, p.bio];

CALL db.index.fulltext.queryNodes('person_search', 'Alice') YIELD node, score
RETURN node.name, score;

SHOW INDEXES YIELD name, type, state;
```
Indexes populate in the background; check `state` is `ONLINE` before relying on them.

Vector index for embeddings (set `vector.dimensions` to your model's size, for example 1536):
```cypher
CREATE VECTOR INDEX doc_embeddings IF NOT EXISTS
  FOR (d:Doc) ON (d.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CALL db.index.vector.queryNodes('doc_embeddings', 5, $queryEmbedding)
YIELD node, score RETURN node.title, score;
```

### Step 5: Node.js driver
Create one driver per application and reuse it; sessions are cheap, drivers are not. `executeQuery` handles sessions, transactions and retries.
```javascript
// db.js
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'neo4j://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD)
);

async function findFriends(name) {
  const { records } = await driver.executeQuery(
    'MATCH (p:Person {name: $name})-[:KNOWS]->(friend) RETURN friend.name AS name',
    { name },
    { database: 'neo4j', routing: neo4j.routing.READ }
  );
  return records.map(r => r.get('name'));
}

async function createFriendship(person1, person2) {
  await driver.executeQuery(
    `MERGE (a:Person {name: $p1})
     MERGE (b:Person {name: $p2})
     MERGE (a)-[:KNOWS]->(b)`,
    { p1: person1, p2: person2 },
    { database: 'neo4j' }
  );
}

module.exports = { driver, findFriends, createFriendship };
// On shutdown: await driver.close()
```
For several statements in one transaction use `const session = driver.session({ database: 'neo4j' })` and `await session.executeWrite(tx => ...)`, closing the session in `finally`. Integers returned by Cypher are `neo4j.Integer` objects; convert with `.toNumber()`, or create the driver with `{ disableLosslessIntegers: true }`.

### Step 6: Python driver
```python
import os
from neo4j import GraphDatabase

URI = os.environ.get("NEO4J_URI", "neo4j://localhost:7687")
AUTH = (os.environ.get("NEO4J_USER", "neo4j"), os.environ["NEO4J_PASSWORD"])

with GraphDatabase.driver(URI, auth=AUTH) as driver:
    driver.verify_connectivity()
    records, summary, keys = driver.execute_query(
        """
        MATCH (p:Person {name: $name})-[:KNOWS]->(friend)-[:KNOWS]->(rec)
        WHERE NOT (p)-[:KNOWS]->(rec) AND rec <> p
        RETURN rec.name AS name, count(*) AS mutual
        ORDER BY mutual DESC LIMIT 5
        """,
        name="Alice", database_="neo4j", routing_="r",
    )
    print([r.data() for r in records])   # [{'name': 'Charlie', 'mutual': 1}]
```
Query parameters are keyword arguments; options carry a trailing underscore (`database_`, `routing_`). For explicit transactions use `with driver.session(database="neo4j") as session: session.execute_write(fn)`.

### Step 7: Model the graph
- Nouns become labels (`Person`, `Product`, `Order`); verbs become relationship types (`PURCHASED`, `KNOWS`, `REVIEWED`); adjectives become properties.
- Every relationship has a direction when stored, but queries can ignore it with `-[:KNOWS]-`.
- Put weights, timestamps and metadata on the relationship.
- Avoid super nodes (millions of relationships on one node): add an intermediate node, such as a day or a bucket.
- Model an event with several participants (a purchase with buyer, seller, items) as its own node.

## Examples

### Example 1: Friend recommendations
Request: "Suggest people Alice should connect with, based on mutual friends."
Run the Step 6 script (or the same Cypher in cypher-shell) against the data from Step 2 plus a `Charlie` that Bob knows. Result: one row, `Charlie` with `mutual` 1. Rows are ordered by mutual-friend count, so the best candidate comes first.

### Example 2: Fast lookups and no duplicates when importing users
Request: "I import 2 million customers nightly and the job is slow and creates duplicates."
Add the uniqueness constraint from Step 4 (`REQUIRE c.customerId IS UNIQUE`), then send rows in batches of a few thousand through one parameterised statement: `UNWIND $rows AS row MERGE (c:Customer {customerId: row.id}) SET c.name = row.name`. The constraint prevents duplicates and gives `MERGE` an index to seek, so the import stops scanning the label.

## Guidelines
- Never bind the Bolt or HTTP ports to a public interface with a default or weak password; the Docker example binds to loopback.
- Put the password in an environment variable, not in code.
- `neo4j://` is the routing scheme (works for single servers and clusters); `bolt://` connects to one fixed server. Use `neo4j+s://` for TLS (Aura).
- Community Edition has one user database; multiple databases, role-based access control and clustering need Enterprise or Aura.
- Variable-length patterns without an upper bound (`*`) can explode on dense graphs. Always cap them and use `EXPLAIN` or `PROFILE` before running on production data.
- `DETACH DELETE` removes nodes with their relationships. Confirm with a `MATCH ... RETURN count(*)` first, since there is no undo.
- Use Neo4j for relationship-heavy queries; for plain tabular data and reporting a relational database is simpler.
