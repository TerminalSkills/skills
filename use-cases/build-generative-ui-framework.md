---
title: Build a Generative UI Framework
slug: build-generative-ui-framework
description: Build a generative UI framework that renders structured LLM output into interactive components — charts, forms, tables, and cards — with streaming support, theming, and action handlers.
skills:
  - typescript
  - redis
  - hono
  - zod
  - a2ui
category: data-ai
tags:
  - generative-ui
  - llm
  - components
  - streaming
  - ai-interface
---

# Build a Generative UI Framework

## The Problem

Finn leads product at a 15-person AI startup. Their chatbot returns walls of text: markdown tables that don't render, JSON blobs users can't parse, and lists of numbers that should be charts. Users want clickable cards, tables, charts and inline forms. Formatting model output into UI by hand for every response type does not scale, and rendering whatever the model wrote straight into the page is a security hole.

## The Solution

Have the model emit small JSON components instead of prose, validate every one against a schema, and render only what validates. Four pieces, each with its own skill:

- **zod** defines the component schemas and rejects anything else
- **typescript** types the renderer from those schemas
- **hono** serves the stream and the action endpoint
- **redis** remembers which actions a session was actually shown

## Step-by-Step Walkthrough

### Step 1: Define and render components safely

```bash
mkdir gen-ui && cd gen-ui
npm init -y && npm pkg set type=module
npm i zod hono @hono/node-server ioredis
npm i -D typescript tsx @types/node
```

Use zod 4: `z.record()` takes a key schema and a value schema. Everything the model writes is untrusted input, so the renderer escapes every value, and the schemas accept only the fields the renderer knows. Unknown or invalid output degrades to escaped text.

```typescript
// engine.ts
import { z } from "zod";

const Action = z.object({
  label: z.string(),
  action: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  variant: z.enum(["primary", "secondary", "danger"]).default("primary"),
});

const Card = z.object({
  type: z.literal("card"),
  title: z.string(),
  body: z.string(),
  actions: z.array(Action).default([]),
});

const Table = z.object({
  type: z.literal("table"),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.record(z.string(), z.unknown())),
});

const Chart = z.object({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]),
  xKey: z.string(),
  yKey: z.string(),
  data: z.array(z.record(z.string(), z.unknown())),
});

const Form = z.object({
  type: z.literal("form"),
  submitAction: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  fields: z.array(
    z.object({
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      label: z.string(),
      kind: z.enum(["text", "number", "email", "select", "toggle"]),
      options: z.array(z.string()).default([]),
    }),
  ),
});

const Text = z.object({ type: z.literal("text"), content: z.string() });

export const Component = z.discriminatedUnion("type", [Card, Table, Chart, Form, Text]);
export type UIComponent = z.infer<typeof Component>;

/** Validate one model-produced object; anything invalid degrades to plain text. */
export function parseComponent(raw: unknown): UIComponent {
  const r = Component.safeParse(raw);
  return r.success ? r.data : { type: "text", content: JSON.stringify(raw) };
}

// Everything the model wrote is untrusted: escape it before it reaches HTML.
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderToHTML(c: UIComponent): string {
  switch (c.type) {
    case "card":
      return `<div class="gui-card"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>${c.actions
        .map((a) => `<button class="gui-btn gui-btn-${a.variant}" data-action="${esc(a.action)}">${esc(a.label)}</button>`)
        .join("")}</div>`;
    case "table":
      return `<table class="gui-table"><thead><tr>${c.columns.map((k) => `<th>${esc(k.label)}</th>`).join("")}</tr></thead><tbody>${c.rows
        .map((row) => `<tr>${c.columns.map((k) => `<td>${esc(row[k.key])}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
    case "chart": // the browser draws it with a chart library, reading this config
      return `<div class="gui-chart" data-config="${esc(JSON.stringify({ type: c.chartType, x: c.xKey, y: c.yKey, data: c.data }))}"></div>`;
    case "form":
      return `<form class="gui-form" data-action="${esc(c.submitAction)}">${c.fields
        .map((f) =>
          f.kind === "select"
            ? `<label>${esc(f.label)}<select name="${esc(f.name)}">${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label>`
            : f.kind === "toggle"
              ? `<label><input type="checkbox" name="${esc(f.name)}"> ${esc(f.label)}</label>`
              : `<label>${esc(f.label)}<input type="${f.kind}" name="${esc(f.name)}"></label>`,
        )
        .join("")}<button type="submit" class="gui-btn gui-btn-primary">Submit</button></form>`;
    case "text":
      return `<div class="gui-text">${esc(c.content)}</div>`;
  }
}

/** Turns streamed text into components, one JSON object per line (NDJSON). */
export function createLineParser() {
  let buffer = "";
  const emit = (line: string) => (line.trim() ? [parseComponent(safeJson(line))] : []);
  return {
    push(chunk: string): UIComponent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.flatMap(emit);
    },
    flush: (): UIComponent[] => {
      const rest = buffer;
      buffer = "";
      return emit(rest);
    },
  };
}
function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return { type: "text", content: s }; }
}
```

Never interpolate model output into HTML unescaped: a card title of `<img src=x onerror=...>` would otherwise run script in every viewer's browser. The renderer above emits it as inert text. URLs are left out of the schema on purpose; if you add image or link components, allow only `https:` URLs.

### Step 2: Stream components over Hono and track actions in Redis

The model is asked to answer with one JSON component per line (NDJSON). Chunks rarely end on a line boundary, so the parser buffers until a newline and emits each finished component immediately, which is what makes the UI appear piece by piece. Replace `llmStream` with your provider's streaming call and put the component format in the system prompt.

```typescript
// server.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { Redis } from "ioredis";
import { z } from "zod";
import { createLineParser, renderToHTML, parseComponent, type UIComponent } from "./engine.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const app = new Hono();

