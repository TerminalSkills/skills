---
title: Build an API Playground
slug: build-api-playground
description: Build an interactive API playground where developers can explore endpoints, edit request parameters, see live responses, save and share snippets, and auto-generate code examples in multiple languages.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - api
  - playground
  - documentation
  - developer-experience
  - interactive
---

# Build an API Playground

## The Problem

Rosa leads developer relations at a 30-person API company. Their docs have curl examples, but developers still spend a long time working out authentication, headers and request bodies, and many support tickets are "how do I call this endpoint?" They tried Swagger UI, but it has no saved history, no code generation and no way to share a working request with a teammate. They need a playground where developers can call the API from the browser, see real responses and copy working code.

## The Solution

A small Hono server sits between the browser and your API. It validates every request with zod, forwards it to one fixed API origin, rate-limits and records history in Redis, generates code snippets, and stores shareable snippets in PostgreSQL. Because the server makes the call, there are no CORS problems, but it is also a proxy that strangers can aim at your API, so the points below matter as much as the features:

- The path must stay inside your API base URL (no other hosts, no `..`), redirects are not followed, and only a short list of request headers is accepted at all.
- The developer's API key is used for one call. It is never written to history, snippets or generated code (snippets read `$API_KEY` instead).
- Share links are unguessable, and private snippets are readable only by their owner.

```bash
npm install hono @hono/node-server @hono/zod-validator zod ioredis pg
npm install -D typescript tsx @types/node @types/pg
```

Environment: `REDIS_URL` (Redis 7 or newer), `DATABASE_URL`, `API_BASE_URL` (for example `https://api.example.com/v1/`) and `APP_URL`.

## Step 1: Storage

```sql
CREATE TABLE playground_snippets (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  request    jsonb NOT NULL,
  response   jsonb NOT NULL,
  created_by text NOT NULL,
  is_public  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

```typescript
// src/db.ts
import { Redis } from "ioredis";
import pg from "pg";

export const redis = new Redis(process.env.REDIS_URL!);
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

## Step 2: Validate and execute requests

`buildUrl` is the only place that turns a path into a URL, and the code generator uses it too. The URL parser resolves `%2e%2e` into `..`, so the check runs on the resulting URL, not on the input. The rate limit is a fixed window of 30 calls per minute per user; `EXPIRE ... NX` sets the window only when the counter is created.

