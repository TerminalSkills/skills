---
name: ably
description: >-
  Ably is a hosted realtime messaging service: clients publish and subscribe
  to named channels over WebSockets, see who is present, replay message
  history, and resume after a dropped connection. Use when a user asks to
  "add realtime updates", "push live notifications to the browser", "show
  who is online", "add a chat room with typing indicators", "publish from a
  serverless function", or "authenticate Ably clients without exposing the
  API key". Covers the ably 2.x JavaScript SDK (Realtime and REST), JWT token
  authentication, presence, history and rewind, batch publishing, and the
  @ably/chat 1.x SDK.
license: Apache-2.0
compatibility: "Requires an Ably account and API key. ably 2.x runs in browsers and Node.js 16+; @ably/chat 1.x needs Node.js 20+ and ably ^2.19."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - realtime
    - pubsub
    - websocket
    - messaging
    - presence
---

# Ably — Realtime Infrastructure as a Service

## Overview

Ably is a managed pub/sub platform. An application publishes messages to named channels and every subscribed client receives them over a WebSocket connection that the SDK keeps alive and resumes after a short network drop. On top of plain messaging it provides presence (who is on a channel), message history, token authentication with per-channel permissions, and a separate Chat SDK with rooms, typing indicators and reactions.

Two clients exist in the `ably` package: `Ably.Realtime` holds a connection and can subscribe; `Ably.Rest` is stateless HTTP and is the right choice for servers and serverless functions that only publish or issue tokens.

## Instructions

### Install

```bash
npm install ably
npm install @ably/chat        # Chat SDK, optional; built on top of ably
npm install jsonwebtoken      # server side, to sign tokens for browser clients
```

Create an app in the Ably dashboard and copy an API key. A key looks like `I2E_JQ.OqUdfg:EVKVT...`: the part before the colon is the key name, the part after it is the secret. Keep it in `ABLY_API_KEY` on the server only.

### Authenticate clients with a JWT

Browsers and mobile apps must never receive the API key. The server signs a short-lived JWT with the key secret; the SDK fetches it through `authUrl` (or `authCallback`) and renews it before it expires.

```typescript
// server/ably-token.ts
import jwt from "jsonwebtoken";

const [keyName, keySecret] = process.env.ABLY_API_KEY!.split(":");

export function createAblyToken(userId: string): string {
  return jwt.sign(
    {
      "x-ably-clientId": userId,
      // capability is a JSON string: resource -> allowed operations
      "x-ably-capability": JSON.stringify({
        "orders:*": ["subscribe", "history"],
        [`notifications:${userId}`]: ["subscribe"],
        "support:*": ["publish", "subscribe", "presence", "history", "message-update-own"],
      }),
    },
    keySecret,
    { algorithm: "HS256", keyid: keyName, expiresIn: "1h" },   // 24 hours is the maximum
  );
}
```

Return that string as the plain-text body of an authenticated endpoint such as `GET /api/ably-token`. `ably.auth.createTokenRequest({ clientId, capability })` on an `Ably.Rest` client is the older alternative; it still works, but JWTs are the format Ably recommends.

### Publish, subscribe and presence (Realtime)

```typescript
// client/orders.ts
import * as Ably from "ably";

const realtime = new Ably.Realtime({ authUrl: "/api/ably-token" });
await realtime.connection.once("connected");

const channel = realtime.channels.get("orders:store-17");

// subscribe() attaches the channel; filter by event name or receive everything
await channel.subscribe("status-update", (message) => {
  console.log(message.name, message.data, message.clientId, message.timestamp);
});

// Publishing needs the publish capability; the token above grants it on support:* only
const lobby = realtime.channels.get("support:lobby");
await lobby.publish("question", { text: "Is anyone from billing online?" });

// Presence needs an identified client (clientId comes from the token)
await lobby.presence.subscribe((member) => {
  console.log(member.action, member.clientId, member.data);   // enter | leave | update | present
});
await lobby.presence.enter({ name: "Dana Whitfield", status: "available" });
await lobby.presence.update({ name: "Dana Whitfield", status: "busy" });
const members = await lobby.presence.get();
console.log("Online:", members.map((m) => m.clientId));

realtime.close();   // release the connection when the page or process is done
```

### History and rewind

Messages are kept for two minutes by default, enough for the SDK to resume a dropped connection. Longer retention is switched on with a channel rule in the app settings: a match expression such as `orders:*` with "Persist all messages" enabled (24 hours on the free plan, 72 hours on paid plans).

```typescript
// client/history.ts
import * as Ably from "ably";

const realtime = new Ably.Realtime({ authUrl: "/api/ably-token" });

// Option 1, rewind: attach and immediately receive the last 10 messages, then live ones
const feed = realtime.channels.get("orders:store-17", { params: { rewind: "10" } });
await feed.subscribe((message) => console.log(message.data));

// Option 2, history: page backwards from the point of attachment, with no gap.
// Pick one: the first history page repeats the messages rewind already delivered.
const page = await feed.history({ untilAttach: true, limit: 50 });
for (const message of page.items) console.log(message.timestamp, message.data);
if (page.hasNext()) {
  const older = await page.next();
  console.log(older?.items.length);
}
```

### Publish from a server (REST)

```typescript
// server/notify.ts
import * as Ably from "ably";

const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });

// No connection is opened: one HTTP request per publish
await rest.channels.get("notifications:usr_8f3a21").publish("alert", {
  title: "Payment received",
  amount: 150.0,
});

// One request, many channels
const result = await rest.batchPublish({
  channels: ["notifications:usr_8f3a21", "notifications:usr_c04d77"],
  messages: [{ name: "alert", data: { title: "Scheduled maintenance at 02:00 UTC" } }],
});
console.log(result.successCount, result.failureCount);
```

