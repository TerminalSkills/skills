---
name: hapi
description: >-
  hapi is a Node.js web framework for building HTTP APIs from configuration:
  routes declare their validation, authentication, caching and CORS rules, and
  the framework enforces them before the handler runs. Use when a user asks to
  build or fix a hapi server, validate request payloads or responses with Joi,
  protect routes with JWT through @hapi/jwt, split an API into hapi plugins,
  cache results with server methods, hook into the request lifecycle, return
  errors with @hapi/boom, or test routes with server.inject().
license: Apache-2.0
compatibility: 'Node.js 14.15+ for @hapi/hapi 21; joi 18 requires Node.js 20+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/hapijs/hapi
  tags:
    - node
    - web-framework
    - api
    - validation
    - authentication
---

# Hapi — Enterprise Node.js Framework

## Overview

hapi (`@hapi/hapi`, currently 21.x) is a configuration-centric HTTP framework for Node.js. A route is an object that declares its input validation, response schema, authentication and access rules; hapi runs those steps in a fixed request lifecycle and only then calls the handler. Validation uses Joi schemas (the separate `joi` package), authentication is added through scheme plugins such as `@hapi/jwt`, and application code is organised into plugins. There is no middleware chain: cross-cutting logic goes into lifecycle extension points. Rate limiting is not built in.

## Instructions

### Installation

```bash
npm install @hapi/hapi joi @hapi/jwt @hapi/boom
# Optional: static files and template rendering
npm install @hapi/inert @hapi/vision
```

Install `joi`, not `@hapi/joi` — the scoped package is deprecated on npm ("Switch to 'npm install joi'"). TypeScript declarations ship inside `@hapi/hapi`, `@hapi/jwt`, `@hapi/boom` and `joi`; no `@types/*` packages are needed.

### Server, authentication and routes

Register the auth scheme and strategy before adding any route that names it; otherwise `server.route()` throws `Unknown authentication strategy jwt in /api/users`.

```javascript
// server.mjs
import Hapi from "@hapi/hapi";
import Jwt from "@hapi/jwt";
import Boom from "@hapi/boom";
import Joi from "joi";
import { randomUUID } from "node:crypto";

const users = new Map();

export async function createServer() {
  const server = Hapi.server({
    port: Number(process.env.PORT ?? 3000),
    host: "0.0.0.0",
    routes: {
      cors: { origin: ["https://app.northwind.dev"], credentials: true },
      validate: {
        options: { abortEarly: false },
        // Default reply is the generic "Invalid request payload input";
        // rethrowing exposes Joi's message and the failing keys to the client.
        failAction: (request, h, err) => { throw err; },
      },
    },
  });

  await server.register(Jwt);
  server.auth.strategy("jwt", "jwt", {
    keys: process.env.JWT_SECRET,
    // aud, iss and sub are required unless verify is false; false skips one check
    verify: { aud: "urn:audience:northwind-api", iss: "urn:issuer:northwind-auth", sub: false, maxAgeSec: 14400, timeSkewSec: 15 },
    validate: (artifacts, request, h) => ({
      isValid: true,
      credentials: { user: artifacts.decoded.payload.user, scope: artifacts.decoded.payload.scope },
    }),
  });
  server.auth.default("jwt"); // every route now requires a token unless it opts out

  server.route({
    method: "POST",
    path: "/api/users",
    options: {
      auth: { access: { scope: ["admin"] } }, // checked against credentials.scope
      validate: {
        payload: Joi.object({
          name: Joi.string().min(2).max(100).required(),
          email: Joi.string().email().required(),
          role: Joi.string().valid("user", "admin").default("user"),
        }),
      },
      response: {
        schema: Joi.object({
          id: Joi.string().uuid().required(),
          name: Joi.string().required(),
          email: Joi.string().email().required(),
          role: Joi.string().valid("user", "admin").required(),
          createdAt: Joi.date().required(),
        }),
      },
    },
    handler: (request, h) => {
      const user = { id: randomUUID(), ...request.payload, createdAt: new Date() };
      users.set(user.id, user);
      return h.response(user).code(201);
    },
  });

  server.route({
    method: "GET",
    path: "/api/users/{id}",
    options: { validate: { params: Joi.object({ id: Joi.string().uuid().required() }) } },
    handler: (request) => {
      const user = users.get(request.params.id);
      if (!user) throw Boom.notFound("User not found");
      return user; // objects are serialised as JSON with status 200
    },
  });

  server.route({ method: "GET", path: "/health", options: { auth: false }, handler: () => ({ status: "ok" }) });
  return server;
}

if (process.argv[2] === "start") {
  const server = await createServer();
  await server.start();
  console.log(`Listening on ${server.info.uri}`);
}
```

Validation rules must be compiled Joi schemas (`Joi.object({...})`). A plain object such as `{ limit: Joi.number() }` fails with `Cannot set uncompiled validation rules without configuring a validator` unless `server.validator(Joi)` was called first.

### Plugins, server methods and lifecycle extensions

A plugin is an object with `name` and an async `register(server, options)`. Server methods are shared functions with optional caching (in-memory by default; `generateTimeout` is required when `cache` is set). `server.ext()` attaches to lifecycle points, which run in this order: `onRequest`, `onPreAuth`, `onCredentials`, `onPostAuth`, `onPreHandler`, `onPostHandler`, `onPreResponse`, `onPostResponse`.

