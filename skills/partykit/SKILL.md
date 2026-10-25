---
name: partykit
description: >-
  PartyKit and its successor PartyServer are libraries for building real-time
  multiplayer and collaborative apps on Cloudflare Durable Objects: each room
  is a server instance that handles WebSocket connections, broadcasts and
  storage. Use this skill when a user asks for live cursors, chat rooms,
  collaborative editing, real-time polls or any WebSocket sync, or needs to
  migrate off the hosted PartyKit platform, which shuts down on 23 October 2026.
license: Apache-2.0
compatibility: 'Node.js 22+ (wrangler and create-cloudflare require it), a Cloudflare account (the free Workers plan includes SQLite-backed Durable Objects)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/cloudflare/partykit
  tags: "partykit, realtime, multiplayer, websocket, cloudflare"
---

# PartyKit and PartyServer

## Overview

PartyKit started as a hosted platform (`*.partykit.dev`, `npx partykit deploy`). It is now run by Cloudflare, which maintains its successor **PartyServer** (`partyserver` on npm, repo cloudflare/partykit): a `Server` class on top of Cloudflare Durable Objects with rooms, connection lifecycle hooks, broadcasting and hibernation, deployed with `wrangler` to your own Cloudflare account.

**The hosted PartyKit platform is being shut down:** no new projects since 9 October 2026, deploys stop on 16 October, and the platform and its room data are deleted on 23 October 2026. `npx partykit deploy` to your own Cloudflare account also stops working that day. New projects must use PartyServer; existing ones should migrate (see below). The `partykit` CLI package was last published in May 2025.

Related packages: `partysocket` (client, with reconnect and buffering), `y-partyserver` (Yjs collaborative editing), `hono-party` (Hono middleware), `partywhen` (scheduled tasks).

## Instructions

1. Create a Worker project and install:

```bash
npm create cloudflare@latest chat-rooms
cd chat-rooms
npm install partyserver partysocket
```

2. Write the server. One class per kind of room; the room name comes from the URL.

```typescript
// src/server.ts
import { routePartykitRequest, Server } from "partyserver";
import type { Connection, ConnectionContext } from "partyserver";

type Env = { ChatRoom: DurableObjectNamespace<ChatRoom> };

export class ChatRoom extends Server<Env> {
  static options = { hibernate: true };

  async onStart() {
    // runs on first start and after waking from hibernation
    this.messages = (await this.ctx.storage.get<string[]>("messages")) ?? [];
  }
  messages: string[] = [];

  onConnect(conn: Connection, _ctx: ConnectionContext) {
    conn.send(JSON.stringify({ type: "history", messages: this.messages }));
  }

  async onMessage(sender: Connection, message: string) {
    this.messages = [...this.messages.slice(-99), message];
    await this.ctx.storage.put("messages", this.messages);
    this.broadcast(JSON.stringify({ type: "message", text: message }), [sender.id]);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) || new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

Note the argument order: `onMessage(connection, message)` (PartyKit's old API had `message, sender`). Use `this.name` for the room name, `this.ctx.storage` for storage, `this.env` for bindings.

3. Configure `wrangler.jsonc`. Unlike PartyKit, wrangler does not create Durable Object bindings or migrations for you; add a new migration entry whenever you add, rename or remove a class.

```jsonc
{
  "name": "chat-rooms",
  "main": "src/server.ts",
  "compatibility_date": "2025-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{ "name": "ChatRoom", "class_name": "ChatRoom" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ChatRoom"] }]
}
```

`routePartykitRequest` serves `/parties/:server/:room`, where `:server` is the kebab-cased binding name (`ChatRoom` becomes `chat-room`). Binding named `Main` is the default party for older clients.

4. Connect from the browser or React:

```typescript
import usePartySocket from "partysocket/react";

