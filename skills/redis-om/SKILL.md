---
name: redis-om
description: >-
   You are an expert in Redis OM (Object Mapping), the high-level client for
  working with Redis as a primary database. You help developers define
  schemas, store JSON documents, perform full-text search, vector similarity
  search, and build real-time applications — using Redis Stack's JSON, Search,
  and Vector capabilities through an ORM-like interface instead of raw
  commands.
category: Backend Development
tags: [redis, orm, search, json, vector, caching, database]
version: 1.0.0
author: terminal-skills
---

# Redis OM — Object Mapping for Redis

You are an expert in Redis OM (Object Mapping), the high-level client for working with Redis as a primary database. You help developers define schemas, store JSON documents, perform full-text search, vector similarity search, and build real-time applications — using Redis Stack's JSON, Search, and Vector capabilities through an ORM-like interface instead of raw commands.

## Core Capabilities

### Schema and Repository

```typescript
import { Client, Schema, Repository, EntityId } from "redis-om";

const client = await new Client().open(process.env.REDIS_URL);

// Define schema
const productSchema = new Schema("product", {
  name: { type: "string" },
  description: { type: "text" },          // Full-text searchable
  price: { type: "number", sortable: true },
  category: { type: "string[]" },         // Array of tags
  inStock: { type: "boolean" },
  embedding: { type: "number[]" },        // Vector for similarity search
  createdAt: { type: "date", sortable: true },
  location: { type: "point" },            // Geo coordinates
});

const productRepo = new Repository(productSchema, client);

// Create index (run once)
await productRepo.createIndex();

// CRUD operations
const product = await productRepo.save({
  name: "Wireless Keyboard",
  description: "Ergonomic bluetooth keyboard with backlight and long battery life",
  price: 79.99,
  category: ["electronics", "peripherals"],
  inStock: true,
  embedding: await getEmbedding("wireless keyboard ergonomic"),  // 1536-dim vector
  createdAt: new Date(),
  location: { longitude: -122.4194, latitude: 37.7749 },
});

const id = product[EntityId];              // Auto-generated ULID
const fetched = await productRepo.fetch(id);
```

### Search and Queries

```typescript
// Full-text search
const results = await productRepo.search()
  .where("description").matches("ergonomic bluetooth")
  .and("inStock").is.true()
  .and("price").is.between(50, 150)
  .sortBy("price", "ASC")
  .page(0, 20)
  .return.all();

// Tag filtering
const electronics = await productRepo.search()
  .where("category").contains("electronics")
  .return.all();

// Geo search — products near San Francisco
const nearby = await productRepo.search()
  .where("location").inRadius(
    (circle) => circle.origin(-122.4194, 37.7749).radius(10).miles
  )
  .return.all();

// Vector similarity search (semantic search)
const queryEmbedding = await getEmbedding("comfortable typing experience");
const similar = await productRepo.search()
  .where("embedding").nearest(queryEmbedding, 10)  // Top 10 nearest
  .return.all();

// Count
const count = await productRepo.search()
  .where("inStock").is.true()
  .return.count();
```

### Python

```python
from redis_om import HashModel, Field, Migrator
from redis_om import get_redis_connection

redis = get_redis_connection(url="redis://localhost:6379")

class Product(HashModel):
    name: str = Field(index=True)
    description: str = Field(index=True, full_text_search=True)
    price: float = Field(index=True, sortable=True)
    category: str = Field(index=True)
    in_stock: bool = Field(index=True, default=True)

    class Meta:
        database = redis

Migrator().run()                           # Create indexes

# Save
product = Product(name="Wireless Mouse", description="Ergonomic wireless mouse", price=49.99, category="electronics")
product.save()

# Query
results = Product.find(
    (Product.category == "electronics") &
    (Product.price < 100) &
    (Product.in_stock == True)
).sort_by("price").all()
```

## Installation

```bash
# TypeScript
npm install redis-om

# Python
pip install redis-om

# Redis Stack (includes JSON + Search + Vector)
docker run -p 6379:6379 redis/redis-stack:latest
```

## Best Practices

1. **Redis Stack required** — Redis OM needs Redis Stack (JSON + Search modules); regular Redis won't work
2. **Create index once** — Call `createIndex()` on startup or migration; indexes enable all search features
3. **Full-text vs exact** — Use `text` type for full-text search, `string` for exact match/filtering
4. **Vector search** — Store embeddings as `number[]`; query with `.nearest()` for semantic similarity
5. **Sortable fields** — Mark fields as `sortable: true` to enable `.sortBy()`; adds index overhead
6. **Pagination** — Use `.page(offset, count)` for large result sets; don't fetch all at once
7. **Geo queries** — Use `point` type for location-based search; radius queries built-in
8. **Performance** — Sub-millisecond reads/writes; Redis OM adds minimal overhead over raw commands