```typescript
// src/playground.ts — validation, URL building and the proxied request
import { z } from "zod";
import { redis } from "./db";

const API_BASE = new URL(process.env.API_BASE_URL!); // e.g. https://api.example.com/v1/
const SAFE_HEADERS = new Set(["accept", "content-type", "idempotency-key", "x-request-id"]);

export const PlaygroundRequest = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  // relative to the API base; no scheme, no host, no ".." and no "//" tricks
  path: z.string().max(2000).regex(/^\/(?!\/)[\w\-./~%:@!$&'()*+,;=]*$/)
    .refine((p) => !p.includes("..") && !/%(2e|2f|5c)/i.test(p)), // encoded dots and slashes could still traverse upstream
  queryParams: z.record(z.string(), z.string()).default({}),
  // only allowlisted headers survive, so a key typed into a header never reaches history, snippets or generated code
  headers: z.record(z.string(), z.string()).default({})
    .transform((h) => Object.fromEntries(Object.entries(h).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase())))),
  body: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
  apiKey: z.string().max(500).optional(), // used for this call only, never stored
});
export type PlaygroundRequest = z.infer<typeof PlaygroundRequest>;

export interface PlaygroundResponse {
  status: number; statusText: string; headers: Record<string, string>;
  body: unknown; latencyMs: number; size: number;
}

export function buildUrl(req: Pick<PlaygroundRequest, "path" | "queryParams">): URL {
  const url = new URL(API_BASE.pathname.replace(/\/$/, "") + req.path, API_BASE.origin);
  // the URL parser resolves "%2e%2e" and friends, so check the result, not the input
  if (url.origin !== API_BASE.origin || !url.pathname.startsWith(API_BASE.pathname)) throw new Error("Path escapes the API base");
  for (const [k, v] of Object.entries(req.queryParams)) url.searchParams.set(k, v);
  return url;
}

// Fixed window: 30 calls per user per minute. EXPIRE ... NX needs Redis 7+.
export async function allowed(userId: string): Promise<boolean> {
  const key = `playground:rate:${userId}`;
  const res = await redis.multi().incr(key).expire(key, 60, "NX").exec();
  return Number(res![0][1]) <= 30;
}

export async function executeRequest(req: PlaygroundRequest, userId: string): Promise<PlaygroundResponse> {
  if (!(await allowed(userId))) {
    return { status: 429, statusText: "Too Many Requests", headers: {}, body: { error: "30 requests per minute" }, latencyMs: 0, size: 0 };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
  if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;

  const start = Date.now();
  try {
    const res = await fetch(buildUrl(req), {
      method: req.method,
      headers,
      body: req.body && req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      redirect: "manual", // a redirect could point anywhere
      signal: AbortSignal.timeout(10_000),
    });
    const text = (await res.text()).slice(0, 1_000_000);
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
    const out: PlaygroundResponse = {
      status: res.status, statusText: res.statusText,
      headers: Object.fromEntries([...res.headers].filter(([k]) => k !== "set-cookie")),
      body, latencyMs: Date.now() - start, size: Buffer.byteLength(text),
    };
    // History never contains the API key: the request is stored without it
    const { apiKey: _omit, ...safe } = req;
    const key = `playground:history:${userId}`;
    await redis.multi().rpush(key, JSON.stringify({ request: safe, response: out, at: new Date().toISOString() }))
      .ltrim(key, -50, -1).expire(key, 7 * 86400).exec();
    return out;
  } catch (err) {
    return { status: 0, statusText: "Error", headers: {}, body: { error: (err as Error).message }, latencyMs: Date.now() - start, size: 0 };
  }
}

export async function getHistory(userId: string) {
  return (await redis.lrange(`playground:history:${userId}`, 0, -1)).map((i) => JSON.parse(i)).reverse();
}
```

## Step 3: Generate code and save snippets

The generator produces curl, JavaScript (`fetch`) and Python (`requests`); other languages follow the same pattern. Values are escaped for the target language, so a body containing quotes still runs.

```typescript
// src/snippets.ts — code generation and saved snippets
import { randomBytes } from "node:crypto";
import { pool } from "./db";
import { buildUrl, type PlaygroundRequest, type PlaygroundResponse } from "./playground";

export type Language = "curl" | "javascript" | "python";

// Generated code reads the key from the environment: a real key never ends up in a snippet
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`; // POSIX single-quote escaping
const pyLiteral = (v: unknown): string =>
  v === null ? "None" : v === true ? "True" : v === false ? "False"
  : Array.isArray(v) ? `[${v.map(pyLiteral).join(", ")}]`
  : typeof v === "object" ? `{${Object.entries(v as object).map(([k, x]) => `${JSON.stringify(k)}: ${pyLiteral(x)}`).join(", ")}}`
  : JSON.stringify(v);

export function generateCodeSnippet(req: PlaygroundRequest, language: Language): string {
  const url = buildUrl(req).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...req.headers };

  if (language === "curl") {
    let cmd = `curl -X ${req.method} ${shq(url)}`;
    for (const [k, v] of Object.entries(headers)) cmd += ` \\\n  -H ${shq(`${k}: ${v}`)}`;
    if (req.apiKey) cmd += ` \\\n  -H "Authorization: Bearer $API_KEY"`;
    if (req.body) cmd += ` \\\n  -d ${shq(JSON.stringify(req.body))}`;
    return cmd;
  }
  if (language === "javascript") {
    const auth = req.apiKey ? `\n    Authorization: \`Bearer \${process.env.API_KEY}\`,` : "";
    return `const response = await fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(req.method)},
  headers: {${auth}
    ...${JSON.stringify(headers)},
  },${req.body ? `\n  body: JSON.stringify(${JSON.stringify(req.body)}),` : ""}
});
console.log(response.status, await response.json());`;
  }
  const hdr = req.apiKey ? `{**${pyLiteral(headers)}, "Authorization": f"Bearer {os.environ['API_KEY']}"}` : pyLiteral(headers);
  return `import os
import requests

response = requests.request(
    ${JSON.stringify(req.method)}, ${JSON.stringify(url)},
    headers=${hdr},${req.body ? `\n    json=${pyLiteral(req.body)},` : ""}
    timeout=10,
)
print(response.status_code, response.json())`;
}