const socket = usePartySocket({
  host: import.meta.env.VITE_PARTY_HOST, // e.g. chat-rooms.northwind.workers.dev, or localhost:8787 in dev
  party: "chat-room",
  room: "support-team",
  onMessage(event) {
    const data = JSON.parse(event.data);
    if (data.type === "history") setMessages(data.messages);
    else setMessages((prev) => [...prev, data.text]);
  },
});
socket.send("Deploy finished");
```

5. Run and deploy: `npx wrangler dev` (default `http://localhost:8787`), `npx wrangler login`, `npx wrangler deploy`. Secrets: `npx wrangler secret put OPENAI_API_KEY`; plain settings go in `vars`.
6. Gate connections in the Worker, not in the room: pass `onBeforeConnect(request, { party, name })` to `routePartykitRequest` and return a `Response` (401 or 403) to refuse, or nothing to allow.
7. Other hooks: `onClose`, `onError`, `onRequest` (HTTP to the room), `onAlarm` (set with `this.ctx.storage.setAlarm`), `getConnectionTags`, `this.getConnections(tag)`. Per-connection state up to 2 KB: `conn.setState(...)`.

## Examples

### Live cursors in a shared canvas

```typescript
export class CursorRoom extends Server {
  static options = { hibernate: true };

  onMessage(sender: Connection, message: string) {
    // clients send {"x":412,"y":96,"name":"Priya"} on pointer move
    this.broadcast(JSON.stringify({ id: sender.id, ...JSON.parse(message) }), [sender.id]);
  }

  onClose(conn: Connection) {
    this.broadcast(JSON.stringify({ id: conn.id, gone: true }));
  }
}
```

Result: each browser tab sees the other tabs' cursors move in real time and vanish when a tab closes. Cursor positions are never stored, so nothing is kept in memory across hibernation.

### Migrate a PartyKit project before 23 October 2026

User: "Our app uses partykit.dev and `npx partykit deploy`. Move it."

1. `npm install partyserver && npm install -D wrangler`, then remove `partykit`.
2. Change `class Chat implements Party.Server` to `class Chat extends Server` from `partyserver`; drop the constructor; `this.room.id` becomes `this.name`, `this.room.storage` becomes `this.ctx.storage`, `this.room.broadcast` becomes `this.broadcast`; swap `onMessage(message, sender)` to `onMessage(sender, message)`.
3. Replace `partykit.json` with `wrangler.jsonc` (binding named `Main` keeps old clients working) and move static `onBeforeConnect` into `routePartykitRequest` options.
4. Room storage does not move automatically. Exporting needs an `onRequest` on the old server (returning `this.room.storage.list()` behind a secret) and a redeploy, and deploys on the hosted platform were switched off on 16 October. If you still need the data, ask on the PartyKit Discord now; the migration guide has the export and import endpoints and a copy script.
5. Point clients' `host` at `chat-rooms.<subdomain>.workers.dev`, run `npx wrangler deploy`.

Result: the same rooms run on your own Cloudflare account and `partysocket` clients work after a host change. The migration guide at docs.partykit.io/guides/migrate-to-partyserver has the full table of renamed APIs.

## Guidelines

- Each room is its own Durable Object: state is not shared between rooms, so pick room names that match the unit of collaboration (one per document, game, channel).
- With hibernation (`static options = { hibernate: true }`), the class instance is thrown away between messages and `onStart` runs again. Anything that must survive goes in `this.ctx.storage`, not in class fields. Do not define `webSocketMessage`, `webSocketClose` or `webSocketError` yourself.
- Use `partysocket` rather than a bare WebSocket on the client; it reconnects and buffers sends.
- Do not trust client messages: validate the JSON, and authenticate in `onBeforeConnect` (a token in the query string is the usual route).
- A room runs in one location (near its first connection); very large audiences need `partysub` or sharded rooms.
- Yjs documents: use `y-partyserver`. The old `y-partykit` package belongs to the retired platform.
- Cloudflare bills Durable Object requests and duration directly; hibernation lowers cost when rooms are idle.
