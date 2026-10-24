---
name: hono-rpc
description: >-
  Hono RPC shares a Hono server's route types with a typed fetch client
  (hc), giving end-to-end type safety for REST APIs without code generation or
  schema files. Use when building a type-safe API with Hono, sharing API types
  between frontend and backend, validating input with Zod and getting the types
  on the client, or replacing tRPC with plain REST. Runs on Cloudflare Workers,
  Deno, Bun and Node.js.
license: Apache-2.0
compatibility: "Hono 4.x (@hono/zod-validator 0.9 needs hono >= 4.11.2 and zod 3.25+ or 4), TypeScript with strict mode. Runs on Cloudflare Workers, Deno, Bun, Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/honojs/hono
  tags: ["hono", "rpc", "type-safe", "cloudflare-workers", "typescript"]
  use-cases:
    - "Build a type-safe REST API with Hono RPC and share types with the frontend"
    - "Replace tRPC with Hono RPC for a REST-compatible type-safe API"
    - "Create a Cloudflare Workers API with full type inference on the client"
    - "Validate API inputs with Zod middleware and propagate types to the client"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Hono RPC

## Overview

Hono RPC links a Hono server and its clients through types. Routes with validators are written on the server, the app's type is exported as `AppType`, and the `hc<AppType>()` client from `hono/client` then knows every path, method, input and JSON response. The client is a thin wrapper over `fetch`; nothing is generated. Type inference only sees what the chain of route definitions exposes, so most pitfalls below are about keeping that chain intact.

## Instructions

### Install

```bash
npm install hono zod @hono/zod-validator
npm install @hono/node-server        # only when running on Node.js
```

On Bun and Cloudflare Workers `hono` is enough for the server. On Deno import `jsr:@hono/hono`. Set `"strict": true` in the `tsconfig.json` of both server and client (in a monorepo, of every package); without it the inferred types degrade. The validator also works with Standard Schema libraries such as Valibot through `@hono/standard-validator`.

### Define routes and export the type

Chain the handlers (`new Hono().get(...).post(...)`) so each call adds to the type, and export `typeof` the final value:

```ts
// src/server.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

const users = new Hono()
  .get("/", (c) => c.json({ users: [{ id: 1, name: "Maria Lopez", email: "maria@lopez-studio.es" }] }))
  .get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (id !== 1) return c.json({ error: "User not found" }, 404);
    return c.json({ user: { id, name: "Maria Lopez" } }, 200);
  })
  .post("/", zValidator("json", createUser), (c) => {
    const data = c.req.valid("json"); // typed from the schema
    return c.json({ user: { id: 2, ...data } }, 201);
  })
  .patch("/:id", zValidator("json", createUser.partial()), (c) => {
    return c.json({ user: { id: Number(c.req.param("id")), ...c.req.valid("json") } });
  })
  .delete("/:id", (c) => c.json({ deleted: Number(c.req.param("id")) }));

const app = new Hono().route("/users", users);

export type AppType = typeof app;
export default app;
```

Run it on Node.js with `import { serve } from "@hono/node-server"; serve({ fetch: app.fetch, port: 3000 });`. Bun and Workers use the default export directly.

### Call it from the client

```ts
import { hc } from "hono/client";
import type { AppType } from "./server"; // type-only import: no server code ships to the browser

const client = hc<AppType>("http://localhost:3000");

const list = await client.users.$get();
if (list.ok) console.log((await list.json()).users);

const created = await client.users.$post({ json: { name: "Tom Becker", email: "tom@becker.dev", age: 30 } });
const one = await client.users[":id"].$get({ param: { id: "1" } });
await client.users[":id"].$patch({ param: { id: "1" }, json: { name: "Tom B." } });
await client.users[":id"].$delete({ param: { id: "1" } });
```

Path parameters and query values must be passed as strings even when the schema turns them into numbers. `hc` does not URL-encode `param`; wrap values that may contain `/` in `encodeURIComponent`, or declare the route with a regexp such as `/files/:name{.+}`.

### Query, headers, cookies, abort