export async function saveSnippet(name: string, request: PlaygroundRequest, response: PlaygroundResponse, userId: string, isPublic: boolean) {
  const id = randomBytes(9).toString("base64url"); // unguessable: public links are the only access
  const { apiKey: _omit, ...safe } = request;      // never persist a key
  await pool.query(
    `INSERT INTO playground_snippets (id, name, request, response, created_by, is_public) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, name, safe, response, userId, isPublic],
  );
  return { id, shareUrl: `${process.env.APP_URL}/playground/s/${id}` };
}

export async function getSnippet(id: string, userId: string) {
  const { rows } = await pool.query(`SELECT * FROM playground_snippets WHERE id = $1`, [id]);
  const s = rows[0];
  return s && (s.is_public || s.created_by === userId) ? s : null; // private ones only for their owner
}
```

## Step 4: The Hono routes

```typescript
// src/app.ts — HTTP routes (Hono) with zod validation
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { authenticate } from "./auth"; // yours: returns the user id for a request, or null
import { executeRequest, getHistory, PlaygroundRequest } from "./playground";
import { generateCodeSnippet, getSnippet, saveSnippet } from "./snippets";

const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", async (c, next) => {
  const userId = await authenticate(c.req.raw);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});

app.post("/playground/execute", zValidator("json", PlaygroundRequest), async (c) =>
  c.json(await executeRequest(c.req.valid("json"), c.get("userId"))));

app.post("/playground/code", zValidator("json", z.object({
  request: PlaygroundRequest, language: z.enum(["curl", "javascript", "python"]),
})), (c) => {
  const { request, language } = c.req.valid("json");
  return c.json({ code: generateCodeSnippet(request, language) });
});

app.post("/playground/snippets", zValidator("json", z.object({
  name: z.string().min(1).max(100), request: PlaygroundRequest, response: z.unknown(), isPublic: z.boolean().default(false),
})), async (c) => {
  const { name, request, response, isPublic } = c.req.valid("json");
  return c.json(await saveSnippet(name, request, response as never, c.get("userId"), isPublic), 201);
});

app.get("/playground/snippets/:id", async (c) => {
  const snippet = await getSnippet(c.req.param("id"), c.get("userId"));
  return snippet ? c.json(snippet) : c.json({ error: "Not found" }, 404);
});

app.get("/playground/history", async (c) => c.json(await getHistory(c.get("userId"))));

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 8787 });
```

`authenticate` is your session or API-key check. Without it every route returns 401, which is the safe default. The server binds to 127.0.0.1; put it behind your reverse proxy. A front end then calls `POST /playground/execute` with the form values, `POST /playground/code` to fill the code tab, and `POST /playground/snippets` to create the share link.

## Real-World Example

Rosa's team adds a "Try it" button to every endpoint in their docs. It opens the playground with the example request prefilled, and the developer pastes a test key and presses Send. The Python, JavaScript and curl tabs show the same call with `API_KEY` read from the environment, so the code can be copied straight into a project. When a customer reports a problem, support asks for the share link instead of a screenshot, and the request and response are there. The team measures support tickets about authentication before and after launch to see whether it helps.

## Related Skills

- [typescript](../skills/typescript/) — Types for requests, responses and the code generator
- [hono](../skills/hono/) — The HTTP routes and middleware
- [zod](../skills/zod/) — Validation of every request and response shape
- [redis](../skills/redis/) — Rate limiting and per-user request history
- [postgresql](../skills/postgresql/) — Persistent, shareable snippets
