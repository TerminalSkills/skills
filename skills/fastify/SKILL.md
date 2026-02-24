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
  category: development
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
mkdir my-api && cd my-api
npm init -y
npm i fastify @fastify/autoload @fastify/sensible @fastify/cors @fastify/jwt
```

## Project Structure

```
# Recommended Fastify project layout
src/
├── app.js             # App factory
├── server.js          # Entry point
├── plugins/           # Shared plugins (db, auth)
│   ├── db.js
│   └── auth.js
├── routes/            # Route modules
│   ├── articles/
│   │   ├── index.js   # Route handler
│   │   └── schema.js  # JSON schemas
│   └── health.js
└── test/
    └── articles.test.js
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

```javascript
// src/server.js — start the server
import { buildApp } from './app.js';

const app = buildApp();
app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
```

## Routes with Schema Validation

```javascript
// src/routes/articles/schema.js — JSON Schema definitions
export const articleSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    body: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const createArticleSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    properties: {
      title: { type: 'string', maxLength: 200 },
      body: { type: 'string' },
    },
  },
  response: { 201: articleSchema },
};
```

```javascript
// src/routes/articles/index.js — article CRUD routes
import { createArticleSchema } from './schema.js';

export default async function articleRoutes(fastify) {
  fastify.get('/', async (request) => {
    const { page = 1, limit = 20 } = request.query;
    const offset = (page - 1) * limit;
    const { rows } = await fastify.db.query(
      'SELECT * FROM articles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return rows;
  });

  fastify.get('/:id', async (request, reply) => {
    const { rows } = await fastify.db.query('SELECT * FROM articles WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.notFound();
    return rows[0];
  });

  fastify.post('/', { schema: createArticleSchema, preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { title, body } = request.body;
    const { rows } = await fastify.db.query(
      'INSERT INTO articles (title, body) VALUES ($1, $2) RETURNING *',
      [title, body]
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
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.unauthorized();
    }
  });
});
```

## Hooks

```javascript
// src/app.js — lifecycle hooks example (add inside buildApp)
app.addHook('onRequest', async (request) => {
  request.startTime = process.hrtime.bigint();
});

app.addHook('onResponse', async (request, reply) => {
  const duration = Number(process.hrtime.bigint() - request.startTime) / 1e6;
  request.log.info({ duration: `${duration.toFixed(2)}ms`, status: reply.statusCode }, 'request completed');
});
```

## Error Handling

```javascript
// src/app.js — custom error handler (add inside buildApp)
app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const status = error.statusCode || 500;
  reply.code(status).send({
    error: error.name,
    message: status === 500 ? 'Internal Server Error' : error.message,
  });
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
- Use `@fastify/autoload` to auto-register plugins and routes from directories
- Decorate the fastify instance (`fastify.decorate`) for shared services (db, cache)
- Use `@fastify/sensible` for `.notFound()`, `.unauthorized()`, etc. helpers
- Fastify is async-first: return values from handlers instead of calling `reply.send()`
