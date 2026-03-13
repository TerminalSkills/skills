---
name: pusher
description: >-
  You are an expert in Pusher Channels, the hosted real-time messaging
  platform. You help developers add live features to applications using
  pub/sub channels, presence channels for online status, private channels with
  auth, client events for peer-to-peer, webhooks, and batch triggers —
  enabling real-time notifications, live dashboards, chat, and collaborative
  features without managing WebSocket infrastructure.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - realtime
    - websocket
    - channels
    - pub-sub
    - notifications
    - presence
---

# Pusher — Real-Time Communication Platform

You are an expert in Pusher Channels, the hosted real-time messaging platform. You help developers add live features to applications using pub/sub channels, presence channels for online status, private channels with auth, client events for peer-to-peer, webhooks, and batch triggers — enabling real-time notifications, live dashboards, chat, and collaborative features without managing WebSocket infrastructure.

## Core Capabilities

### Server-Side (Node.js)

```typescript
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: "us2",
  useTLS: true,
});

// Trigger event on a channel
await pusher.trigger("orders", "new-order", {
  id: "ord-123",
  total: 99.99,
  customer: "Alice",
});

// Batch trigger (multiple channels)
await pusher.triggerBatch([
  { channel: "user-42", name: "notification", data: { message: "New message" } },
  { channel: "dashboard", name: "metric-update", data: { activeUsers: 1234 } },
]);

// Private channel auth (Express middleware)
app.post("/pusher/auth", (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;

  // Verify user has access to this channel
  if (!userCanAccessChannel(req.user, channel)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const auth = pusher.authorizeChannel(socketId, channel);
  res.json(auth);
});

// Presence channel auth (includes user info)
app.post("/pusher/auth", (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;

  if (channel.startsWith("presence-")) {
    const auth = pusher.authorizeChannel(socketId, channel, {
      user_id: req.user.id,
      user_info: { name: req.user.name, avatar: req.user.avatar },
    });
    return res.json(auth);
  }

  const auth = pusher.authorizeChannel(socketId, channel);
  res.json(auth);
});
```

### Client-Side (React)

```tsx
import Pusher from "pusher-js";
import { useEffect, useState } from "react";

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: "us2",
  authEndpoint: "/api/pusher/auth",
});

function useChannel<T>(channelName: string, eventName: string): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const channel = pusher.subscribe(channelName);
    channel.bind(eventName, (payload: T) => setData(payload));
    return () => { pusher.unsubscribe(channelName); };
  }, [channelName, eventName]);

  return data;
}

function LiveDashboard() {
  const metric = useChannel<{ activeUsers: number }>("dashboard", "metric-update");
  return <div>Active Users: {metric?.activeUsers ?? "..."}</div>;
}

// Presence channel (who's online)
function OnlineUsers({ roomId }: { roomId: string }) {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    const channel = pusher.subscribe(`presence-room-${roomId}`);
    channel.bind("pusher:subscription_succeeded", (m: any) => {
      setMembers(Object.values(m.members));
    });
    channel.bind("pusher:member_added", (m: any) => {
      setMembers(prev => [...prev, m.info]);
    });
    channel.bind("pusher:member_removed", (m: any) => {
      setMembers(prev => prev.filter(p => p.id !== m.id));
    });
    return () => { pusher.unsubscribe(`presence-room-${roomId}`); };
  }, [roomId]);

  return <ul>{members.map(m => <li key={m.id}>{m.name}</li>)}</ul>;
}
```

## Installation

```bash
npm install pusher                        # Server
npm install pusher-js                     # Client
```

## Best Practices

1. **Channel naming** — Public: `orders`; Private: `private-user-42`; Presence: `presence-room-5`
2. **Private channels** — Use for user-specific data; server must authorize via auth endpoint
3. **Presence for online status** — Use presence channels to track who's online; includes user info
4. **Batch triggers** — Use `triggerBatch()` for multiple events; single API call, reduced latency
5. **Client events** — Enable for peer-to-peer (typing indicators, cursor position); no server roundtrip
6. **Webhooks** — Configure webhooks for channel_occupied/vacated events; track active channels server-side
7. **Max payload 10KB** — Keep event data small; send IDs and fetch details client-side if needed
8. **Fallback** — Pusher auto-falls back from WebSocket to HTTP streaming/polling for restrictive networks
