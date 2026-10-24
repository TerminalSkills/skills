---
title: Build an Embeddable Chat Widget
slug: build-embeddable-chat-widget
description: Build an embeddable AI chat widget with iframe isolation, theme customization, conversation persistence, knowledge base integration, and analytics for customer-facing support.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - chat
  - widget
  - embeddable
  - ai
  - customer-support
---

# Build an Embeddable Chat Widget

## The Problem

Farah leads product at a 20-person AI startup. Customers want to embed their AI chatbot on their own websites. Current integration requires a React component — only works for React apps, adds a large bundle to the customer's page, and styling conflicts with host pages. Customers on WordPress, Shopify, and static sites can't integrate at all. They need a universal embed: one script tag, works on any website, iframe-isolated, customizable theme to match the host brand, persists conversations across page navigations, and sends analytics back.

## The Solution

Three pieces, each small:

1. A **loader script** (a few KB, one `<script>` tag for the customer) that draws a launcher button and an iframe, and nothing else.
2. A **chat page** served from your own origin and loaded in the iframe, which holds all UI code, so host-page CSS and JS cannot touch it.
3. A **small API** (Hono) that validates widget configuration and messages with zod, stores conversations in PostgreSQL, and keeps config cache and counters in Redis.

Two things are easy to get wrong. The widget config comes from customers, so every value that reaches the loader (colors, fonts, URL patterns) must be validated and never pasted into generated JavaScript or CSS as raw text. And the loader must only trust `postMessage` events that come from its own iframe.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install hono @hono/node-server pg ioredis zod @anthropic-ai/sdk
npm install -D typescript tsx @types/node @types/pg
```

### Step 2: Validate the widget configuration

```typescript
// src/widget/schema.ts
import { z } from "zod";

