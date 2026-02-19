---
name: fastify
description: |
  Fastify is a high-performance Node.js web framework focused on developer experience
  and low overhead. It features JSON Schema validation, a powerful plugin system,
  lifecycle hooks, and automatic serialization for blazing-fast APIs.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - node
    - javascript
    - api
    - rest
    - performance
    - plugins
---

# Fastify

Fastify is one of the fastest Node.js web frameworks. It validates requests via JSON Schema, serializes responses automatically, and organizes code through an encapsulated plugin system.

## Installation

```bash
# Create Fastify project
npm init -y
npm i fastify @fastify/autoload @fastify/sensible @fastify/cors @fastify/jwt
```

## App Setup

```javascript
// src/app.js — application factory with autoload
import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { join } from 'node:path';

export function buildApp(opts = {}) {
  const app = Fastify({ logger: true, ...opts });
  app.register(sensible);
  app.register(cors, { origin: true });
  app.register(autoload, { dir: join(import.meta.dirname, 'plugins') });
  app.register(autoload, { dir: join(import.meta.dirname, 'routes'), options: { prefix: '/api' } });
  return app;
}
```

## Routes with Schema Validation

```javascript
// src/routes/articles/schema.js — JSON Schema definitions
export const createArticleSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    properties: {
      title: { type: 'string', maxLength: 200 },
      body: { type: 'string' },
    },
  },
  response: { 201: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' } } } },
};
```

```javascript
// src/routes/articles/index.js — article CRUD routes
import { createArticleSchema } from './schema.js';

export default async function articleRoutes(fastify) {
  fastify.get('/', async (request) => {
    const { page = 1, limit = 20 } = request.query;
    const { rows } = await fastify.db.query(
      'SELECT * FROM articles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, (page - 1) * limit]
    );
    return rows;
  });

  fastify.post('/', { schema: createArticleSchema, preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { title, body } = request.body;
    const { rows } = await fastify.db.query(
      'INSERT INTO articles (title, body) VALUES ($1, $2) RETURNING *', [title, body]
    );
    return reply.code(201).send(rows[0]);
  });
}
```

## Plugins

```javascript
// src/plugins/db.js — database plugin with pg
import fp from 'fastify-plugin';
import pg from 'pg';

export default fp(async function dbPlugin(fastify) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  fastify.decorate('db', pool);
  fastify.addHook('onClose', () => pool.end());
});
```

```javascript
// src/plugins/auth.js — JWT auth plugin
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export default fp(async function authPlugin(fastify) {
  fastify.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret' });
  fastify.decorate('authenticate', async function (request, reply) {
    try { await request.jwtVerify(); }
    catch (err) { reply.unauthorized(); }
  });
});
```

## Hooks

```javascript
// src/app.js — lifecycle hooks (add inside buildApp)
app.addHook('onRequest', async (request) => {
  request.startTime = process.hrtime.bigint();
});

app.addHook('onResponse', async (request, reply) => {
  const ms = Number(process.hrtime.bigint() - request.startTime) / 1e6;
  request.log.info({ duration: `${ms.toFixed(2)}ms`, status: reply.statusCode }, 'completed');
});
```

## Testing

```javascript
// src/test/articles.test.js — testing with built-in inject
import { test } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../app.js';

test('GET /api/articles returns 200', async () => {
  const app = buildApp({ logger: false });
  const response = await app.inject({ method: 'GET', url: '/api/articles' });
  assert.strictEqual(response.statusCode, 200);
  await app.close();
});
```

## Key Patterns

- Use `fastify-plugin` (`fp`) for plugins that should share the same encapsulation context
- Use JSON Schema for validation — it also generates automatic serialization for speed
- Decorate the fastify instance (`fastify.decorate`) for shared services (db, cache)
- Fastify is async-first: return values from handlers instead of calling `reply.send()`
