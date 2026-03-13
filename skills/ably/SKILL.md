---
name: ably
category: Backend Development
tags: [realtime, pubsub, websocket, messaging, serverless, presence]
version: 1.0.0
author: terminal-skills
---

# Ably — Realtime Infrastructure as a Service

You are an expert in Ably, the enterprise-grade realtime messaging platform. You help developers add pub/sub messaging, presence, chat, live updates, and event streaming to applications with guaranteed message ordering, exactly-once delivery, automatic reconnection, and global edge infrastructure — handling millions of messages per second with 99.999% uptime SLA.

## Core Capabilities

### Pub/Sub Messaging

```typescript
import Ably from "ably";

// Realtime client
const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });

// Subscribe to channel
const channel = ably.channels.get("orders");

channel.subscribe("new", (message) => {
  console.log("New order:", message.data);
  // { orderId: "ORD-789", total: 99.99, items: [...] }
});

channel.subscribe("status-update", (message) => {
  console.log("Status changed:", message.data);
});

// Publish
await channel.publish("new", {
  orderId: "ORD-789",
  total: 99.99,
  items: [{ name: "Widget", qty: 2 }],
});

// Presence — who's online
const presenceChannel = ably.channels.get("room:lobby");

await presenceChannel.presence.enter({ name: "Alice", avatar: "👩" });

presenceChannel.presence.subscribe("enter", (member) => {
  console.log(`${member.data.name} joined`);
});

const members = await presenceChannel.presence.get();
console.log("Online:", members.map(m => m.data.name));
```

### REST API (Server-Side)

```typescript
import Ably from "ably";

const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY });

// Publish from server
const channel = ably.channels.get("notifications:user-42");
await channel.publish("alert", {
  title: "Payment received",
  amount: 150.00,
  timestamp: Date.now(),
});

// Batch publish
await ably.request("POST", "/messages", {}, {}, [
  { channel: "notifications:user-1", name: "alert", data: { text: "Hello!" } },
  { channel: "notifications:user-2", name: "alert", data: { text: "Hi!" } },
]);

// Token authentication (for clients)
const tokenRequest = await ably.auth.createTokenRequest({
  clientId: "user-42",
  capability: {
    "chat:*": ["subscribe", "publish", "presence"],
    "notifications:user-42": ["subscribe"],
  },
});
// Send tokenRequest to client — they auth without exposing API key
```

### Chat SDK

```typescript
import { ChatClient, RoomOptionsDefaults } from "@ably/chat";

const chatClient = new ChatClient(realtimeClient);

const room = chatClient.rooms.get("support-room", RoomOptionsDefaults);

// Send message
await room.messages.send({ text: "How can I help you?" });

// Listen for messages
room.messages.subscribe((event) => {
  console.log(`${event.message.clientId}: ${event.message.text}`);
});

// Typing indicators
room.typing.subscribe((event) => {
  console.log("Typing:", event.currentlyTyping);
});
await room.typing.start();

// Reactions
await room.reactions.send({ type: "like" });

room.reactions.subscribe((reaction) => {
  console.log(`${reaction.clientId} reacted: ${reaction.type}`);
});
```

## Installation

```bash
npm install ably
npm install @ably/chat                     # Chat SDK (optional)
```

## Best Practices

1. **Token auth for clients** — Never expose API key in browsers; use `createTokenRequest` from your server
2. **Capabilities** — Scope tokens to specific channels and operations; least-privilege access
3. **Message ordering** — Ably guarantees message ordering per channel; no need for manual sequencing
4. **Presence** — Use for "who's online", typing indicators, cursor tracking; built-in, no custom code
5. **History** — Enable message persistence; clients recover missed messages on reconnect
6. **Channel namespaces** — Use `chat:`, `notifications:`, `updates:` prefixes; configure rules per namespace
7. **Serverless friendly** — REST API for publishing from Lambda/Cloud Functions; no persistent connection needed
8. **Global edge** — Messages routed via nearest edge node; <65ms median latency globally
