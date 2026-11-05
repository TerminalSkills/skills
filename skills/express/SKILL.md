---
name: express
description: >-
  Express is the minimal web framework for Node.js: routes, middleware, a
  Router for grouping endpoints, and helpers like res.json. Use when a user
  asks to "build a REST API with Express", "add a route or middleware", "parse
  JSON bodies", "handle errors in Express", "serve static files", "write a
  catch-all route", or "upgrade from Express 4 to 5". Targets Express 5, where
  async handler errors reach the error middleware and route patterns changed.
license: Apache-2.0
compatibility: "Node.js 18+ (Express 5.x), npm"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "nodejs, express, rest-api, middleware, http-server"
  repository: https://github.com/expressjs/express
---

# Express — minimal web framework for Node.js

## Overview

Express wraps Node's HTTP server with a routing table and a chain of middleware functions `(req, res, next)`. The current major version is 5 (5.3.0 at the time of writing, `latest` on npm, requires Node.js 18+). Version 5 differs from the 4.x code found in most tutorials in ways that break copy-pasted snippets: wildcard route syntax, query-string parsing, async error handling and several removed methods. This skill is written for 5.x and flags the differences.

Express does not validate input, authenticate, or document the API; it relies on middleware packages and your own code for those.

## Instructions

### Install and start a server

```bash
mkdir inventory-api && cd inventory-api
npm init -y
npm install express
npm pkg set type=module
```

```javascript
// server.js
import express from 'express';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, '127.0.0.1', (err) => {
  if (err) throw err;
  console.log(`listening on http://127.0.0.1:${server.address().port}`);
});
```

Run it with `node server.js`. In Express 5 the `app.listen` callback receives an error argument, so a port already in use (`EADDRINUSE`) arrives there instead of being thrown elsewhere; port `0` picks a free port. Bind to `127.0.0.1` unless the process must accept outside traffic.

### Routes, parameters, query strings

```javascript
const books = new Map([[1, { id: 1, title: 'Dune' }]]);   // in-memory stand-in for a database
const findBook = async (id) => books.get(id);
const save = (data) => {
  const book = { id: books.size + 1, title: data.title };
  books.set(book.id, book);
  return book;
};

app.get('/books/:id', async (req, res) => {
  const book = await findBook(Number(req.params.id));
  if (!book) {
    const err = new Error('Book not found');
    err.status = 404;
    throw err;                       // reaches the error middleware in Express 5
  }
  res.json(book);
});

app.post('/books', (req, res) => {
  if (!req.body?.title) return res.status(400).json({ error: 'title required' });
  const book = save(req.body);
  res.status(201).location(`/books/${book.id}`).json(book);
});
```

`req.body` is `undefined` (not `{}`) until a body parser matches the request's `Content-Type`, so guard with `req.body?.field`. Built-in parsers: `express.json()`, `express.urlencoded()` (its `extended` default is `false` in 5), `express.text()`, `express.raw()`.

Route pattern syntax changed in Express 5 (path-to-regexp 8):

| Express 4 | Express 5 |
|---|---|
| `/files/*` | `/files/*splat` (`req.params.splat` is an array of segments) |
| `/docs/:version?` | `/docs{/:version}` |
| `/:id(\\d+)` regex in path | not supported; validate in the handler |

A bare `*` now throws `Missing parameter name` at startup. `req.query` uses the "simple" parser by default, so `?a[b]=1` yields `{ "a[b]": "1" }`; call `app.set('query parser', 'extended')` to get nested objects `{ a: { b: "1" } }`.

### Router and middleware order

Middleware runs in the order it is registered. Register body parsers and auth before the routes that need them, the 404 handler after all routes, and the error handler last.

```javascript
import { Router } from 'express';

const items = Router();
items.get('/', (req, res) => res.json([]));
items.get('/:sku', (req, res) => res.json({ sku: req.params.sku }));

app.use('/v1/items', requireApiKey, items);

function requireApiKey(req, res, next) {
  if (req.get('x-api-key') !== process.env.INVENTORY_API_KEY) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
}
```

Read the key from the environment variable `INVENTORY_API_KEY`; never hard-code it.

### Error handling

An error handler has exactly four parameters. In Express 5 a rejected promise or a throw inside an async handler is forwarded to it automatically; Express 4 needed `try/catch` plus `next(err)` or a wrapper.

```javascript
app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});
```

Malformed JSON makes `express.json()` raise an error with `status` 400 whose message is the parser's text; replace it with a fixed message if you do not want to echo parser details.

### Static files

```javascript
app.use('/assets', express.static('public', { maxAge: '1h', dotfiles: 'ignore' }));
```

Keep secrets and source out of the served directory; `express.static` serves every file in it.

### Removed or changed in Express 5

Confirmed against 5.3.0: `req.param()` no longer exists; `app.del()` is gone (use `app.delete`); `res.json(obj, 201)` ignores the second argument and replies 200, so write `res.status(201).json(obj)`; `res.send(200)` sends the text `200` instead of setting a status (use `res.sendStatus(200)` or `res.status(200).end()`); `res.redirect('back')` redirects to the literal path `back` (use `res.redirect(req.get('Referer') ?? '/')`).

## Examples

### Example 1: Small JSON API with validation and errors

Request: "Make a `/books` API with GET by id and POST, returning 404 JSON for missing books."

Save the routes from the sections above into `server.js`, then:

```bash
node server.js &
curl -s http://127.0.0.1:4000/books/1
curl -s -X POST -H 'content-type: application/json' -d '{"title":"Emma"}' http://127.0.0.1:4000/books
curl -s -w ' [%{http_code}]\n' http://127.0.0.1:4000/books/9
kill %1
```

Expected: the first call returns `{"id":1,"title":"Dune"}`, the POST returns `201` with a `Location: /books/2` header, and the last prints `{"error":"Book not found"} [404]`, produced by the error middleware from an async handler that simply threw.

### Example 2: Upgrade a catch-all and optional parameter to Express 5

Request: "My Express 4 app throws `Missing parameter name` after upgrading."

```javascript
// Express 4 (fails to start on 5)
app.get('/files/*', serveFile);
app.get('/docs/:version?', showDocs);

// Express 5
app.get('/files/*splat', (req, res) => serveFile(req, res, req.params.splat.join('/')));
app.get('/docs{/:version}', showDocs);
```

```bash
npm install express@5
node server.js
```

`GET /files/a/b/c` now yields `req.params.splat` equal to `["a","b","c"]`; `GET /docs` gives `req.params.version === undefined` and `/docs/v2` gives `"v2"`.

## Guidelines

- Check the installed major version (`npm ls express`) before applying advice from tutorials; most online code is Express 4.
- Always register an error handler and a 404 handler, and never send stack traces to clients.
- Do not trust `req.body`, `req.params` or `req.query`: validate type and range yourself or with a schema library, since Express does none.
- Set a body size `limit` on parsers; the default is small but explicit limits document intent.
- Behind a reverse proxy, set `app.set('trust proxy', 1)` (the number of proxies) so `req.ip` and `req.protocol` are correct; leave it off when directly exposed.
- Add `helmet`, CORS and rate limiting as separate middleware for a public API; Express provides none of them.
- For long-running handlers, avoid blocking the event loop (sync file or CPU work); move it to a worker or queue.
- Prefer Express when you want the largest middleware ecosystem and simple conventions. For built-in schema validation or higher throughput, Fastify or Hono may fit better.
