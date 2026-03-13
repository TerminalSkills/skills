---
name: centrifugo
category: Backend Development
tags: [websocket, realtime, pubsub, messaging, scalable, go]
version: 1.0.0
author: terminal-skills
---

# Centrifugo — Scalable Real-Time Messaging Server

You are an expert in Centrifugo, the scalable real-time messaging server. You help developers add WebSocket-based real-time features (chat, notifications, live updates, presence) to any application with a language-agnostic server that handles millions of concurrent connections — publishing from your backend via HTTP/gRPC API while clients subscribe via WebSocket, SSE, or HTTP streaming.

## Core Capabilities

### Server Setup

```bash
# Docker
docker run -d --name centrifugo -p 8000:8000 \
  centrifugo/centrifugo:latest centrifugo \
  --token_hmac_secret_key="your-secret" \
  --api_key="your-api-key" \
  --admin --admin_password="admin" \
  --allowed_origins="*"

# Config file (config.json)
{
  "token_hmac_secret_key": "your-256-bit-secret",
  "api_key": "your-api-key",
  "allowed_origins": ["https://myapp.com"],
  "namespaces": [
    {
      "name": "chat",
      "presence": true,
      "join_leave": true,
      "history_size": 100,
      "history_ttl": "300s",
      "force_recovery": true
    },
    {
      "name": "notifications",
      "presence": false,
      "history_size": 50,
      "history_ttl": "86400s"
    }
  ]
}
```

### Client (Browser)

```typescript
import { Centrifuge } from "centrifuge";

const client = new Centrifuge("ws://localhost:8000/connection/websocket", {
  token: userJwtToken,                     // JWT signed with your secret
});

// Subscribe to channel
const sub = client.newSubscription("chat:room-42");

sub.on("publication", (ctx) => {
  console.log("New message:", ctx.data);   // { user: "Alice", text: "Hello!" }
});

sub.on("join", (ctx) => {
  console.log(`${ctx.info.user} joined`);
});

sub.on("leave", (ctx) => {
  console.log(`${ctx.info.user} left`);
});

// Presence — who's online
const presence = await sub.presence();
console.log("Online users:", Object.values(presence.clients).map(c => c.user));

// History — missed messages (recovery)
const history = await sub.history({ limit: 50 });
history.publications.forEach(p => console.log(p.data));

sub.subscribe();
client.connect();
```

### Backend Publishing

```typescript
// Publish from your server via HTTP API
async function publishMessage(channel: string, data: any) {
  await fetch("http://localhost:8000/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "apikey your-api-key",
    },
    body: JSON.stringify({ channel, data }),
  });
}

// Send chat message
await publishMessage("chat:room-42", {
  user: "Alice",
  text: "Hello everyone!",
  timestamp: Date.now(),
});

// Send notification
await publishMessage("notifications:#user-123", {
  type: "order_shipped",
  title: "Your order has shipped!",
  orderId: "ORD-456",
});

// JWT token generation (Node.js)
import jwt from "jsonwebtoken";

function generateToken(userId: string, channels: string[]) {
  return jwt.sign(
    { sub: userId, channels },
    process.env.CENTRIFUGO_SECRET!,
    { expiresIn: "24h" },
  );
}
```

## Installation

```bash
# Server
docker pull centrifugo/centrifugo
# Or binary: https://github.com/centrifugal/centrifugo/releases

# Client SDK
npm install centrifuge                     # JavaScript/TypeScript
```

## Best Practices

1. **Server-side publish** — Clients subscribe via WebSocket; your backend publishes via HTTP API; separation of concerns
2. **JWT authentication** — Sign tokens server-side with HMAC secret; Centrifugo validates on connect
3. **Namespaces** — Configure per-channel behavior (presence, history, recovery); `chat:` for chat, `notifications:` for alerts
4. **Presence** — Enable for channels where "who's online" matters; adds overhead, disable for broadcast-only
5. **History recovery** — Enable `force_recovery` for chat; clients automatically catch up on reconnect
6. **Personal channels** — Use `#user-123` pattern for per-user notifications; only that user can subscribe
7. **Scalability** — Use Redis/Nats as broker for multi-node deployment; handles millions of connections
8. **Proxy** — Configure connect/subscribe/publish proxies to validate permissions via your backend
