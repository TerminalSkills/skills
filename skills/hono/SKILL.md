---
name: hono
description: >-
  Hono is a small web framework built on Web Standards (Request/Response) that
  runs unchanged on Cloudflare Workers, Deno, Bun, Node.js, AWS Lambda and
  Vercel. Use it when the user asks to build a Hono API, add Zod validation,
  JWT auth, CORS or middleware, use the type-safe RPC client (hc), render JSX,
  stream responses, or deploy one codebase to several runtimes.
license: Apache-2.0
compatibility: Node.js 20+ (or Bun, Deno, Cloudflare Workers); hono 4.x, TypeScript recommended
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/honojs/hono
  tags: ["hono", "web-framework", "cloudflare-workers", "typescript", "rpc"]
---

# Hono — Ultrafast Web Framework

## Overview

Hono (hono 4.x, checked against 4.13) is a router plus middleware built only on `Request`/`Response`, so the same app object runs on Workers, Bun, Deno, Node.js, Lambda and Vercel. The core package ships its own middleware (`hono/cors`, `hono/jwt`, `hono/logger`, `hono/csrf`, `hono/secure-headers`, `hono/body-limit`, `hono/compress`, `hono/etag`, `hono/timeout`, `hono/request-id` and more), a JSX renderer (`hono/jsx`), and a typed RPC client (`hono/client`). Third-party middleware such as validators lives in `@hono/*` packages. There is no built-in rate limiter or ORM.

## Instructions

### Create a project

```bash
npm create hono@latest orders-api
# pick a template: cloudflare-workers, nodejs, bun, deno, aws-lambda, vercel, ...
cd orders-api && npm install && npm run dev
```

For an existing Node.js project install `hono` and `@hono/node-server`, and start the app with `serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" })`. On Workers, Bun and Deno you `export default app` instead.

### API routes with validation and JWT

Install the validator separately: `npm install @hono/zod-validator zod`.

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { jwt, sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Variables = { jwtPayload: { sub: string } };
const app = new Hono<{ Variables: Variables }>();

app.use(logger());
app.use("/api/*", cors({ origin: ["https://brightcart.io"], credentials: true }));
// `alg` is required: the middleware throws without it
app.use("/api/protected/*", jwt({ secret: process.env.JWT_SECRET!, alg: "HS256" }));

const createUser = z.object({
  name: z.string().min(1),
  email: z.email(), // zod 4; on zod 3 use z.string().email()
  role: z.enum(["user", "admin"]).default("user"),
});

const routes = app
  .post("/api/users", zValidator("json", createUser), (c) => {
    const body = c.req.valid("json"); // { name: string; email: string; role: "user" | "admin" }
    return c.json(body, 201);
  })
  .get("/api/protected/me", (c) => c.json({ userId: c.get("jwtPayload").sub }));

export type AppType = typeof routes;
export default app;
```

A body that fails the schema gets a 400 JSON response automatically. Chain the routes (as above) so `typeof routes` carries every route type to the client; routes registered separately with `app.get(...)` statements are not part of the type. Issue tokens with `await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }, secret, "HS256")` (`sign` is async and takes the algorithm as its third argument).

Read the path with `c.req.param("id")`, the query with `c.req.query("page")`, and the headers with `c.req.header("x-request-id")`. Group routes by mounting sub-apps: `app.route("/api/orders", ordersApp)`.

### Errors

```typescript
import { HTTPException } from "hono/http-exception";

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  // JWT, bearer-auth and other middleware throw HTTPException: keep its status
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
```

Without the `HTTPException` branch, a missing token returns 500 instead of 401.

### RPC client

```typescript
import { hc } from "hono/client";
import type { AppType } from "./server";

const client = hc<AppType>("https://api.brightcart.io");
const res = await client.api.users.$post({ json: { name: "Alice", email: "alice@mail.com" } });
if (res.ok) console.log(await res.json());
```

Put only `import type` from the server file in client code. Dynamic segments are called as `client.api.users[":id"].$get({ param: { id: "42" } })`.

### JSX, HTML and streaming

JSX needs `"jsx": "react-jsx"` and `"jsxImportSource": "hono/jsx"` in `tsconfig.json`, and the file must be `.tsx` (Workers templates set this already).

```tsx
import { getRuntimeKey } from "hono/adapter";
import { streamText } from "hono/streaming";

app.get("/", (c) =>
  c.html(
    <html>
      <body>
        <h1>Order dashboard</h1>
        <p>Runtime: {getRuntimeKey()}</p>
      </body>
    </html>
  )
);

app.get("/stream", (c) =>
  streamText(c, async (stream) => {
    for (const word of ["Preparing", "your", "report"]) {
      await stream.write(word + " ");
      await stream.sleep(100);
    }
  })
);
```

`streamText`, `stream` and `streamSSE` come from `hono/streaming`; the older `c.streamText()` context methods no longer exist in 4.x. Use `getRuntimeKey()` from `hono/adapter` to detect the runtime (`"node"`, `"workerd"`, `"bun"`, `"deno"`).

## Examples

### Example 1: "Add a protected endpoint to my Hono API"

Request: "Only logged-in users may call `GET /api/protected/me`."
Steps: add `jwt({ secret: process.env.JWT_SECRET!, alg: "HS256" })` on `/api/protected/*` as shown, then read `c.get("jwtPayload")`. A request without a header returns 401 (with the `onError` branch above); a request with a valid `Authorization: Bearer <token>` returns `{"userId":"u1"}`.

### Example 2: "Validate the signup body"

Request: "Reject signups with an empty name."
Steps: attach `zValidator("json", createUser)` to the route. `POST /api/users` with `{"name":"Alice","email":"alice@mail.com"}` returns 201 with `"role":"user"` filled in by the default; `{"name":""}` returns 400 with the Zod issues.

## Guidelines

- Always set `alg` on `jwt()` and keep the secret in an environment variable (on Workers read it from `c.env.JWT_SECRET` in a wrapper middleware).
- Pin `@hono/zod-validator` to a version that matches your Zod major; mismatched majors break the types.
- Middleware order matters: register `cors()` before routes it must cover, and a handler that returns a `Response` ends the chain.
- Add `body-limit`, `secure-headers` and `csrf` for browser-facing apps; rate limiting needs a third-party package or the platform (Cloudflare rules).
- Bind local Node servers to `127.0.0.1` unless you mean to expose them.
- Do not use Hono for apps that depend on Node-only frameworks' plugin ecosystems (Express middleware does not work as is).
