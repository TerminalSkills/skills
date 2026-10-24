---
title: Build Real-Time Collaboration Cursors
slug: build-real-time-collaboration-cursors
description: Build real-time collaboration with live cursors, presence awareness, selection highlighting, viewport tracking, and conflict-free cursor positioning for multiplayer applications.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - collaboration
  - real-time
  - cursors
  - presence
  - multiplayer
---

# Build Real-Time Collaboration Cursors

## The Problem

Lena leads product at a 25-person design tool company. Users can share documents but can't see each other's activity, so they edit the same section at once and overwrite each other's work. There is no way to know who is looking at what. Users are used to live cursors and presence indicators from Figma and Google Docs, and customers leave for tools that offer them. The team needs multiplayer cursors: see who is online, where their cursor is, what they have selected, and whether they have gone idle, without hammering the database on every mouse move.

## The Solution

The design splits data by how long it lives:

- **Cursor positions** are ephemeral. They are relayed over Redis pub/sub and never stored, because a position that is 200 ms old is worthless.
- **Presence** (name, color, selection, idle flag) is small, changes rarely and must survive a reconnect. It is stored in Redis with a TTL, so a crashed tab disappears on its own after 30 seconds.
- **Transport** is one WebSocket per user and document, served by [Hono](https://hono.dev) with `@hono/node-ws`. Redis pub/sub lets you run several server instances: each instance subscribes once and relays to its own sockets.
- **Validation**: every client message goes through a [Zod](https://zod.dev) schema, so a malformed message is dropped before it reaches Redis or other users.

## Step 1: Install the packages

```bash
npm install hono @hono/node-server @hono/node-ws ioredis zod
npm install -D typescript @types/node
npm pkg set type=module
```

This page was checked against `hono` 4.13, `@hono/node-ws` 1.3, `ioredis` 6 and `zod` 4. `tsc --noEmit` is clean with TypeScript's `strict` mode on `NodeNext` modules.

## Step 2: Write the cursor server

The server expects a session stored in Redis under `session:<token>` as `{"userId","name"}`. In a real app your login flow writes it, with a short TTL. The server only ever trusts the identity from that session, never a `userId` sent in a message.

```typescript
// server.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import { Redis } from "ioredis";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!); // commands + publishing
const sub = new Redis(process.env.REDIS_URL!);   // a subscribed connection can't run commands

const PALETTE = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];
const PRESENCE_TTL = 30; // seconds; the client heartbeat renews it

// What a client may send. Identity never comes from the message, only from the session.
const ClientMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cursor"), x: z.number().finite(), y: z.number().finite(), elementId: z.string().max(64).optional() }),
  z.object({ type: z.literal("selection"), ids: z.array(z.string().max(64)).max(200) }),
  z.object({ type: z.literal("heartbeat"), idle: z.boolean().default(false) }),
]);

type Peer = { ws: WSContext; userId: string };
const peers = new Map<string, Set<Peer>>(); // docId -> sockets connected to THIS server

// Every server instance subscribes once and relays to its own sockets.
await sub.psubscribe("collab:*");
sub.on("pmessage", (_pattern, channel, raw) => {
  const docId = channel.slice("collab:".length);
  const { from, payload } = JSON.parse(raw) as { from: string; payload: unknown };
  for (const p of peers.get(docId) ?? []) if (p.userId !== from) p.ws.send(JSON.stringify(payload));
});
const publish = (docId: string, from: string, payload: object) =>
  redis.publish(`collab:${docId}`, JSON.stringify({ from, payload }));

const presenceKey = (docId: string, userId: string) => `presence:${docId}:${userId}`;

// Members whose last heartbeat is inside the TTL window
async function members(docId: string) {
  await redis.zremrangebyscore(`room:${docId}`, "-inf", Date.now() - PRESENCE_TTL * 1000); // drop crashed tabs
  const ids = await redis.zrangebyscore(`room:${docId}`, Date.now() - PRESENCE_TTL * 1000, "+inf");
  if (!ids.length) return [];
  const rows = await redis.mget(ids.map((id) => presenceKey(docId, id)));
  return rows.filter((r): r is string => r !== null).map((r) => JSON.parse(r));
}

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.get("/ws/:docId", upgradeWebSocket(async (c) => {
  const docId = c.req.param("docId") as string;
  // Browsers can't set headers on a WebSocket, so the token rides in the query string.
  // Use a short-lived, single-purpose token and keep query strings out of access logs.
  const session = await redis.get(`session:${c.req.query("token") ?? ""}`);
  const user = session ? (JSON.parse(session) as { userId: string; name: string }) : null;
  let peer: Peer | undefined;

  return {
    async onOpen(_evt, ws) {
      if (!user) return ws.close(4401, "unauthorized");
      peer = { ws, userId: user.userId };
      if (!peers.has(docId)) peers.set(docId, new Set());
      peers.get(docId)!.add(peer);

      const existing = await members(docId);
      const color = PALETTE[existing.length % PALETTE.length];
      const me = { userId: user.userId, name: user.name, color, selection: [] as string[], idle: false };
      await redis.set(presenceKey(docId, user.userId), JSON.stringify(me), "EX", PRESENCE_TTL);
      await redis.zadd(`room:${docId}`, Date.now(), user.userId);
      ws.send(JSON.stringify({ type: "welcome", me, others: existing.filter((m) => m.userId !== user.userId) }));
      await publish(docId, user.userId, { type: "joined", user: me });
    },

    async onMessage(evt, _ws) {
      if (!user) return;
      let json: unknown;
      try { json = JSON.parse(String(evt.data)); } catch { return; } // not JSON: drop it
      const parsed = ClientMsg.safeParse(json);
      if (!parsed.success) return;
      const msg = parsed.data;
      const key = presenceKey(docId, user.userId);
      const stored = await redis.get(key);
      if (!stored) return;
      const me = JSON.parse(stored);

      if (msg.type === "cursor") {
        // Cursor positions are ephemeral: relay only, never store them.
        return void publish(docId, user.userId, { type: "cursor", userId: user.userId, x: msg.x, y: msg.y, elementId: msg.elementId });
      }
      if (msg.type === "selection") me.selection = msg.ids;
      if (msg.type === "heartbeat") me.idle = msg.idle;
      await redis.set(key, JSON.stringify(me), "EX", PRESENCE_TTL);
      await redis.zadd(`room:${docId}`, Date.now(), user.userId);
      if (msg.type === "selection") await publish(docId, user.userId, { type: "selection", userId: user.userId, ids: msg.ids });
      if (msg.type === "heartbeat") await publish(docId, user.userId, { type: "idle", userId: user.userId, idle: msg.idle });
    },

    async onClose() {
      if (!user || !peer) return;
      peers.get(docId)?.delete(peer);
      await redis.del(presenceKey(docId, user.userId));
      await redis.zrem(`room:${docId}`, user.userId);
      await publish(docId, user.userId, { type: "left", userId: user.userId });
    },
  };
}));

// Bind to loopback; put your reverse proxy (TLS) in front for public traffic.
injectWebSocket(serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787), hostname: "127.0.0.1" }));
```

Run it with `REDIS_URL=redis://127.0.0.1:6379 node --experimental-strip-types server.ts`. Node 24 strips types natively; on older Node use `tsx server.ts`. A Redis server on `127.0.0.1` with a password or ACL user is the minimum for production.

## Step 3: Throttle on the client

Throttle on the client, not the server. Sending a message per `mousemove` (often 100+ per second) is wasted bandwidth; 30 per second looks smooth.

```typescript
const ws = new WebSocket(`wss://app.example.com/ws/${docId}?token=${wsToken}`);
let last = 0;
canvas.addEventListener("pointermove", (e) => {
  const now = performance.now();
  if (now - last < 33 || ws.readyState !== WebSocket.OPEN) return;
  last = now;
  ws.send(JSON.stringify({ type: "cursor", x: e.offsetX, y: e.offsetY }));
});
// Renew presence every 10 s; set idle after 60 s without input
setInterval(() => ws.send(JSON.stringify({ type: "heartbeat", idle: Date.now() - lastInput > 60_000 })), 10_000);
```

Draw each remote cursor with the `color` and `name` from the `welcome` and `joined` messages, and update it on `cursor` messages.

## What was verified

The server above was compiled with `tsc --noEmit` and run against a Redis 8 container bound to `127.0.0.1`. Two WebSocket clients joined one document: the second received the first user's presence in `welcome`; cursor and selection messages reached only the other user; a message with `"x":"bad"` was dropped by Zod; a bad token was closed with code 4401; after one client disconnected, the other received `left` and the room set held only the remaining user. The client snippet in Step 3 was not run in a browser.

## Real-World Example

Lena's team ships this behind a feature flag to one customer with 10 designers per document. The pieces map to what they see: colored cursors with name labels, selected elements outlined in the owner's color, avatars dimming after a minute idle, and a closed laptop disappearing from the room within 30 seconds because its presence key expired. Because cursor positions are never stored, Redis memory stays flat regardless of session length, and adding a second server instance needs no code change.

For simultaneous edits to the same text or shape, presence only warns users. Merging concurrent changes is a separate problem that needs a CRDT or operational transform library.

## Related Skills

- [typescript](/skills/typescript) - strict typing for messages and the server
- [redis](/skills/redis) - presence with TTLs, sorted sets and pub/sub fan-out
- [hono](/skills/hono) - WebSocket routes and the HTTP server
- [zod](/skills/zod) - validating every client message