### Chat SDK

A room wraps a channel and adds messages, typing, reactions, presence and occupancy. `rooms.get()` is asynchronous, and nothing arrives until the room is attached. The underlying client must have a `clientId`.

```typescript
// client/support-chat.ts
import * as Ably from "ably";
import { ChatClient } from "@ably/chat";

const realtime = new Ably.Realtime({ authUrl: "/api/ably-token" });
const chat = new ChatClient(realtime);

const room = await chat.rooms.get("support:ticket-4812");

const { unsubscribe, historyBeforeSubscribe } = room.messages.subscribe((event) => {
  console.log(`${event.message.clientId}: ${event.message.text}`);
});
room.typing.subscribe((event) => {
  console.log("Typing:", event.currentTypers.map((t) => t.clientId).join(", "));
});
room.reactions.subscribe((event) => {
  console.log(`${event.reaction.clientId} reacted with ${event.reaction.name}`);
});

await room.attach();

const earlier = await historyBeforeSubscribe({ limit: 20 });
console.log(earlier.items.map((m) => m.text));

await room.typing.keystroke();                    // call on each keypress; the SDK throttles it
const sent = await room.messages.send({ text: "How can I help you?" });
await room.typing.stop();
await room.messages.update(sent.serial, sent.copy({ text: "How can I help you today?" }));
await room.reactions.send({ name: "like" });

unsubscribe();
await chat.rooms.release("support:ticket-4812");   // detach and free the room
```

## Examples

### Example 1: Live order status in the browser without exposing the API key

**User request:** "Our dashboard should update the moment an order ships. The backend is a Next.js app; don't put the Ably key in the client."

```typescript
// app/api/ably-token/route.ts
import { createAblyToken } from "../../../server/ably-token";
import { getSessionUser } from "../../../server/session";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  return new Response(createAblyToken(user.id), { headers: { "Content-Type": "text/plain" } });
}
```

```typescript
// server/ship-order.ts
import * as Ably from "ably";

const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });

export async function markShipped(storeId: string, orderId: string) {
  await rest.channels.get(`orders:${storeId}`).publish("status-update", { orderId, status: "shipped" });
}
```

The browser runs the `client/orders.ts` code above with `authUrl: "/api/ably-token"`. When `markShipped("store-17", "ORD-789")` runs, every open dashboard receives a `status-update` message whose `data` is `{ orderId: "ORD-789", status: "shipped" }`. A client holding this token cannot publish to `orders:*`; an attempt is rejected with error code 40160 (capability denied).

### Example 2: Migrate chat code written for a pre-1.0 @ably/chat

**User request:** "After updating @ably/chat the build fails: RoomOptionsDefaults is not exported and room.messages is undefined."

```typescript
// Before (0.x)
const room = chatClient.rooms.get("support-room", RoomOptionsDefaults);
await room.typing.start();
await room.reactions.send({ type: "like" });

// After (1.x)
const room = await chatClient.rooms.get("support-room");   // returns a Promise; no options needed to enable features
await room.attach();
await room.typing.keystroke();
await room.reactions.send({ name: "like" });
```

Listeners change shape too: reactions arrive as `event.reaction.name`, and typing events carry `event.currentTypers`, an array of `{ clientId }` objects (`event.currentlyTyping` is deprecated since 1.2). After the change `tsc` passes and messages sent with `room.messages.send({ text })` are delivered to every attached client.

## Guidelines

- **Never ship the API key to a browser or mobile app.** Use `authUrl` or `authCallback` with a server-issued token, scope `x-ably-capability` to the channels and operations that user needs, and set `x-ably-clientId` on the server so users cannot impersonate each other.
- **One Realtime client per page or process.** Each instance opens its own connection and counts against the connection limit. In Next.js, create it inside `useEffect` and pass it to `AblyProvider` from `ably/react`, so that server rendering does not open connections that never close.
- **Servers publish with `Ably.Rest`.** It is stateless HTTP; serverless platforms (Lambda, Cloud Functions, Workers) are not built for the persistent connection a Realtime client holds.
- **History is short unless you enable persistence.** Two minutes by default; persisted messages count again toward the message quota when stored and when retrieved. Chat rooms persist for 30 days by default.
- **Presence requires `clientId`** and the `presence` capability to enter; the `subscribe` capability is enough to watch the presence set.
- **Namespace channels** (`orders:`, `notifications:`, `support:`). Channel rules and capabilities both match colon-delimited segments with `*` wildcards, so the prefix is what lets you grant `orders:*` or persist only `support:*`. A trailing `*` needs at least one segment: `orders:*` does not match a channel named `orders`.
- **Ordering and retries.** Subscribers connected to one region see a single order; when publishers are in different regions, two near-simultaneous messages can reach subscribers in different regions in a different order, while history returns one canonical order. The SDK assigns message ids so its own REST retries are not duplicated (`idempotentRestPublishing`, on by default); set `id` yourself when your code may publish the same event twice.
- **`ably.request()` takes a protocol version** as its third argument in v2 (`request(method, path, version, params, body, headers)`); prefer the typed methods such as `batchPublish()`.
- **Cost and limits.** Billing counts messages, connection minutes and channel minutes, and each plan has rate limits. One publish received by 10 subscribers counts as 11 messages. Check the account limits before a launch.
- **When not to use it.** For a single server with a few hundred clients and no delivery guarantees needed, Server-Sent Events or a plain WebSocket is simpler and has no per-message cost.
