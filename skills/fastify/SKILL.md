---
name: fastify
description: >-
  Fastify is a fast Node.js web framework for building JSON APIs, with JSON Schema validation and serialization, an encapsulated plugin system and lifecycle hooks. Use when the user wants to build or test a Fastify 5 REST API, add schema validation, JWT auth, a database plugin, CORS, hooks or error handling, or asks about Fastify project structure and plugin encapsulation.
license: Apache-2.0
compatibility: 'Node.js 20.11+ (Fastify 5; checked with 5.12.7), npm, pnpm or yarn'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/fastify/fastify
  category: development
  tags:
    - node
    - javascript
    - api
    - rest
    - plugins
---

# Fastify

## Overview

Fastify is a low-overhead Node.js web framework. Requests are validated and responses serialized through JSON Schema, and code is organized in encapsulated plugins. This skill targets Fastify 5 (Node.js 20 or newer; the examples use `import.meta.dirname`, which needs 20.11+). Fastify 5 needs a full JSON Schema object for `querystring`, `params`, `body` and responses (the shorthand without `type: 'object'` was removed), and `listen()` takes an options object, not positional arguments.

## Instructions

### Install

```bash
mkdir articles-api && cd articles-api
npm init -y
npm pkg set type=module
npm i fastify @fastify/autoload @fastify/sensible @fastify/cors @fastify/jwt fastify-plugin pg
```

### Layout

```
src/
├── app.js             # app factory (also used by tests)
├── server.js          # entry point
├── plugins/           # shared plugins, wrapped in fastify-plugin
│   ├── db.js
│   └── auth.js
└── routes/
    └── articles/
        ├── index.js   # route handlers
        └── schema.js  # JSON schemas
test/
└── articles.test.js
```

### App factory and entry point

```javascript
// src/app.js — autoload plugins, then routes under /api
import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { join } from 'node:path';

export function buildApp(opts = {}) {
  const app = Fastify({ logger: true, ...opts });

  app.register(sensible);
  app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? false });
  app.register(autoload, { dir: join(import.meta.dirname, 'plugins') });
  app.register(autoload, {
    dir: join(import.meta.dirname, 'routes'),
    options: { prefix: '/api' },
  });

  return app;
}
```

```javascript
// src/server.js
import { buildApp } from './app.js';

const app = buildApp();
try {
  await app.listen({ port: 3000, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

Bind to `127.0.0.1` for local work. Use `0.0.0.0` only inside a container where a proxy fronts the service.

### Schemas and routes

```javascript
// src/routes/articles/schema.js
export const articleSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    body: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const listArticlesSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: { 200: { type: 'array', items: articleSchema } },
};

export const createArticleSchema = {
  body: {
    type: 'object',
    required: ['title', 'body'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      body: { type: 'string' },
    },
  },
  response: { 201: articleSchema },
};
```

```javascript
// src/routes/articles/index.js
import { listArticlesSchema, createArticleSchema } from './schema.js';

export default async function articleRoutes(fastify) {
  fastify.get('/', { schema: listArticlesSchema }, async (request) => {
    const { page, limit } = request.query;   // already coerced to numbers, defaults applied
    const { rows } = await fastify.db.query(
      'SELECT * FROM articles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, (page - 1) * limit]
    );
    return rows;
  });

  fastify.get('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (request, reply) => {
    const { rows } = await fastify.db.query('SELECT * FROM articles WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.notFound();
    return rows[0];
  });

  fastify.post('/', { schema: createArticleSchema, onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { title, body } = request.body;
    const { rows } = await fastify.db.query(
      'INSERT INTO articles (title, body) VALUES ($1, $2) RETURNING *',
      [title, body]
    );
    return reply.code(201).send(rows[0]);
  });
}
```

### Plugins

```javascript
// src/plugins/db.js — pg pool shared as fastify.db
import fp from 'fastify-plugin';
import pg from 'pg';

