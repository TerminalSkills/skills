---
title: Build an AI Workflow Builder
slug: build-ai-workflow-builder
description: Build the backend of a visual AI workflow builder with typed node graphs, LLM calls, conditional branching, parallel execution and an authenticated API, with no eval and no arbitrary code.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - xyflow
category: data-ai
tags:
  - ai-workflow
  - automation
  - no-code
  - llm-chains
  - visual-builder
---

# Build an AI Workflow Builder

## The Problem

Marko leads operations at a 25-person company. They have 20 repetitive AI tasks: summarize support tickets, extract invoice data, classify emails. Each is a separate script maintained by engineers, so a new task waits on the engineering queue and operations staff cannot change a prompt. They want a visual builder: nodes on a canvas, LLM calls chained together, branching on the result, and a stored definition they can edit. This page builds the backend that validates and runs the node graph; the canvas is only a front end.

## The Solution

A workflow is plain JSON: nodes and edges. **Zod** validates every definition before it is stored or run, including a cycle check. **Hono** serves a small authenticated API. **PostgreSQL** keeps definitions and run history as `jsonb`. **Redis** makes webhook triggers idempotent, because senders retry. **TypeScript** ties it together; the runner executes the graph in waves, so independent branches run in parallel.

Two design choices matter more than any feature. Conditions are data (`{ path, op, value }`), not strings passed to `new Function`, and there is no "code" node, because an in-process JavaScript evaluator is not a sandbox: a user-edited workflow would be remote code execution on your server. There is also no free-form SQL node, which would be injectable from LLM output; read data through the HTTP node against an API you control.

## Step 1: Project Setup
```bash
mkdir workflow-builder && cd workflow-builder || exit 1
npm init -y && npm pkg set type=module
npm i hono @hono/node-server @hono/zod-validator zod pg ioredis @anthropic-ai/sdk
npm i -D typescript tsx @types/node @types/pg
```

Checked with hono 4.13, zod 4.6, ioredis 6, pg 8.23 and @anthropic-ai/sdk 1.3; the SQL needs PostgreSQL 13+ (`gen_random_uuid`).
```sql
CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  status text NOT NULL,
  outputs jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now()
);
```

## Step 2: The Workflow Schema
```typescript
// src/schema.ts
import { z } from "zod";

const base = { id: z.string().min(1), label: z.string() };

export const Condition = z.object({
  path: z.string(),                                  // e.g. "classify.sentiment"
  op: z.enum(["eq", "neq", "contains", "gt", "lt"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const WorkflowNode = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("input") }),
  z.object({
    ...base, type: z.literal("llm"),
    system: z.string().optional(),
    prompt: z.string(),                              // may contain {{input.text}} or {{nodeId.field}}
    json: z.boolean().default(false),                // parse the reply as a JSON object
    model: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal("condition"), condition: Condition }),
  z.object({
    ...base, type: z.literal("http"),
    url: z.url(), method: z.enum(["GET", "POST"]).default("POST"), body: z.string().optional(),
  }),
  z.object({ ...base, type: z.literal("output"), template: z.string() }),
]);

export const WorkflowEdge = z.object({
  source: z.string(), target: z.string(),
  branch: z.enum(["true", "false"]).optional(),      // only for edges leaving a condition node
});

export const WorkflowDef = z.object({
  name: z.string().min(1).max(120),
  nodes: z.array(WorkflowNode).min(1).max(50),
  edges: z.array(WorkflowEdge).max(200),
}).superRefine((wf, ctx) => {
  const ids = new Set(wf.nodes.map((n) => n.id));
  if (ids.size !== wf.nodes.length) ctx.addIssue({ code: "custom", message: "duplicate node id" });
  for (const e of wf.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) ctx.addIssue({ code: "custom", message: `edge ${e.source}->${e.target} points at a missing node` });
  }
  const indeg = new Map(wf.nodes.map((n) => [n.id, 0]));
  for (const e of wf.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let seen = 0;
  while (queue.length) {
    const id = queue.pop()!; seen++;
    for (const e of wf.edges.filter((x) => x.source === id)) {
      const d = (indeg.get(e.target) ?? 0) - 1; indeg.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  if (seen !== wf.nodes.length) ctx.addIssue({ code: "custom", message: "workflow contains a cycle" });
});

export type WorkflowDef = z.infer<typeof WorkflowDef>;
export type WorkflowNode = z.infer<typeof WorkflowNode>;
```

## Step 3: The Runner

Each pass picks every node whose incoming edges are settled and runs them with `Promise.all`. A condition node produces `{ result: boolean }`; edges carry `branch: "true" | "false"`, and a node whose only incoming branches were not taken is skipped. A node with several active incoming edges runs once any of them is active, so joins behave like "any".