```javascript
// invoices.mjs
export const invoicesPlugin = {
  name: "invoices",
  version: "1.0.0",
  register: async (server, options) => {
    server.method("invoiceTotal", async (customerId) => {
      return { customerId, total: 1280.5, currency: options.currency };
    }, { cache: { expiresIn: 60_000, generateTimeout: 2_000 } });

    server.ext("onPreResponse", (request, h) => {
      const response = request.response;
      // Error responses are Boom objects and have no header() method
      if (!response.isBoom) response.header("x-response-time", `${Date.now() - request.info.received}ms`);
      return h.continue;
    });

    server.route({
      method: "GET",
      path: "/customers/{customerId}/total",
      options: { auth: false },
      handler: (request) => server.methods.invoiceTotal(request.params.customerId),
    });
  },
};
```

```javascript
// Registration options and a path prefix for every route the plugin adds
await server.register({
  plugin: invoicesPlugin,
  options: { currency: "EUR" },
  routes: { prefix: "/api/invoices" },
});
```

## Examples

### Example 1: Run the API and call it

**User request:** "Start the users API locally and show me what an unauthenticated call and the health check return."

```bash
export JWT_SECRET="$(openssl rand -base64 32)"
PORT=3000 node server.mjs start
# Listening on http://0.0.0.0:3000

# In a second terminal (the server stays in the foreground):
curl -s http://127.0.0.1:3000/health
# {"status":"ok"}

curl -s -X POST http://127.0.0.1:3000/api/users \
  -H 'content-type: application/json' \
  -d '{"name":"Maria Keller","email":"maria.keller@northwind.dev"}'
# {"statusCode":401,"error":"Unauthorized","message":"Missing authentication"}
```

Authentication runs before payload validation, so a request without a token gets 401 even when its body is invalid. A token whose `scope` lacks `admin` gets `{"statusCode":403,"error":"Forbidden","message":"Insufficient scope"}`.

### Example 2: Test routes without opening a port

**User request:** "Write tests for POST /api/users that cover a missing token, a bad payload and a successful create."

```javascript
// users.test.mjs — run with: node --test users.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Jwt from "@hapi/jwt";
import { createServer } from "./server.mjs";

process.env.JWT_SECRET = randomBytes(32).toString("base64"); // throwaway key for this test run

test("POST /api/users", async (t) => {
  const server = await createServer();
  await server.initialize(); // finalises plugins and caches, does not listen

  await t.test("rejects a missing token", async () => {
    const res = await server.inject({ method: "POST", url: "/api/users", payload: { name: "Maria Keller", email: "maria.keller@northwind.dev" } });
    assert.equal(res.statusCode, 401);
  });

  await t.test("rejects a bad payload", async () => {
    const res = await server.inject({
      method: "POST", url: "/api/users",
      auth: { strategy: "jwt", credentials: { user: "ci", scope: ["admin"] } }, // bypasses token parsing
      payload: { name: "M", email: "not-an-email" },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.result.validation.keys, ["name", "email"]);
  });

  await t.test("creates a user with a real token", async () => {
    const token = Jwt.token.generate(
      { aud: "urn:audience:northwind-api", iss: "urn:issuer:northwind-auth", user: "maria.keller", scope: ["admin"] },
      { key: process.env.JWT_SECRET, algorithm: "HS256" },
      { ttlSec: 3600 },
    );
    const res = await server.inject({
      method: "POST", url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Maria Keller", email: "maria.keller@northwind.dev" },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.result.role, "user"); // Joi default applied
  });

  await server.stop();
});
```

Result: `tests 4, pass 4, fail 0`. The bad-payload reply body is `{"statusCode":400,"error":"Bad Request","message":"\"name\" length must be at least 2 characters long. \"email\" must be a valid email","validation":{"source":"payload","keys":["name","email"]}}`.

## Guidelines

1. **Validate every input at the route** — `validate.params`, `query`, `payload`, `headers` and `state` reject bad input with 400 before the handler runs. Joi defaults and conversions are written back to `request.payload`, `request.query` and `request.params`.
2. **Decide how much validation detail to expose** — by default clients see only `Invalid request payload input`. A `failAction` that rethrows the error returns field-level messages; log instead of rethrowing if those messages would leak internals.
3. **Response validation fails closed** — a handler result that breaks `response.schema` becomes a 500. Use `response.failAction: 'log'` or `response.sample` (percentage of responses checked) in production if a 500 is too strict.
4. **Never combine `origin: ['*']` with `credentials: true`** — hapi then echoes any caller's `Origin` back with `Access-Control-Allow-Credentials: true`. List the allowed origins explicitly. CORS is off by default.
5. **Keep secrets in the environment** — pass `process.env.JWT_SECRET` (or a JWKS `{ uri }`) as `keys`; do not use `algorithms: ['none']` or `verify: false` outside local experiments.
6. **Plugins for modularity** — group routes, methods and extensions per feature; pass configuration through `options` and mount with `routes.prefix`. Registering the same plugin twice throws unless `once` or `multiple` is set.
7. **Errors through `@hapi/boom`** — `throw Boom.notFound()`, `Boom.badRequest()`, `Boom.forbidden()` produce the same `{ statusCode, error, message }` body hapi uses. Uncaught exceptions become a 500 with a generic message.
8. **Test with `server.inject()`** — call `server.initialize()` instead of `server.start()` in tests. The `auth` option injects credentials directly, so cover real token parsing with at least one request that sends an `Authorization` header.
9. **When not to use hapi** — it targets long-running Node.js servers. For edge runtimes or apps built around Express or Koa middleware, pick a framework designed for those.
