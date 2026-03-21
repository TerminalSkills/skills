---
title: "Build a Live Streaming Platform"
description: "Build a self-hosted live streaming platform with RTMP ingest, HLS playback, WebSocket chat, real-time emoji reactions, and paid membership gating via Stripe."
skills: [stripe, prisma]
difficulty: advanced
time_estimate: "12 hours"
tags: [livestream, rtmp, hls, websocket, chat, stripe, video, membership]
---

# Build a Live Streaming Platform

**Persona:** You're a creator with 5,000 followers who does weekly live Q&As. Twitch takes 50% of subscriptions. You want a platform where paying members get exclusive live access, you keep 95%, and you control the experience.

## What You'll Build

- **RTMP ingest**: Accept streams from OBS or Restream
- **HLS playback**: Low-latency live video in any browser
- **Live chat**: WebSocket-based with moderation tools
- **Emoji reactions**: Real-time burst overlay
- **Recordings + VOD**: Store and replay past streams
- **Stripe gating**: Members-only streams

---

## 1. Architecture Overview

```
OBS/Restream → RTMP Server (nginx-rtmp / mediamtx)
                    ↓
              HLS Segments → S3 / local
                    ↓
         Your Next.js app serves HLS playlist
         + WebSocket server for chat/reactions
```

Use [MediaMTX](https://github.com/bluenviron/mediamtx) as RTMP server — it's a single binary.

---

## 2. Prisma Schema

```prisma
model Stream {
  id          String    @id @default(cuid())
  userId      String
  title       String
  description String?
  streamKey   String    @unique @default(cuid())
  status      String    @default("offline")  // offline | live | ended
  startedAt   DateTime?
  endedAt     DateTime?
  hlsUrl      String?
  vodUrl      String?
  membersOnly Boolean   @default(false)
  messages    ChatMessage[]
  viewers     StreamViewer[]
  createdAt   DateTime  @default(now())
}

model ChatMessage {
  id        String   @id @default(cuid())
  streamId  String
  stream    Stream   @relation(fields: [streamId], references: [id])
  userId    String
  userName  String
  content   String
  deleted   Boolean  @default(false)
  createdAt DateTime @default(now())
}

model StreamViewer {
  id        String   @id @default(cuid())
  streamId  String
  stream    Stream   @relation(fields: [streamId], references: [id])
  userId    String?
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
  @@index([streamId])
}

model Membership {
  id               String   @id @default(cuid())
  userId           String   @unique
  stripeCustomerId String   @unique
  stripeSubId      String   @unique
  status           String   // active | canceled | past_due
  currentPeriodEnd DateTime
  createdAt        DateTime @default(now())
}
```

---

## 3. Stream Key Auth & Status Webhooks

MediaMTX calls a webhook when a stream starts/ends.

```typescript
// app/api/stream/webhook/route.ts
import { prisma } from "@/lib/prisma";

// MediaMTX on_publish webhook
export async function POST(req: Request) {
  const body = await req.json();
  const { action, path } = body; // path = stream key

  const stream = await prisma.stream.findUnique({ where: { streamKey: path } });
  if (!stream) return new Response("Unauthorized", { status: 401 });

  if (action === "on_publish") {
    const hlsUrl = `${process.env.HLS_BASE_URL}/${path}/index.m3u8`;
    await prisma.stream.update({
      where: { id: stream.id },
      data: { status: "live", startedAt: new Date(), hlsUrl }
    });
    console.log(`Stream started: ${stream.title}`);
  }

  if (action === "on_publish_done") {
    await prisma.stream.update({
      where: { id: stream.id },
      data: { status: "ended", endedAt: new Date() }
    });
  }

  return Response.json({ allow: true });
}
```

---

## 4. WebSocket Chat Server

```typescript
// server/chat.ts (standalone WebSocket server or Next.js route handler)
import { WebSocketServer } from "ws";
import { prisma } from "@/lib/prisma";

const wss = new WebSocketServer({ port: 3001 });
const rooms = new Map<string, Set<WebSocket>>(); // streamId → connections

wss.on("connection", (ws, req) => {
  const url = new URL(req.url!, "http://localhost");
  const streamId = url.searchParams.get("stream") ?? "";
  const userId = url.searchParams.get("userId");
  const userName = url.searchParams.get("name") ?? "Anonymous";

  if (!rooms.has(streamId)) rooms.set(streamId, new Set());
  rooms.get(streamId)!.add(ws);

  // Broadcast viewer count
  broadcast(streamId, { type: "viewers", count: rooms.get(streamId)!.size });

  ws.on("message", async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === "chat") {
      // Sanitize content
      const content = msg.content.slice(0, 300).replace(/<[^>]*>/g, "");
      
      const saved = await prisma.chatMessage.create({
        data: { streamId, userId: userId ?? null, userName, content }
      });

      broadcast(streamId, { type: "chat", id: saved.id, userName, content, createdAt: saved.createdAt });
    }

    if (msg.type === "reaction") {
      broadcast(streamId, { type: "reaction", emoji: msg.emoji, userId });
    }
  });

  ws.on("close", () => {
    rooms.get(streamId)?.delete(ws);
    broadcast(streamId, { type: "viewers", count: rooms.get(streamId)?.size ?? 0 });
  });
});

function broadcast(streamId: string, data: object) {
  const room = rooms.get(streamId);
  if (!room) return;
  const json = JSON.stringify(data);
  room.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });
}
```

---

## 5. Stripe Membership Gating

```typescript
// app/api/membership/checkout/route.ts
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const user = await auth(req);
  
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: process.env.STRIPE_MEMBERSHIP_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.BASE_URL}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/membership`,
    metadata: { userId: user.id }
  });

  return Response.json({ url: session.url });
}

// Webhook handler
export async function handleWebhook(event: Stripe.Event) {
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata.userId;

    await prisma.membership.upsert({
      where: { userId },
      create: {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubId: sub.id,
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000)
      },
      update: {
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000)
      }
    });
  }
}
```

---

## 6. HLS Player Component

```tsx
// components/LivePlayer.tsx
"use client";
import { useEffect, useRef } from "react";

interface Props {
  hlsUrl: string;
  poster?: string;
}

export function LivePlayer({ hlsUrl, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = hlsUrl;
    } else {
      // HLS.js for Chrome/Firefox
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
        }
      });
    }
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      autoPlay
      controls
      playsInline
      poster={poster}
      className="w-full rounded-xl bg-black aspect-video"
    />
  );
}
```

---

## Result

Your self-hosted live streaming platform:
- Accepts OBS streams out of the box via RTMP (same as Twitch)
- Delivers HLS video globally — add CloudFront in front of HLS segments for scale
- Real-time chat and emoji reactions via WebSocket, no polling
- Members-only streams gated by Stripe subscriptions — you keep 95%+ of revenue
- Automatic VOD recordings stored in S3 for replay

Compare to Twitch: 50% rev share. Your platform: 2.9% + $0.30 Stripe fees. At $1k/month, you keep ~$970 instead of ~$500.