```typescript
// src/engine.ts
import type { WorkflowDef, WorkflowNode } from "./schema.js";

export interface Deps {
  llm(node: Extract<WorkflowNode, { type: "llm" }>, system: string | undefined, prompt: string): Promise<string>;
  http(url: string, method: string, body?: string): Promise<{ status: number; body: string }>;
}
export type Outputs = Record<string, any>;

const get = (obj: any, path: string) => path.split(".").reduce((v, k) => v?.[k], obj);

// `esc` encodes each inserted value for where it lands (URL, JSON body), so model or ticket text cannot change the structure
export const interpolate = (tpl: string, scope: Outputs, esc: (s: string) => string = (s) => s) =>
  tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, p) => {
    const v = get(scope, p);
    return esc(v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  });
const inUrl = encodeURIComponent, inJson = (s: string) => JSON.stringify(s).slice(1, -1);

function check(c: { path: string; op: string; value: string | number | boolean }, scope: Outputs): boolean {
  const v = get(scope, c.path);
  switch (c.op) {
    case "eq": return v === c.value;
    case "neq": return v !== c.value;
    case "contains": return String(v ?? "").includes(String(c.value));
    case "gt": return Number(v) > Number(c.value);
    default: return Number(v) < Number(c.value);
  }
}

async function runNode(n: WorkflowNode, scope: Outputs, deps: Deps): Promise<any> {
  switch (n.type) {
    case "input": return scope.input;
    case "llm": {
      const text = await deps.llm(n, n.system && interpolate(n.system, scope), interpolate(n.prompt, scope));
      return n.json ? JSON.parse(text) : { text };
    }
    case "condition": return { result: check(n.condition, scope) };
    case "http": return deps.http(interpolate(n.url, scope, inUrl), n.method, n.body && interpolate(n.body, scope, inJson));
    case "output": return { text: interpolate(n.template, scope) };
  }
}

/** Runs the graph in waves: every node whose inputs are settled runs in parallel. */
export async function runWorkflow(wf: WorkflowDef, input: Record<string, unknown>, deps: Deps) {
  const scope: Outputs = { input };
  const done = new Set<string>(), skipped = new Set<string>();
  const incoming = (id: string) => wf.edges.filter((e) => e.target === id);
  const active = (e: WorkflowDef["edges"][number]) =>
    done.has(e.source) && (e.branch === undefined || String(scope[e.source]?.result) === e.branch);

  while (done.size + skipped.size < wf.nodes.length) {
    const ready = wf.nodes.filter((n) => !done.has(n.id) && !skipped.has(n.id)).filter((n) => incoming(n.id).every((e) => done.has(e.source) || skipped.has(e.source)));
    const toRun = ready.filter((n) => incoming(n.id).length === 0 || incoming(n.id).some(active));
    for (const n of ready) if (!toRun.includes(n)) skipped.add(n.id);   // every incoming branch was not taken
    const results = await Promise.all(toRun.map(async (n) => [n.id, await runNode(n, scope, deps)] as const));
    for (const [id, out] of results) { scope[id] = out; done.add(id); }
    if (ready.length === 0) throw new Error("no runnable node");
  }
  return scope;
}
```

## Step 4: The API

Redis only guards against duplicate triggers (`SET ... EX 3600 NX`); the run is synchronous, fine for short chains. For long flows, move `runWorkflow` into a queue worker.
Values inserted into an HTTP node's `url` are URL-encoded and values in its `body` are JSON-escaped, so write the body as a JSON template with placeholders only inside strings; a model reply cannot add fields or path segments. A failed run releases its idempotency key so the sender can retry.

