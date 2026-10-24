---
name: pusher
description: >-
  Pusher Channels is a hosted real-time messaging service: your server triggers
  events over HTTP and browsers receive them over WebSockets, with no socket
  infrastructure to run. Use this skill when a user wants to add live
  notifications, dashboards, chat, typing indicators or online-presence lists
  with pusher / pusher-js, authorize private and presence channels, send batch
  triggers, or verify Pusher webhooks.
license: Apache-2.0
compatibility: Node.js 10+ for the pusher server SDK; any modern browser for pusher-js. Needs a Pusher Channels app (app id, key, secret, cluster).
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pusher/pusher-js
  tags:
    - realtime
    - websocket
    - channels
    - pub-sub
    - presence
---

# Pusher

## Overview

Pusher Channels is publish/subscribe over WebSockets. The server SDK (`pusher`, 5.x) publishes events through Pusher's HTTP API; the browser library (`pusher-js`, 8.x) subscribes to channels and falls back to HTTP streaming or polling on restrictive networks. Channel type is decided by the name prefix: no prefix is public, `private-` needs server authorization, `presence-` needs authorization plus user identity, `private-encrypted-` adds end-to-end encryption. The app id, key, secret and cluster come from the Channels app in the Pusher dashboard; the secret never leaves the server.

## Instructions

1. Install: `npm install pusher` on the server, `npm install pusher-js` in the client.
2. Create one server instance. `trigger` and `triggerBatch` return promises, so `await` them and catch `Pusher.RequestError`.
3. Trigger limits: event data at most 10 KB, one `trigger` to at most 100 channels, `triggerBatch` at most 10 events, channel names at most 164 characters including the `private-`/`presence-` prefix (letters, digits and `_ - = @ , . ;`).
4. Authorize private and presence channels with `pusher.authorizeChannel(socketId, channelName, presenceData?)`. pusher-js POSTs `socket_id` and `channel_name` as form-encoded fields to `channelAuthorization.endpoint` (default `/pusher/auth`), so the server needs `express.urlencoded()`. Always check that the logged-in user may join that channel before signing.
5. In the client set `channelAuthorization: { endpoint: "/api/pusher/auth" }`. The old `authEndpoint` option is the pre-v7 name; use the new one.
6. Client events (typing, cursors) must be enabled in the app settings, only work on private and presence channels, and event names must start with `client-`.
7. To exclude the sender from receiving its own server event, pass `{ socket_id }` as the fourth argument of `trigger`.
8. Verify webhooks (channel_occupied, channel_vacated, member_added, member_removed) with `pusher.webhook({ headers, rawBody }).isValid()`; use the raw request body, not parsed JSON.

## Examples

### Server: trigger, batch and channel auth (Express)

```typescript
import express from "express";
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER ?? "eu",
  useTLS: true,
});

const app = express();
app.use(express.urlencoded({ extended: false }));

// "Notify the warehouse dashboard about order 8841"
await pusher.trigger("orders", "new-order", { id: "ord-8841", total: 99.99 });

await pusher.triggerBatch([
  { channel: "private-user-42", name: "notification", data: { message: "Invoice paid" } },
  { channel: "dashboard", name: "metric-update", data: { activeUsers: 1234 } },
]);

app.post("/api/pusher/auth", (req, res) => {
  const { socket_id, channel_name } = req.body;
  const user = req.user; // set by your session middleware
  if (!user || !userCanAccessChannel(user, channel_name)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (channel_name.startsWith("presence-")) {
    return res.json(
      pusher.authorizeChannel(socket_id, channel_name, {
        user_id: String(user.id),
        user_info: { name: user.name },
      })
    );
  }
  res.json(pusher.authorizeChannel(socket_id, channel_name));
});
```

### Client: live metric and presence list (React)

```tsx
import Pusher from "pusher-js";
import { useEffect, useState } from "react";

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
});

export function ActiveUsers() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const channel = pusher.subscribe("dashboard");
    const onMetric = (p: { activeUsers: number }) => setCount(p.activeUsers);
    channel.bind("metric-update", onMetric);
    return () => {
      channel.unbind("metric-update", onMetric);
      pusher.unsubscribe("dashboard");
    };
  }, []);
  return <div>Active users: {count ?? "..."}</div>;
}

type Member = { id: string; info: { name: string } };

export function OnlineUsers({ roomId }: { roomId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    const name = `presence-room-${roomId}`;
    const channel = pusher.subscribe(name);
    channel.bind("pusher:subscription_succeeded", (m: any) => {
      const list: Member[] = [];
      m.each((member: Member) => list.push(member));
      setMembers(list);
    });
    channel.bind("pusher:member_added", (m: Member) => setMembers((prev) => [...prev, m]));
    channel.bind("pusher:member_removed", (m: Member) =>
      setMembers((prev) => prev.filter((p) => p.id !== m.id))
    );
    return () => pusher.unsubscribe(name);
  }, [roomId]);
  return <ul>{members.map((m) => <li key={m.id}>{m.info.name}</li>)}</ul>;
}
```

Result: the dashboard number updates the moment the server calls `trigger`, and the list gains or loses a name as users join or leave the room.

### Webhook endpoint

```typescript
app.post("/webhooks/pusher", express.raw({ type: "application/json" }), (req, res) => {
  const hook = pusher.webhook({ headers: req.headers as Record<string, string>, rawBody: req.body.toString("utf8") });
  if (!hook.isValid()) return res.sendStatus(401);
  for (const ev of hook.getEvents()) console.log(ev.name, ev.channel);
  res.sendStatus(200);
});
```

## Guidelines

- Keep payloads small: send an id and let the client fetch details. Over 10 KB the API rejects the trigger.
- Never expose `PUSHER_SECRET` to the browser; only the key and cluster are public. Do not mark the secret `NEXT_PUBLIC_`.
- A public channel is readable by anyone who knows its name. Put user-specific data on `private-` channels.
- Presence channels are limited to 100 members, 1 KB of `user_info` per member and 128-character user ids; use them for rosters, not large audiences.
- Mount the webhook route with a raw-body parser; a JSON parser changes the bytes and breaks the signature.
- Pusher delivers events live only: a client that was offline misses them. Store messages in your database and load history on connect.
- Always unbind handlers and unsubscribe on cleanup, or React strict mode will deliver duplicates.
