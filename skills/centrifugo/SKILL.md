---
name: centrifugo
description: >-
  Centrifugo is a self-hosted real-time messaging server: your backend
  publishes over an HTTP or gRPC API and browsers or mobile apps receive
  messages over WebSocket, SSE or HTTP streaming. Use when the user wants chat,
  live notifications, presence ("who is online"), message history with
  recovery, or any WebSocket pub/sub without writing a socket server.
license: Apache-2.0
compatibility: 'Centrifugo v6 (single Go binary or Docker); centrifuge JS SDK 5.x for browsers'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/centrifugal/centrifugo
  category: development
  tags:
    - websocket
    - realtime
    - pubsub
    - messaging
    - centrifugo
---

# Centrifugo — Scalable Real-Time Messaging Server

## Overview

Centrifugo sits between your backend and your clients. The backend publishes to named channels through the server API (`/api/publish`, authenticated with an API key); clients connect with a JWT signed by your backend and subscribe to channels. Features: namespaces with per-channel options, presence, join/leave events, history with automatic recovery after reconnect, and Redis or NATS engines for several nodes. This skill targets Centrifugo v6 (6.9.7 checked, October 2026). v6 restructured the config: keys that were flat in v5 (`token_hmac_secret_key`, `api_key`, `allowed_origins`, `namespaces`) now live under `client.token.hmac_secret_key`, `http_api.key`, `client.allowed_origins` and `channel.namespaces`. SockJS and the Tarantool engine were removed. The official site offers a converter for v5 configs.

## Instructions

### 1. Install and generate a config

```bash
# binary: download the release archive and verify it against centrifugo_<version>_checksums.txt
sha256sum -c --ignore-missing centrifugo_6.9.7_checksums.txt
./centrifugo genconfig -c config.json      # writes random token key, API key, admin password
./centrifugo checkconfig -c config.json
./centrifugo -c config.json                # listens on :8000
```

Docker alternative: `docker run --rm -p 127.0.0.1:8000:8000 -v "$PWD/config.json:/centrifugo/config.json" centrifugo/centrifugo:v6 centrifugo --config=config.json`.

### 2. Configure namespaces

A channel `chat:room-42` takes its options from the namespace `chat`; channels without a namespace use `channel.without_namespace`. Almost every permission is off by default, so enable what the client needs.

```json
{
  "client": {
    "token": { "hmac_secret_key": "set-via-CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY" },
    "allowed_origins": ["https://shopfront.io"]
  },
  "http_api": { "key": "set-via-CENTRIFUGO_HTTP_API_KEY" },
  "admin": { "enabled": true, "password": "from-env", "secret": "from-env" },
  "channel": {
    "namespaces": [
      {
        "name": "chat",
        "presence": true, "join_leave": true,
        "history_size": 100, "history_ttl": "300s", "force_recovery": true,
        "allow_subscribe_for_client": true,
        "allow_presence_for_subscriber": true,
        "allow_history_for_subscriber": true
      },
      {
        "name": "notifications",
        "history_size": 50, "history_ttl": "24h",
        "allow_user_limited_channels": true
      }
    ]
  }
}
```

Every key can also be an environment variable: `CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY`, `CENTRIFUGO_HTTP_API_KEY`, `CENTRIFUGO_CHANNEL_NAMESPACES` (a JSON array). Keep secrets in the environment, not in git.

### 3. Backend: issue tokens and publish

```typescript
import jwt from "jsonwebtoken";

// connection token: `sub` is the user id; expire it and let the client refresh
export function connectionToken(userId: string) {
  return jwt.sign({ sub: userId }, process.env.CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY!, { expiresIn: "1h" });
}

export async function publish(channel: string, data: unknown) {
  const res = await fetch("http://localhost:8000/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `apikey ${process.env.CENTRIFUGO_HTTP_API_KEY}` },
    body: JSON.stringify({ channel, data }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`centrifugo ${body.error.code}: ${body.error.message}`);
}
```

The API replies `{"result":{"offset":1,"epoch":"..."}}` on success and `{"error":{"code":102,"message":"unknown channel"}}` for a namespace that is not configured. Other useful methods: `/api/history`, `/api/presence`, `/api/broadcast` (one payload, many channels), `/api/disconnect`, `/api/info`. A quick token for testing: `./centrifugo gentoken -c config.json -u alice`.

### 4. Browser client

```typescript
import { Centrifuge } from "centrifuge";   // npm install centrifuge

const client = new Centrifuge("wss://rt.shopfront.io/connection/websocket", {
  getToken: () => fetch("/api/realtime-token").then(r => r.text()),   // called on connect and refresh
});

const sub = client.newSubscription("chat:room-42");
sub.on("publication", ctx => console.log(ctx.data));          // { user: "Alice", text: "Hello!" }
sub.on("join", ctx => console.log(`${ctx.info.user} joined`));
sub.subscribe();
client.connect();

const presence = await sub.presence();                         // after subscribed
const history = await sub.history({ limit: 50 });
```

Personal channels use the `#` form: `notifications:#user-123` can be subscribed only by the user whose `sub` is `user-123`, and only when the namespace sets `allow_user_limited_channels`.

## Examples

### Example 1: Live order notifications

**User request:** "Tell the customer in the browser when their order ships."

Enable the `notifications` namespace above, subscribe the page to `notifications:#<userId>`, and from the order service run `await publish("notifications:#user-123", { type: "order_shipped", orderId: "ORD-4561" })`. The page's `publication` handler fires within milliseconds; if the user was offline for a minute, recovery replays missed messages from history.

### Example 2: Chat room with presence

**User request:** "Add a chat room page that shows who is online."

Use the `chat` namespace, subscribe to `chat:room-42`, render `Object.values((await sub.presence()).clients)`, and update the list on `join`/`leave`. A message is sent by the backend (after checking membership) with `publish("chat:room-42", { user: "Alice", text: "Hello!" })`.

## Guidelines

- Publish from your backend; do not let browsers publish unless you have enabled `allow_publish_for_client` and accept unvalidated input. Use the connect/subscribe/publish proxies when the backend must approve each action.
- Never leave `allowed_origins` empty or `*` in production. Do not expose the HTTP API, admin and Prometheus endpoints to the internet: put the API on the internal port or behind a firewall.
- The HMAC secret and API key must be long and random (`genconfig` does this); rotate them if leaked. Short-lived tokens plus `getToken` limit the damage of a stolen token.
- Presence and join/leave cost extra memory and messages: enable them only on channels that need them.
- History is in memory by default and lost on restart. With more than one node use the Redis or NATS engine, otherwise nodes do not share channels.
- `/api/publish` returning HTTP 200 does not mean success: check the `error` field.
- v5 configs and v5 environment variables do not work unchanged on v6; convert them and test before deploying.
