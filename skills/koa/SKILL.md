---
name: koa
description: >-
  Koa is a minimalist Node.js web framework from the team behind Express,
  built around async/await middleware and a single context object. Use when
  a user asks to build a REST API or web service with Koa, add routing, body
  parsing, CORS or error handling to a Koa app, write custom middleware, or
  migrate from Express or from Koa 2 to Koa 3.
license: Apache-2.0
compatibility: 'Node.js 18+ (Koa 3); @koa/router 15 needs Node.js 20+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/koajs/koa
  tags:
    - node
    - web-framework
    - middleware
    - async
    - express-alternative
---

# Koa — Next-Generation Node.js Web Framework

## Overview

Koa (current major version 3.x) is a small framework: it ships the application object, the `ctx` context (request plus response helpers) and the middleware pipeline, and nothing else. Routing, body parsing, CORS and logging are separate packages you add. Middleware are async functions that call `await next()`; code before the call runs on the way down, code after it runs on the way back up (the "onion" model).

Koa 3 requires Node.js 18 or newer, no longer accepts generator-function middleware (`koa-convert` is gone), and builds `ctx.query` with `URLSearchParams`. `@koa/router` 15 requires Node.js 20 or newer.

## Instructions

### Install

```bash
npm install koa @koa/router @koa/bodyparser @koa/cors koa-logger
npm install -D @types/koa @types/koa-logger @types/koa__cors   # TypeScript only
```

`@koa/router` ships its own types, so do not install `@types/koa__router`. Koa itself has no bundled types: add `@types/koa`. `koa-compose` comes in as a dependency of Koa; install it explicitly if you import it directly.

### Application skeleton

```javascript
import Koa from "koa";
import Router from "@koa/router";
import { bodyParser } from "@koa/bodyparser";   // named export, not default
import cors from "@koa/cors";
import logger from "koa-logger";

const app = new Koa();
const router = new Router({ prefix: "/api" });

// 1. Error handler goes first so it wraps everything below it
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.expose ? err.message : "Internal Server Error" };
    ctx.app.emit("error", err, ctx);          // still reaches app.on("error")
  }
});

app.use(logger());
app.use(cors());
app.use(bodyParser());                         // JSON and urlencoded by default

router.post("/orders", async (ctx) => {
  const { customerId, items } = ctx.request.body;
  if (!customerId || !Array.isArray(items)) {
    ctx.throw(400, "customerId and items are required");
  }
  ctx.status = 201;
  ctx.body = { id: "ord_1042", customerId, itemCount: items.length };
});

router.get("/orders/:id", async (ctx) => {
  ctx.assert(ctx.params.id.startsWith("ord_"), 404, "Order not found");
  ctx.body = { id: ctx.params.id };
});

app.use(router.routes()).use(router.allowedMethods());   // 405/OPTIONS handling

app.on("error", (err) => console.error("unhandled", err));
app.listen(3000, () => console.log("listening on :3000"));
```

### Context essentials

- `ctx.request.body` — parsed body (set by the body parser; `{}` when nothing was parsed). Parsing only runs for POST, PUT and PATCH.
- `ctx.body = value` — object or array becomes JSON, string becomes text/HTML, a stream is piped. Setting a body on a status-less response sets 200.
- `ctx.status`, `ctx.set(name, value)`, `ctx.get(name)`, `ctx.query`, `ctx.params` (router), `ctx.state` (per-request scratch space shared by middleware).
- `ctx.throw(status, message)` creates an HTTP error; with 4xx statuses the message is exposed to the client (`err.expose`), with 5xx it is not. `ctx.assert(condition, status, message)` is the one-line form.
- Koa 3 changed the signature: `ctx.throw(status, error, properties)` — pass an `Error` rather than relying on string-only forms.
- `ctx.back()` replaces `ctx.redirect("back")` in Koa 3.
- Set `app.proxy = true` only behind a trusted reverse proxy, so `ctx.ip` and `ctx.protocol` honour `X-Forwarded-*`.

### Routing with @koa/router 15

- Paths use path-to-regexp 8 syntax. Regex inside parameters (`/:id(\\d+)`) no longer works and throws at startup; validate in middleware, `router.param()` or `createParameterValidationMiddleware`.
- Optional segment: `/users{/:id}`. Wildcard capture: `/files/*path` gives `ctx.params.path`.
- Nest routers: `apiRouter.use("/users", usersRouter.routes())`.
- `router.use(mw)` registers middleware for the routes of that router only.

### Middleware composition

```javascript
import compose from "koa-compose";

const requireAdmin = compose([requireAuth, requireRole("admin"), auditLog]);
router.delete("/users/:id", requireAdmin, deleteUser);

async function requireAuth(ctx, next) {
  const token = ctx.get("Authorization").replace(/^Bearer /, "");
  if (!token) ctx.throw(401, "Missing bearer token");
  ctx.state.user = await verifyToken(token);   // your own verification
  await next();
}
```

### Multipart uploads and other body types

`@koa/bodyparser` does not parse multipart. Use `@koa/multer` (or `busboy`) for file uploads. Other types are opt-in: `bodyParser({ enableTypes: ["json", "form", "text"], jsonLimit: "2mb" })`. Defaults: `jsonLimit` and `textLimit` 1mb, `formLimit` 56kb.

## Examples

### Example 1: Add a health endpoint and response-time header

User request: "Add a /health route to my Koa app and a header with how long each request took."

```javascript
app.use(async (ctx, next) => {
  const start = process.hrtime.bigint();
  await next();                                  // everything downstream runs here
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  ctx.set("X-Response-Time", `${ms.toFixed(1)}ms`);
});

router.get("/health", (ctx) => {
  ctx.body = { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
});
```

Check it: `curl -i http://localhost:3000/api/health` returns `200`, a JSON body such as `{"status":"ok","uptimeSeconds":12}` and an `X-Response-Time: 0.4ms` header.

### Example 2: Migrate an Express handler

User request: "Convert this Express route to Koa: `app.post('/login', (req, res, next) => { ... res.status(401).json({error:'bad credentials'}) })`."

```javascript
router.post("/login", async (ctx) => {
  const { email, password } = ctx.request.body;
  const user = await users.findByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    ctx.throw(401, "bad credentials");           // replaces res.status(401).json(...) and next(err)
  }
  ctx.body = { token: await issueToken(user) };
});
```

Result: the request returns `401 {"error":"bad credentials"}` through the error-handling middleware shown above; there is no `next(err)` call, errors propagate as rejected promises.

## Guidelines

- Register the error handler first; middleware registered above it are not protected by it.
- Always `await next()`. A forgotten `await` makes downstream work run after the response is sent.
- Do not set `ctx.body` after the response has been written; use `ctx.respond = false` only when you write to `ctx.res` yourself.
- Upgrading from Koa 2: rewrite generator middleware as async functions, check code that reads `ctx.query` arrays, and update `ctx.throw` and `redirect("back")` calls.
- Upgrading `@koa/router` to v13 or newer: remove `:param(regex)` routes and old `*` wildcards, and drop `@types/koa__router`.
- Prefer `@koa/bodyparser` and `@koa/cors` (the maintained scoped packages) in new code; `koa-bodyparser` is the older package.
- Koa has no built-in static file serving, validation or sessions: add `koa-static`, a schema validator or `koa-session` deliberately and pin versions.
- Choose another framework when you want batteries included (NestJS) or schema-driven validation and serialization built in (Fastify).