export const WidgetConfig = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  theme: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.string().regex(/^[\w\s,-]{1,100}$/),
    borderRadius: z.number().int().min(0).max(32),
    position: z.enum(["bottom-right", "bottom-left"]),
    headerTitle: z.string().max(60),
  }),
  behavior: z.object({
    autoOpen: z.boolean(),
    autoOpenDelayMs: z.number().int().min(0).max(60_000),
    showOnPages: z.array(z.string().regex(/^\/[\w\-./*]*$/)).max(20), // e.g. "/pricing*"
    hideOnMobile: z.boolean(),
  }),
  allowedOrigins: z.array(z.string().url()).max(20), // sites that may embed the widget
});
export type WidgetConfig = z.infer<typeof WidgetConfig>;

export const ChatInput = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/).optional(), // omitted on the first message
  message: z.string().trim().min(1).max(2000),
});
```

### Step 3: Generate the loader

```typescript
// src/widget/loader.ts: the JS served to customer sites
import type { WidgetConfig } from "./schema";

// "/docs*" becomes the regex source "\/docs.*"; every other special character is escaped
const globToRegexSource = (g: string) =>
  g.replace(/[.+?^${}()|[\]\\\/]/g, "\\$&").replace(/\*/g, ".*");

export function buildLoader(config: WidgetConfig, appUrl: string): string {
  const data = {
    id: config.id,
    appUrl,
    theme: config.theme,
    autoOpen: config.behavior.autoOpen,
    autoOpenDelayMs: config.behavior.autoOpenDelayMs,
    hideOnMobile: config.behavior.hideOnMobile,
    pages: config.behavior.showOnPages.map(globToRegexSource),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c"); // data can never close a script element

  return `(function () {
  var c = ${json};
  if (window.__chatWidgetLoaded) return;
  window.__chatWidgetLoaded = true;
  if (c.pages.length && !c.pages.some(function (p) { return new RegExp("^" + p + "$").test(location.pathname); })) return;
  if (c.hideOnMobile && innerWidth < 768) return;

  var side = c.theme.position === "bottom-left" ? "left" : "right";
  var btn = document.createElement("button");
  btn.type = "button"; btn.setAttribute("aria-label", "Open chat");
  var s = btn.style;
  s.position = "fixed"; s[side] = "20px"; s.bottom = "20px"; s.width = s.height = "56px"; s.borderRadius = "50%";
  s.border = "0"; s.cursor = "pointer"; s.zIndex = "2147483000"; s.background = c.theme.primaryColor; s.fontSize = "24px";
  btn.textContent = "\u{1F4AC}";

  var box = document.createElement("div");
  var b = box.style;
  b.position = "fixed"; b[side] = "20px"; b.bottom = "90px"; b.width = "380px"; b.maxWidth = "calc(100vw - 40px)"; b.height = "600px";
  b.maxHeight = "calc(100vh - 120px)"; b.borderRadius = c.theme.borderRadius + "px"; b.overflow = "hidden";
  b.boxShadow = "0 8px 32px rgba(0,0,0,.15)"; b.zIndex = "2147483000"; b.display = "none";

  var frame = document.createElement("iframe");
  frame.src = c.appUrl + "/widget/" + encodeURIComponent(c.id) + "/chat";
  frame.title = "Chat"; frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  frame.style.cssText = "width:100%;height:100%;border:0";
  box.appendChild(frame);

  var open = false;
  function toggle() {
    open = !open;
    box.style.display = open ? "block" : "none";
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  }
  btn.addEventListener("click", toggle);

  // Only accept messages from our own iframe, and only known types
  addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow || e.origin !== c.appUrl) return;
    if (e.data && e.data.type === "widget:close" && open) toggle();
  });

  document.body.appendChild(box);
  document.body.appendChild(btn);
  if (c.autoOpen) setTimeout(function () { if (!open) toggle(); }, c.autoOpenDelayMs);
})();`;
}
```

The customer pastes one line into their site: `<script src="https://chat.example.com/widget/<widget-id>/loader.js" async></script>`.

`allow-same-origin` here applies to the iframe's own origin (your app), so the chat page can use `localStorage`; the sandbox still blocks top-navigation and popups. Browsers partition that storage per embedding site, so a visitor keeps their conversation while moving between pages of the same customer site, but not across different customer sites.

### Step 4: Serve the API

```typescript
// src/widget/api.ts
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { Redis } from "ioredis";
import Anthropic from "@anthropic-ai/sdk";
import { ChatInput, WidgetConfig } from "./schema";
import { buildLoader } from "./loader";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const APP_URL = process.env.APP_URL!; // origin only, e.g. https://chat.example.com (no trailing slash)

async function getConfig(id: string): Promise<WidgetConfig | null> {
  const hit = await redis.get(`widget:config:${id}`);
  if (hit) return WidgetConfig.parse(JSON.parse(hit));
  const { rows } = await pool.query("SELECT config FROM widget_configs WHERE id = $1", [id]); // jsonb
  if (!rows[0]) return null;
  const config = WidgetConfig.parse({ ...rows[0].config, id });
  await redis.setex(`widget:config:${id}`, 300, JSON.stringify(config));
  return config;
}

const app = new Hono();

app.get("/widget/:id/loader.js", async (c) => {
  const config = await getConfig(c.req.param("id"));
  if (!config) return c.notFound();
  return c.body(buildLoader(config, APP_URL), 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
});

// The chat page is meant to be framed, but only by the sites the customer listed
app.use("/widget/:id/chat", async (c, next) => {
  const config = await getConfig(c.req.param("id"));
  await next();
  const origins = (config?.allowedOrigins ?? []).map((o) => new URL(o).origin);
  c.header("Content-Security-Policy", `frame-ancestors ${origins.join(" ") || "'none'"}`);
});

// A minimal chat page for the iframe. Replies are inserted with textContent, never as HTML.
app.get("/widget/:id/chat", (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px system-ui;display:flex;flex-direction:column;height:100vh">
<div id="log" style="flex:1;overflow:auto;padding:12px"></div>
<form id="f" style="display:flex"><input id="m" maxlength="2000" required style="flex:1;padding:12px"><button>Send</button></form>
<script>
var id = ${JSON.stringify(c.req.param("id")).replace(/</g, "\\u003c")}, sid = localStorage.getItem("sid:" + id);
function add(who, t) { var d = document.createElement("p"); d.textContent = who + ": " + t; log.appendChild(d); log.scrollTop = 1e9; }
f.onsubmit = async function (e) {
  e.preventDefault(); var text = m.value; m.value = ""; add("you", text);
  var r = await fetch("/widget/" + encodeURIComponent(id) + "/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sid || undefined, message: text }) });
  var j = await r.json(); if (!r.ok) return add("error", j.error);
  sid = j.sessionId; localStorage.setItem("sid:" + id, sid); add("bot", j.reply);
};
</script>`)
);

app.post("/widget/:id/messages", async (c) => {
  const id = c.req.param("id");
  const config = await getConfig(id);
  if (!config) return c.notFound();

  const parsed = ChatInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);

  // Session ids are unguessable bearer tokens issued by the server
  const sessionId = parsed.data.sessionId ?? randomBytes(32).toString("base64url");
  if (parsed.data.sessionId) {
    const known = await pool.query("SELECT 1 FROM widget_messages WHERE widget_id = $1 AND session_id = $2 LIMIT 1", [id, sessionId]);
    if (!known.rowCount) return c.json({ error: "unknown session" }, 404);
  }

  let reply: string;
  try { reply = await generateReply(id, sessionId, parsed.data.message, config); }
  catch { return c.json({ error: "the assistant is unavailable, try again" }, 502); }
  await pool.query(
    `INSERT INTO widget_messages (widget_id, session_id, role, content) VALUES ($1,$2,'user',$3), ($1,$2,'assistant',$4)`,
    [id, sessionId, parsed.data.message, reply]
  );

  await redis.sadd(`widget:sessions:${id}`, sessionId);
  await redis.hincrby(`widget:stats:${id}`, "messages", 1);
  return c.json({ sessionId, reply });
});

app.get("/widget/:id/messages", async (c) => {
  const sessionId = c.req.query("sessionId") ?? "";
  const sql = "SELECT role, content, created_at FROM widget_messages WHERE widget_id = $1 AND session_id = $2 ORDER BY id";
  return c.json((await pool.query(sql, [c.req.param("id"), sessionId])).rows);
});

app.get("/widget/:id/stats", async (c) => {
  // Put real authentication in front of this route; it is for the widget owner
  const id = c.req.param("id");
  const [sessions, stats] = await Promise.all([redis.scard(`widget:sessions:${id}`), redis.hgetall(`widget:stats:${id}`)]);
  const messages = Number(stats.messages ?? 0), avg = sessions ? messages / sessions : 0;
  return c.json({ sessions, messages, avgMessagesPerSession: avg });
});

// Last 20 stored messages (10 user/assistant pairs) give the model the conversation so far
async function generateReply(widgetId: string, sessionId: string, message: string, config: WidgetConfig): Promise<string> {
  const { rows } = await pool.query(
    "SELECT role, content FROM (SELECT * FROM widget_messages WHERE widget_id = $1 AND session_id = $2 ORDER BY id DESC LIMIT 20) t ORDER BY id",
    [widgetId, sessionId]
  );
  const res = await anthropic.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    system: `You are the support assistant "${config.theme.headerTitle}". Answer briefly, and say so when you do not know.`,
    messages: [...rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string })), { role: "user", content: message }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

export default app;
```

The table behind it:

```sql
CREATE TABLE widget_configs (id text PRIMARY KEY, config jsonb NOT NULL);
CREATE TABLE widget_messages (id bigserial PRIMARY KEY, widget_id text NOT NULL, session_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON widget_messages (widget_id, session_id, created_at);
```

Before launch, add per-IP and per-widget rate limiting on `POST /widget/:id/messages`: every message costs one model call. The chat page calls the API on its own origin, so no CORS is needed. Add retrieval over the customer's knowledge base to `generateReply` when you have one.

### Step 5: Check it

Set `ANTHROPIC_API_KEY`, serve the loader and run `node --check` on the response to confirm it parses. Post a message to `/widget/<id>/messages` and confirm that `reply` is a model answer and the same `sessionId` continues the conversation. Then open a static HTML page with the snippet from a different origin than your app and confirm that the button appears, the iframe loads, and the chat page is refused from a site not in `allowedOrigins`.

## Real-World Example

Farah's team gives each customer one line of HTML. A WordPress customer pastes the snippet into a footer widget area, a Shopify customer into the theme layout. The host page loads only the small loader; the chat UI and its CSS live in the iframe, so the host's stylesheets cannot restyle it. Each customer sets the color, position and the pages where the widget appears in the dashboard; the config is validated by zod before it is stored, so a customer cannot inject script into other customers' pages or their own visitors' browsers through a theme field.

## Related Skills

- `hono` for the loader, chat and stats routes
- `zod` for validating widget configuration and chat input
- `postgresql` for conversations
- `redis` for config cache and counters
- `typescript` for the typed modules
