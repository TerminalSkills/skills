---
name: neo4j
description: |
  Neo4j is the leading graph database for connected data. Learn Cypher query language,
  node and relationship modeling, graph algorithms, and integration with Node.js
  using the official neo4j-driver.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: databases
  tags:
    - neo4j
    - graph-database
    - cypher
    - nodejs
    - relationships
---

# Neo4j

Neo4j stores data as nodes and relationships (edges), making it ideal for social networks, recommendation engines, fraud detection, and knowledge graphs.

## Installation

```bash
# Docker (recommended)
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:5

# Access browser UI at http://localhost:7474
# Bolt protocol at bolt://localhost:7687

# Node.js driver
npm install neo4j-driver

# Python driver
pip install neo4j
```

## Cypher Basics

```cypher
// create-nodes.cypher: Create nodes with labels and properties
CREATE (alice:Person {name: 'Alice', email: 'alice@example.com', age: 30})
CREATE (bob:Person {name: 'Bob', email: 'bob@example.com', age: 28})
CREATE (graphDb:Technology {name: 'Neo4j', category: 'Database'})
RETURN alice, bob, graphDb;
```

```cypher
// create-relationships.cypher: Connect nodes with typed relationships
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[:KNOWS {since: 2024}]->(b)
RETURN a, b;

MATCH (a:Person {name: 'Alice'}), (t:Technology {name: 'Neo4j'})
CREATE (a)-[:USES {skill_level: 'expert'}]->(t)
RETURN a, t;
```

## Querying

```cypher
// queries.cypher: Common query patterns
// Find friends of friends
MATCH (p:Person {name: 'Alice'})-[:KNOWS]->()-[:KNOWS]->(fof)
WHERE fof <> p
RETURN DISTINCT fof.name;

// Shortest path between two people
MATCH path = shortestPath(
  (a:Person {name: 'Alice'})-[:KNOWS*..6]-(b:Person {name: 'Charlie'})
)
RETURN path, length(path);

// Pattern matching with filtering
MATCH (p:Person)-[r:USES]->(t:Technology)
WHERE r.skill_level = 'expert'
RETURN p.name, collect(t.name) AS technologies;

// Aggregation
MATCH (p:Person)-[:KNOWS]->(friend)
RETURN p.name, count(friend) AS friend_count
ORDER BY friend_count DESC
LIMIT 10;
```

## Indexes and Constraints

```cypher
// indexes.cypher: Create indexes and constraints for performance
CREATE CONSTRAINT person_email IF NOT EXISTS
  FOR (p:Person) REQUIRE p.email IS UNIQUE;

CREATE INDEX person_name IF NOT EXISTS
  FOR (p:Person) ON (p.name);

// Composite index
CREATE INDEX order_status_date IF NOT EXISTS
  FOR (o:Order) ON (o.status, o.created_at);

// Full-text index
CREATE FULLTEXT INDEX person_search IF NOT EXISTS
  FOR (p:Person) ON EACH [p.name, p.bio];

CALL db.index.fulltext.queryNodes('person_search', 'Alice') YIELD node, score
RETURN node.name, score;
```

## Node.js Driver

```javascript
// db.js: Neo4j client with official Node.js driver
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password123')
);

async function findFriends(name) {
  const session = driver.session({ database: 'neo4j' });
  try {
    const result = await session.executeRead(tx =>
      tx.run(
        'MATCH (p:Person {name: $name})-[:KNOWS]->(friend) RETURN friend.name AS name',
        { name }
      )
    );
    return result.records.map(r => r.get('name'));
  } finally {
    await session.close();
  }
}

async function createFriendship(person1, person2) {
  const session = driver.session({ database: 'neo4j' });
  try {
    await session.executeWrite(tx =>
      tx.run(
        `MERGE (a:Person {name: $p1})
         MERGE (b:Person {name: $p2})
         MERGE (a)-[:KNOWS]->(b)`,
        { p1: person1, p2: person2 }
      )
    );
  } finally {
    await session.close();
  }
}

// Cleanup on exit
process.on('exit', () => driver.close());

module.exports = { findFriends, createFriendship };
```

## Python Driver

```python
# app.py: Neo4j with official Python driver
from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password123"))

def find_friends(name):
    with driver.session() as session:
        result = session.run(
            "MATCH (p:Person {name: $name})-[:KNOWS]->(f) RETURN f.name AS name",
            name=name,
        )
        return [record["name"] for record in result]

def recommend_friends(name):
    with driver.session() as session:
        result = session.run("""
            MATCH (p:Person {name: $name})-[:KNOWS]->(friend)-[:KNOWS]->(rec)
            WHERE NOT (p)-[:KNOWS]->(rec) AND rec <> p
            RETURN rec.name AS name, count(*) AS mutual
            ORDER BY mutual DESC LIMIT 5
        """, name=name)
        return [dict(r) for r in result]

driver.close()
```

## Graph Data Modeling Tips

```text
Modeling Guidelines:
- Nouns → Node labels (Person, Product, Order)
- Verbs → Relationship types (PURCHASED, KNOWS, REVIEWED)
- Adjectives → Properties on nodes or relationships
- Always direction: (a)-[:KNOWS]->(b), query can ignore direction with -[:KNOWS]-
- Avoid super-nodes (millions of relationships); use intermediate nodes
- Use relationship properties for weight, timestamp, metadata
```
