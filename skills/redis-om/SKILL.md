---
name: redis-om
description: >-
  Redis OM maps JavaScript or Python objects to Redis JSON documents or hashes and
  builds RediSearch indexes from the schema, so you can save, fetch and search
  entities without raw Redis commands. Use when you need to model data in Redis as
  a primary database, add full-text, tag, numeric or geo search to Redis data, or
  set up redis-om in Node.js (TypeScript) or Python (FastAPI, Pydantic).
license: Apache-2.0
compatibility: "Node.js with redis-om 0.4.x and node-redis 4.x, or Python 3.10+ with redis-om 1.x; Redis with the JSON and Search modules (Redis Stack)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/redis/redis-om-node
  tags: "redis, orm, search, json, database"
---

# Redis OM

## Overview

Redis OM is an object mapper for Redis. You define a schema (Node.js) or a model class (Python), save plain objects as RedisJSON documents or hashes, and query them through a fluent API that compiles to RediSearch (`FT.SEARCH`). It needs a server with the JSON and Search modules: Redis Stack or Redis Cloud (see the Redis 8 pitfall for Node below). A plain Redis server without those modules cannot run searches.

Versions checked on 2026-10-24: `redis-om` (npm) 0.4.7, `redis-om` (PyPI) 1.2.0.

## Instructions

### Node.js / TypeScript

```bash
npm install redis-om redis@4
docker run -d --name redis-stack -p 127.0.0.1:6379:6379 redis/redis-stack-server:7.4.0-v8
```

`redis-om` 0.4.7 depends on node-redis 4. Install `redis@4` yourself: a bare `npm install redis` now brings v6, and passing that client to a `Repository` is not the version redis-om was built for.

There is no `Client` class in 0.4: you create a node-redis client and give it to the `Repository`.

```typescript
import { createClient } from "redis";
import { Schema, Repository, EntityId } from "redis-om";

const redis = createClient({ url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" });
redis.on("error", (err) => console.error("Redis error", err));
await redis.connect();

const productSchema = new Schema("product", {
  name: { type: "string" },                    // exact match / wildcard
  description: { type: "text" },               // full-text search
  price: { type: "number", sortable: true },
  category: { type: "string[]" },              // tags
  inStock: { type: "boolean" },
  createdAt: { type: "date", sortable: true },
  location: { type: "point" },                 // { longitude, latitude }
});

const products = new Repository(productSchema, redis);
await products.createIndex();                  // safe on every start; rebuilds only if the schema changed

const keyboard = await products.save({
  name: "Wireless Keyboard",
  description: "Ergonomic bluetooth keyboard with backlight and long battery life",
  price: 79.99,
  category: ["electronics", "peripherals"],
  inStock: true,
  createdAt: new Date(),
  location: { longitude: -122.4194, latitude: 37.7749 },
});
const id = keyboard[EntityId];                 // generated ULID, stored under a Symbol
const same = await products.fetch(id);
```

Schema types are `string`, `text`, `number`, `boolean`, `date`, `point`, `string[]`, `number[]`. Data defaults to JSON; pass `{ dataStructure: "HASH" }` as the third argument for hashes (flat, no `number[]`).

Queries (all verified against Redis Stack 7.4):

```typescript
const hits = await products.search()
  .where("description").matches("ergonomic bluetooth")
  .and("inStock").is.true()
  .and("price").is.between(50, 150)
  .sortBy("price", "ASC")
  .page(0, 20);                                // offset, count

const tagged = await products.search().where("category").contains("electronics").return.all();
const nearby = await products.search()
  .where("location").inRadius((c) => c.origin(-122.4194, 37.7749).radius(10).miles)
  .return.all();
const total = await products.search().where("inStock").true().return.count();
```

Other repository methods: `save(customId, entity)`, `remove(id)`, `expire(id, seconds)`, `dropIndex()`, `search().return.first()`.

### Python

```bash
pip install redis-om
```

In 1.x a model must be declared with `index=True`, otherwise `save()` raises `RedisModelError: You cannot create a key on a model that is not indexed`.

```python
import os
from redis_om import JsonModel, Field, Migrator, get_redis_connection

redis = get_redis_connection(url=os.environ.get("REDIS_URL", "redis://127.0.0.1:6379"))

class Product(JsonModel, index=True):
    name: str = Field(index=True)
    description: str = Field(index=True, full_text_search=True)
    price: float = Field(index=True, sortable=True)
    category: str = Field(index=True)
    in_stock: bool = Field(index=True, default=True)

    class Meta:
        database = redis

Migrator().run()                               # creates or updates the indexes

mouse = Product(name="Wireless Mouse", description="Ergonomic wireless mouse",
                price=49.99, category="electronics")
mouse.save()                                   # mouse.pk is the generated ULID

cheap = Product.find(
    (Product.category == "electronics") & (Product.price < 100) & (Product.in_stock == True)
).sort_by("price").all()
ergonomic = Product.find(Product.description % "ergonomic").all()   # full-text
same = Product.get(mouse.pk)
```

Use `HashModel` instead of `JsonModel` for hash storage; the same code works (checked). The package also exports `VectorFieldOptions` for vector fields in Python models.

## Examples

### Example 1: Product catalog search API

**User request:** "Store my product catalog in Redis and let the storefront search by words in the description, a price range and in-stock only."

**Actions:** install `redis-om` and `redis@4`, define the `product` schema above, call `createIndex()` at startup, expose `products.search()` behind a route that takes `q`, `min`, `max`.

**Result:** a query for "ergonomic bluetooth" with price 50-150 returns the keyboard saved above (1 hit), sorted by price.

### Example 2: Session-like records that expire

**User request:** "Save short-lived login challenges in Redis and delete them after 10 minutes."

**Actions:** `const c = await challenges.save({ email: "dana@store.test", code: "482913" })`, then `await challenges.expire(c[EntityId], 600)`.

**Result:** Redis deletes the entity itself after 600 seconds; no cleanup job.

## Guidelines

- Node pitfall: with `redis-om` 0.4.7, `createIndex()` fails with `ErrorReply: product:index: no such index` on Redis 8.x, because redis-om only recognises the older "Unknown index name" message when the index does not exist yet. Use Redis Stack 7.x (the `redis/redis-stack-server` image) for the Node client. The Python client was checked only against the Redis Stack image.
- redis-om for Node has no vector field type and no `.nearest()`. For vector similarity from Node use raw `FT.SEARCH` through node-redis; in Python see `VectorFieldOptions`.
- `string` fields match exact values and wildcards; only `text` fields support `.matches()` full-text search. Choose per field, as changing it means rebuilding the index.
- `sortable` adds index overhead; mark only fields you sort by.
- `fetch()` of an unknown id returns an empty entity, not an error. Check a field before trusting the result.
- Page large result sets with `.page(offset, count)` instead of `.return.all()`.
- Bind Redis to 127.0.0.1 or require a password; the Docker command above publishes only on loopback. Keep `REDIS_URL` in an environment variable.
- Redis OM is not a replacement for relational constraints: no joins or transactions across entities.