export default fp(async function dbPlugin(fastify) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  fastify.decorate('db', pool);
  fastify.addHook('onClose', async () => { await pool.end(); });
});
```

```javascript
// src/plugins/auth.js — JWT verification as fastify.authenticate
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export default fp(async function authPlugin(fastify) {
  fastify.register(jwt, { secret: process.env.JWT_SECRET });

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.unauthorized();
    }
  });
});
```

Set `JWT_SECRET` (a random 32-byte value) in the environment; `@fastify/jwt` refuses to start without a secret.

### Hooks and error handling

```javascript
// inside buildApp(): log duration (reply.elapsedTime is built in, in milliseconds)
app.addHook('onResponse', async (request, reply) => {
  request.log.info({ ms: Number(reply.elapsedTime.toFixed(2)), status: reply.statusCode }, 'request completed');
});

// hide internals of 5xx errors, keep validation messages (statusCode 400)
app.setErrorHandler((error, request, reply) => {
  const status = error.statusCode ?? 500;
  if (status >= 500) request.log.error(error);
  reply.code(status).send({
    error: error.name,
    message: status >= 500 ? 'Internal Server Error' : error.message,
  });
});
```

### Testing

```javascript
// test/articles.test.js — run with: JWT_SECRET=test-secret node --test
import { test } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';

test('GET /api/articles returns rows', async (t) => {
  const app = buildApp({ logger: false });
  await app.ready();
  t.after(() => app.close());
  app.db.query = async () => ({ rows: [{ id: 1, title: 'Hi', body: 'x', created_at: new Date().toISOString() }] });
  const res = await app.inject({ method: 'GET', url: '/api/articles?limit=5' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json()[0].title, 'Hi');
});

test('POST without token is 401, with token 201, bad body 400', async (t) => {
  const app = buildApp({ logger: false });
  await app.ready();
  t.after(() => app.close());
  app.db.query = async (_s, [title, body]) => ({ rows: [{ id: 2, title, body }] });
  const payload = { title: 'T', body: 'B' };
  assert.strictEqual((await app.inject({ method: 'POST', url: '/api/articles', payload })).statusCode, 401);
  const token = app.jwt.sign({ sub: 'u1' });
  const ok = await app.inject({ method: 'POST', url: '/api/articles', payload, headers: { authorization: `Bearer ${token}` } });
  assert.strictEqual(ok.statusCode, 201);
  const bad = await app.inject({ method: 'POST', url: '/api/articles', payload: { title: '' }, headers: { authorization: `Bearer ${token}` } });
  assert.strictEqual(bad.statusCode, 400);
  const lim = await app.inject({ method: 'GET', url: '/api/articles?limit=1000' });
  assert.strictEqual(lim.statusCode, 400);
});
```

`app.inject` runs the request in-process without opening a port. Replacing `app.db.query` keeps the test off a real database; use a disposable Postgres for integration tests.

## Examples

### Example 1: Add a validated endpoint

**User request:** "Add POST /api/articles that requires a title up to 200 characters and a body, and only logged-in users can call it."

The agent writes `createArticleSchema` with `required: ['title', 'body']` and `additionalProperties: false`, and attaches `onRequest: [fastify.authenticate]` to the route. A call without a token returns 401, a call with `{ "title": "" }` returns 400 `body must have required property 'body'`, and a valid call returns 201 with the row. Only the properties listed in the 201 response schema are serialized.

### Example 2: Paginate a list safely

**User request:** "GET /api/articles?limit=1000 should not hit the database with 1000 rows."

The agent adds a `querystring` schema with `limit` as an integer with `maximum: 100` and `default: 20`. Fastify coerces `?page=2` to the number 2, applies defaults, and answers `?limit=1000` with 400 `querystring/limit must be <= 100` before the handler runs.

## Guidelines

- Wrap shared plugins (db, auth) in `fastify-plugin`; without it, decorators stay private to the child context and sibling routes cannot see them.
- Put response schemas on every route: they strip unlisted fields (no accidental password hashes) and speed up serialization.
- Async handlers return the value; do not also call `reply.send()`. An async hook that replies must `return reply...` so the chain stops.
- Never commit a fallback JWT secret and never use `origin: true` with CORS in production; list allowed origins in `CORS_ORIGIN`.
- Use parameterized queries (`$1`) only; never interpolate request values into SQL.
- Call `await app.close()` in tests so the pool and server shut down.
- Fastify 4 apps: upgrade notes are in the official V5 migration guide (Node 20+, full JSON schemas, no variadic `listen`).