// Stand-in for your model call: yield text chunks that contain one JSON component per line.
async function* llmStream(prompt: string): AsyncGenerator<string> {
  yield '{"type":"card","title":"Q3 revenue","body":"Up 12% on Q2","actions":[{"label":"Drill down","action":"drill"}]}\n{"type":"chart","chartType":"bar",';
  yield '"xKey":"month","yKey":"revenue","data":[{"month":"Jul","revenue":41},{"month":"Aug","revenue":44}]}\n';
}

// POST /chat -> server-sent events, one rendered component per event
app.post("/chat", async (c) => {
  const { sessionId, prompt } = z
    .object({ sessionId: z.string().min(8), prompt: z.string().min(1) })
    .parse(await c.req.json());
  return streamSSE(c, async (stream) => {
    const parser = createLineParser();
    const send = async (comps: UIComponent[]) => {
      for (const comp of comps) {
        // Remember which actions this session may trigger, for 15 minutes.
        const ids = comp.type === "card" ? comp.actions.map((a) => a.action) : comp.type === "form" ? [comp.submitAction] : [];
        for (const id of ids) await redis.set(`gui:action:${sessionId}:${id}`, "1", "EX", 900);
        await stream.writeSSE({ event: "component", data: renderToHTML(comp) });
      }
    };
    for await (const chunk of llmStream(prompt)) await send(parser.push(chunk));
    await send(parser.flush());
    await stream.writeSSE({ event: "done", data: "" });
  });
});

// POST /actions/:sessionId/:actionId -> only actions this session was shown, once each
app.post("/actions/:sessionId/:actionId", async (c) => {
  const { sessionId, actionId } = c.req.param();
  if (!(await redis.getdel(`gui:action:${sessionId}:${actionId}`))) return c.json({ error: "Action expired" }, 410);
  const payload = await c.req.json().catch(() => ({}));
  const reply = parseComponent({ type: "text", content: `Received ${actionId}: ${JSON.stringify(payload)}` });
  return c.json({ html: renderToHTML(reply) });
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8787) });
```

Each action is stored with a 15-minute expiry and consumed with `GETDEL`, so a button works once, only for the session that was shown it, and a forged `actionId` gets a 410. The server binds to `127.0.0.1`; put it behind your own auth before exposing it, and derive `sessionId` from the logged-in session, not from the request body.

### Step 3: Run it

```bash
npx tsc --noEmit                      # types check
REDIS_URL=redis://127.0.0.1:6379 npx tsx server.ts
```

```console
$ curl -N -X POST 127.0.0.1:8787/chat -H 'content-type: application/json' -d '{"sessionId":"sess-12345","prompt":"revenue by month"}'
event: component
data: <div class="gui-card"><h3>Q3 revenue</h3>...

event: component
data: <div class="gui-chart" data-config="{&#34;type&#34;:&#34;bar&#34;,...}"></div>

event: done
```

On the page, read the stream with `EventSource`-style SSE handling (a `fetch` reader, since this is a POST), append each `component` event's HTML to the message, draw `.gui-chart` elements with the chart library of your choice from their `data-config`, and send button clicks and form submissions to `/actions/:sessionId/:actionId`.

## Real-World Example

Finn's team replaced the markdown tables in their analytics chatbot with the four component types above. "Show me revenue by month" now arrives as a card followed by a chart that appears as soon as its line finishes streaming, and the feedback prompt is an inline form instead of a follow-up question. When the model once produced a malformed table, the schema check turned it into plain text instead of breaking the message, and the escaping meant a customer name containing HTML showed up as text rather than markup.

## Related Skills

- [zod](../skills/zod/SKILL.md): component schemas and validation
- [typescript](../skills/typescript/SKILL.md): typed renderer and strict compile checks
- [hono](../skills/hono/SKILL.md): the SSE and action endpoints
- [redis](../skills/redis/SKILL.md): per-session action expiry with `SET ... EX` and `GETDEL`
- [a2ui](../skills/a2ui/SKILL.md): choose it when the UI should be a declarative JSON protocol rendered by a client's own trusted component catalog (web or Flutter) rather than a framework you build yourself