```typescript
// src/server.ts
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { zValidator } from "@hono/zod-validator";
import { serve } from "@hono/node-server";
import { z } from "zod";
import pg from "pg";
import { Redis } from "ioredis";
import Anthropic from "@anthropic-ai/sdk";
import { WorkflowDef } from "./schema.js";
import { runWorkflow, type Deps } from "./engine.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
const anthropic = new Anthropic();                       // reads ANTHROPIC_API_KEY
const allowedHosts = new Set((process.env.HTTP_ALLOWED_HOSTS ?? "").split(",").filter(Boolean));

const deps: Deps = {
  async llm(node, system, prompt) {
    const msg = await anthropic.messages.create({
      model: node.model ?? process.env.LLM_MODEL!, max_tokens: 1024, system,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  },
  async http(url, method, body) {
    if (!allowedHosts.has(new URL(url).host)) throw new Error(`host not allowed: ${url}`);   // no SSRF
    const r = await fetch(url, { method, body, headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    return { status: r.status, body: await r.text() };
  },
};

const app = new Hono();
app.use("*", bearerAuth({ token: process.env.API_TOKEN! }));

app.post("/workflows", zValidator("json", WorkflowDef), async (c) => {
  const wf = c.req.valid("json");
  const { rows } = await pool.query("INSERT INTO workflows (name, definition) VALUES ($1, $2) RETURNING id", [wf.name, wf]);
  return c.json({ id: rows[0].id }, 201);
});

app.post("/workflows/:id/runs", zValidator("json", z.object({ input: z.record(z.string(), z.unknown()) })), async (c) => {
  const { rows: [row] } = await pool.query("SELECT definition FROM workflows WHERE id = $1", [c.req.param("id")]);
  if (!row) return c.json({ error: "not found" }, 404);
  const key = c.req.header("idempotency-key");           // webhook senders retry; run once per key
  if (key && !(await redis.set(`run:${c.req.param("id")}:${key}`, "1", "EX", 3600, "NX"))) return c.json({ error: "duplicate" }, 409);
  const wf = WorkflowDef.parse(row.definition);
  let status = "completed", scope: Record<string, unknown> = {}, error: string | undefined;
  try { scope = await runWorkflow(wf, c.req.valid("json").input, deps); }
  catch (e) { status = "failed"; error = (e as Error).message; if (key) await redis.del(`run:${c.req.param("id")}:${key}`); }   // let the sender retry a failed run
  await pool.query("INSERT INTO workflow_runs (workflow_id, status, outputs, error) VALUES ($1, $2, $3, $4)", [c.req.param("id"), status, scope, error]);
  return c.json({ status, outputs: scope, error });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3300), hostname: "127.0.0.1" });
```

Run it with `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `API_TOKEN`, `LLM_MODEL` (an id from the Anthropic models page, for example `claude-haiku-5-5` for cheap classification) and `HTTP_ALLOWED_HOSTS` set in the environment; the server listens on 127.0.0.1 only, so put your TLS proxy in front of it.

## Step 5: A Real Workflow

Marko's ticket triage, as the JSON the canvas would save. `classify` and `summary` run in parallel; negative tickets escalate, others get an automatic route.

```json
{
  "name": "ticket-triage",
  "nodes": [
    { "id": "in", "type": "input", "label": "Ticket" },
    { "id": "classify", "type": "llm", "label": "Classify", "json": true,
      "system": "Reply with JSON only: {\"sentiment\": \"negative|neutral|positive\", \"topic\": string}",
      "prompt": "Classify this support ticket:\n{{input.text}}" },
    { "id": "summary", "type": "llm", "label": "Summary", "prompt": "Summarize in one sentence:\n{{input.text}}" },
    { "id": "neg", "type": "condition", "label": "Negative?",
      "condition": { "path": "classify.sentiment", "op": "eq", "value": "negative" } },
    { "id": "esc", "type": "output", "label": "Escalate", "template": "ESCALATE {{classify.topic}}: {{input.text}}" },
    { "id": "auto", "type": "output", "label": "Auto-route", "template": "AUTO {{classify.topic}}" },
    { "id": "digest", "type": "output", "label": "Digest", "template": "{{summary.text}}" }
  ],
  "edges": [
    { "source": "in", "target": "classify" }, { "source": "in", "target": "summary" },
    { "source": "classify", "target": "neg" },
    { "source": "neg", "target": "esc", "branch": "true" },
    { "source": "neg", "target": "auto", "branch": "false" },
    { "source": "summary", "target": "digest" }
  ]
}
```

```bash
curl -s -X POST http://127.0.0.1:3300/workflows/$WORKFLOW_ID/runs -H "Idempotency-Key: ticket-48213" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"input": {"text": "I was charged twice and nobody answers my emails."}}'
```

A second request with the same `Idempotency-Key` within an hour returns 409 instead of running again. Ticket text is untrusted: it is inserted into the prompt of an LLM node, so keep instructions in `system`, and let nothing the model returns reach a shell, a query or a URL without the checks above.

## Real-World Example
Marko's team keeps one definition per task in PostgreSQL, and operations staff edit prompts and thresholds through the canvas, which saves through `POST /workflows`. An engineer is needed only for a new kind of node. The schema rejects a bad definition before it runs, and stored `jsonb` runs let a support lead see each node's output.

## Related Skills
- **typescript**: strict typing of the schema and runner
- **zod**: definition validation, discriminated node types and the cycle check
- **hono**: the authenticated HTTP API
- **postgresql**: definitions and run history as `jsonb`
- **redis**: idempotency keys for webhook triggers
- [xyflow](/skills/xyflow) — the React Flow canvas for the front end: custom step nodes, handles, and saving the graph as JSON for this backend
