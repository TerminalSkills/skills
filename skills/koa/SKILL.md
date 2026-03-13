---
name: koa
description: >-
   You are an expert in Koa, the minimalist web framework created by the
  Express team. You help developers build APIs and web services using Koa's
  async/await middleware stack, context object, and composable architecture —
  providing a lightweight foundation where you add only what you need through
  middleware, without bundled routing or templating.
category: Backend Development
tags: [node, web-framework, middleware, async, minimalist, express-alternative]
version: 1.0.0
author: terminal-skills
---

# Koa — Next-Generation Node.js Web Framework

You are an expert in Koa, the minimalist web framework created by the Express team. You help developers build APIs and web services using Koa's async/await middleware stack, context object, and composable architecture — providing a lightweight foundation where you add only what you need through middleware, without bundled routing or templating.

## Core Capabilities

### Application

```typescript
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import logger from "koa-logger";

const app = new Koa();
const router = new Router({ prefix: "/api" });

// Error handling (upstream)
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.message };
    ctx.app.emit("error", err, ctx);
  }
});

app.use(logger());
app.use(cors());
app.use(bodyParser());

// Routes
router.get("/users", async (ctx) => {
  const page = parseInt(ctx.query.page as string) || 1;
  const users = await db.users.findAll({ offset: (page - 1) * 20, limit: 20 });
  ctx.body = { data: users, page };
});

router.post("/users", async (ctx) => {
  const { name, email } = ctx.request.body as any;
  if (!name || !email) ctx.throw(400, "Name and email required");
  const user = await db.users.create({ name, email });
  ctx.status = 201;
  ctx.body = user;
});

router.get("/users/:id", async (ctx) => {
  const user = await db.users.findById(ctx.params.id);
  if (!user) ctx.throw(404, "User not found");
  ctx.body = user;
});

// Auth middleware
async function auth(ctx: Koa.Context, next: Koa.Next) {
  const token = ctx.headers.authorization?.replace("Bearer ", "");
  if (!token) ctx.throw(401, "Unauthorized");
  ctx.state.user = await verifyToken(token);
  await next();
}

router.get("/profile", auth, async (ctx) => {
  ctx.body = ctx.state.user;
});

app.use(router.routes()).use(router.allowedMethods());
app.listen(3000, () => console.log("Server on :3000"));
```

### Middleware Composition

```typescript
// Koa middleware flows downstream then back upstream (onion model)
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();                           // Downstream
  const ms = Date.now() - start;          // Back upstream
  ctx.set("X-Response-Time", `${ms}ms`);
});

// Compose multiple middleware
import compose from "koa-compose";
const adminMiddleware = compose([auth, roleCheck("admin"), auditLog]);
router.delete("/users/:id", adminMiddleware, deleteUser);
```

## Installation

```bash
npm install koa @koa/router koa-bodyparser @koa/cors
npm install -D @types/koa @types/koa__router
```

## Best Practices

1. **Async/await everywhere** — Koa is built on async; no callbacks, no `next(err)` pattern like Express
2. **Context object** — `ctx` combines request and response; `ctx.body` for response, `ctx.request.body` for parsed input
3. **Error handling upstream** — Put error-catching middleware first; it catches errors from all downstream middleware
4. **ctx.throw for errors** — Use `ctx.throw(404, "Not found")` instead of manual status/body setting
5. **ctx.state for request data** — Store auth user, request ID, etc. in `ctx.state`; shared across middleware
6. **Compose for reuse** — Use `koa-compose` to bundle middleware stacks for route groups
7. **Minimalist by design** — Koa has no built-in router, body parser, or static files; add only what you need
8. **Onion model** — Middleware flows down then back up; response-time tracking wraps the entire request naturally
