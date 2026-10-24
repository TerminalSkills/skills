---
name: mongodb
description: >-
  Assists with designing document schemas, building aggregation pipelines, managing indexes,
  and operating MongoDB clusters. Use when working with flexible schemas, nested documents,
  horizontal scaling, Atlas Search, or vector search for AI applications. Trigger words:
  mongodb, mongo, document database, aggregation, atlas, nosql.
license: Apache-2.0
compatibility: "MongoDB 7.0+ (checked on 8.2.6); mongosh for the shell examples"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/mongodb/mongo
  category: data-ai
  tags: ["mongodb", "nosql", "document-database", "aggregation", "atlas"]
---

# MongoDB

## Overview

MongoDB is a document database that stores JSON-like (BSON) documents with flexible schemas, nested objects, and arrays. It provides a rich query language, aggregation pipelines for data transformation, multiple index types (text, TTL, wildcard, geospatial), ACID transactions, and horizontal scaling via sharding. MongoDB Atlas adds managed cloud hosting with full-text search (`$search`) and vector search (`$vectorSearch`); those two stages are Atlas features and are not part of a plain `mongod`.

## Instructions

- When designing schemas, embed data that is read together and reference data that is shared across documents, optimizing for read patterns rather than normalization since MongoDB penalizes joins (`$lookup`).
- When querying, use dot notation for nested fields, array operators (`$in`, `$elemMatch`, `$all`) for array queries, and projection to return only needed fields.
- When transforming data, use aggregation pipelines with stages like `$match`, `$group`, `$project`, `$lookup`, and `$unwind` rather than pulling data to application code for processing.
- When creating indexes, add indexes for every production query pattern, use `explain("executionStats")` to verify usage, and choose TTL indexes for auto-expiring data like sessions and logs.
- When enforcing data integrity, use JSON Schema validation on collections (`db.createCollection(name, { validator: { $jsonSchema: {...} } })`; a violating insert fails with `DocumentValidationFailure`), and use multi-document transactions only when atomicity across documents is required. Transactions need a replica set or sharded cluster, not a standalone server. Since MongoDB 5.0 the implicit write concern is `majority` for most deployments, so you only set it explicitly to override a changed default.
- When scaling, choose shard keys with high cardinality and even distribution, set up replica sets for high availability, and configure read preferences based on consistency requirements. A shard key can be changed later with `reshardCollection` (MongoDB 5.0+), which rewrites the collection in the background, so it is possible but expensive.
- Store money as `Decimal128` (`NumberDecimal("89.90")` in mongosh), not doubles.

```bash
mongosh "mongodb://localhost:27017/shop" --eval 'db.products.getIndexes()'
```

A multi-document transaction in mongosh (replica set required; verified on 8.2.6):

```javascript
const session = db.getMongo().startSession()
const shop = session.getDatabase("shop")
session.startTransaction({ writeConcern: { w: "majority" } })
shop.orders.insertOne({ sku: "KB-1", qty: 1 })
shop.products.updateOne({ sku: "KB-1" }, { $inc: { stock: -1 } })
session.commitTransaction()   // or session.abortTransaction()
```

## Examples

### Example 1: Build an e-commerce product catalog

**User request:** "Design a MongoDB schema for products with variants, reviews, and categories"

**Actions:**
1. Embed variants and pricing as arrays within the product document for single-query reads
2. Reference categories as ObjectIds for shared data and embed review summaries
3. Create compound indexes for filtering by category, price range, and rating
4. Build aggregation pipeline for faceted search with `$facet` and `$bucket`

```javascript
// mongosh: validated collection, compound index, facets
db.createCollection("products", { validator: { $jsonSchema: {
  bsonType: "object", required: ["sku", "price"],
  properties: { sku: { bsonType: "string" }, price: { bsonType: "decimal" } } } } })
db.products.createIndex({ category: 1, price: 1, rating: -1 })
db.products.find({ category: "keyboards", price: { $lt: NumberDecimal("100") } })
  .explain("executionStats")       // winning plan should be IXSCAN, not COLLSCAN
db.products.aggregate([{ $facet: {
  byCategory: [{ $group: { _id: "$category", n: { $sum: 1 } } }],
  priceBands: [{ $bucket: { groupBy: "$price",
    boundaries: [NumberDecimal("0"), NumberDecimal("50"), NumberDecimal("100"), NumberDecimal("200")], default: "other",
    output: { n: { $sum: 1 } } } }]
} }])
```

**Output:** A product catalog with embedded variants, referenced categories, faceted search, and optimized indexes.

### Example 2: Set up full-text search with Atlas Search

**User request:** "Add search functionality to my app using MongoDB Atlas Search"

**Actions:**
1. Create an Atlas Search index with analyzers for the title, description, and tags fields
2. Build a `$search` aggregation stage with fuzzy matching and highlighting
3. Add autocomplete search with the `autocomplete` data type
4. Implement relevance scoring and boosting for title matches

**Note:** `$search` only runs on Atlas (or a deployment with Atlas Search enabled); on a local `mongod` use a `text` index and `$text` instead.

**Output:** A search feature with fuzzy matching, autocomplete, relevance ranking, and highlighting.

## Guidelines

- Embed when data is read together; reference when data is shared across documents.
- Design schemas for your query patterns, not for normalization.
- Create indexes for every production query pattern and verify with `explain()`.
- Use TTL indexes for session data, logs, and temporary documents for automatic cleanup.
- Use aggregation pipelines instead of pulling data to application code for transformation.
- Rely on the default `majority` write concern for data that must survive failover; never lower it for critical writes.
- Choose shard keys carefully: resharding with `reshardCollection` works (5.0+) but moves all the data.
- Keep transactions short; they need a replica set and hold resources until commit.
- Do not expose `mongod` on a public interface without authentication and TLS.