```ts
const search = new Hono().get(
  "/search",
  zValidator("query", z.object({ q: z.string().optional(), page: z.coerce.number().default(1) })),
  (c) => c.json({ results: [], ...c.req.valid("query") }),
);

type SearchApp = typeof search;
const client = hc<SearchApp>("http://localhost:3000", {
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` }, // sent with every call
  init: { credentials: "include" },                               // send cookies
});
const res = await client.search.$get({ query: { q: "hono", page: "2" } });
const withId = await client.search.$get({ query: { q: "x" } }, { headers: { "X-Request-ID": crypto.randomUUID() } });
```

Per-call options (second argument) accept `headers` and `init` (a `RequestInit`, for example `{ signal }` to abort; `init` wins over other options). Other validator targets are `form`, `param`, `header` and `cookie`; file uploads go through `form` with a `File`.

### Status codes and errors

Give `c.json()` an explicit status so the client can narrow on it. Do not use `c.notFound()` in an RPC route: its body is untyped and the client sees `unknown`. Return `c.json({ error: "..." }, 404)` instead.

```ts
const res = await client.users[":id"].$get({ param: { id: "999" } });
if (res.status === 404) console.error((await res.json()).error);
if (res.ok) console.log((await res.json()).user);
```

Errors thrown with `HTTPException` or returned by `app.onError()` and global middleware are not part of the inferred types. Wrap the type with `ApplyGlobalResponse` from `hono/client` to add them: `hc<ApplyGlobalResponse<typeof app, { 500: { json: { error: string } } }>>(url)`.

`parseResponse` from `hono/client` parses the body by content type and throws a `DetailedError` when the response is not ok, which suits data-fetching hooks:

```ts
import { parseResponse } from "hono/client";
const { users } = await parseResponse(client.users.$get());
```

### Infer request and response types

```ts
import type { InferRequestType, InferResponseType } from "hono/client";

const $post = client.users.$post;
type CreateUserBody = InferRequestType<typeof $post>["json"];
type CreateUserOk = InferResponseType<typeof $post, 201>; // pick one status code
```

### Larger apps and monorepos

Build each sub-router as a chained `new Hono()`, mount with `.route()`, and export the type of the mounted result. Handlers registered separately (`app.get(...)` on its own line, or sub-routers that are not chained) are invisible to the client. A handler that returns a bare `.then()` chain loses its response type; make it `async` and return `c.json(...)`.

In a monorepo, re-export `AppType` from the API package and import it type-only in the web package, with the same `hono` version on both sides (a mismatch breaks inference). With many routes the IDE slows down; compile the client type once:

```ts
// packages/api/src/client.ts
import { hc, type ClientRequestOptions } from "hono/client";
import type { app } from "./app";
type App = typeof app;
const probe = hc<App>("");
export type Client = typeof probe;
export const hcWithType = (url: string, options?: ClientRequestOptions): Client => hc<App>(url, options);
```

Then build the API package with `tsc` and use `hcWithType` in the frontend. Splitting one client per sub-app (`hc<AuthorsApp>("/authors")` with `type AuthorsApp = typeof authorsApp`) also helps.

### Cloudflare Workers

```ts
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono<{ Bindings: { DB: D1Database } }>()
  .use("/api/*", cors({ origin: ["https://shop.example.org"], allowMethods: ["GET", "POST"] }))
  .get("/api/items", async (c) => {
    const { results } = await c.env.DB.prepare("SELECT id, name, price FROM items").all();
    return c.json({ items: results });
  })
  .post("/api/items", zValidator("json", z.object({ name: z.string(), price: z.number() })), async (c) => {
    const { name, price } = c.req.valid("json");
    await c.env.DB.prepare("INSERT INTO items (name, price) VALUES (?, ?)").bind(name, price).run();
    return c.json({ ok: true }, 201);
  });

export type AppType = typeof app;
export default app;
```

Declare the D1 binding in `wrangler.jsonc` (or `wrangler.toml`) and generate binding types with `npx wrangler types`; deploy with `npx wrangler deploy`.

## Examples

**"Give my React app typed calls to the Hono API."** Export `AppType` from the server, add the API package as a dependency of the web app, then in `web/src/api.ts` write `export const api = hc<AppType>(import.meta.env.VITE_API_URL);`. In a query function `const res = await api.users.$get(); return res.json();` gives `{ users: ... }` typed. Renaming a field on the server turns the affected client lines red at compile time.

**"Why is `res.json()` unknown?"** Check, in order: the route was added in the chain that is exported as `AppType`; the handler returns `c.json(...)` (not `c.notFound()`, `c.text()` or a raw `Response`); the status is explicit if the response has several; `strict` is on; server and client resolve the same `hono` version.

## Guidelines

- Export `AppType` as `typeof app` of the final chained, mounted app, never an interface or an app built from unchained calls.
- Validate every input with `zValidator` (json, form, query, param, header, cookie); the schema is also what types the client.
- Query and path values are strings on the wire; use `z.coerce.number()` on the server and pass strings from the client.
- Import `AppType` with `import type` so the server never enters the client bundle.
- Never put secrets in client-side `hc` headers; the browser exposes them.
- RPC types cover only JSON-style responses from `c.json()`; for streams, redirects or files use plain `fetch` or `client.path.$url()`.
