---
title: "Build a Video Streaming Platform"
description: "Launch a paid video membership site with adaptive bitrate streaming, paywalled content, auto-generated captions, and detailed watch analytics — using Mux or Cloudflare Stream."
skills: [stripe, prisma]
difficulty: advanced
time_estimate: "12 hours"
tags: [video, streaming, monetization, hls, membership, mux, captions, analytics]
---

# Build a Video Streaming Platform

You run a paid course or video membership. Vimeo is expensive and YouTube exposes your content to competitors. You want your own platform — with paywalls, chapters, auto-captions, and real watch analytics.

## What You'll Build

- Video upload → cloud transcoding (Mux or Cloudflare Stream)
- Adaptive bitrate HLS streaming (auto quality based on connection)
- Paywall: Stripe-gated access to videos and series
- Auto-generated closed captions via transcription API
- Video chapters with timestamps
- Analytics: watch time, drop-off points, completion rate

## Architecture

```
User uploads video
  → Mux ingests + transcodes to HLS
  → Prisma stores metadata (title, duration, chapters, captions)
  → Stripe controls access (subscription or one-time purchase)
  → HLS player streams from Mux CDN
  → Events (play, pause, seek, complete) → analytics table
```

## Step 1: Set Up Mux for Video Hosting

```bash
npm install @mux/mux-node @mux/mux-player-react
```

```typescript
// lib/mux.ts
import Mux from "@mux/mux-node";

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

// Upload a video from a URL or direct upload
export async function createMuxAsset(videoUrl: string) {
  const asset = await mux.video.assets.create({
    input: [{ url: videoUrl }],
    playback_policy: ["signed"], // requires signed token for playback
    mp4_support: "capped-1080p",
    generated_subtitles: [
      { language_code: "en", name: "English (auto-generated)" },
    ],
  });
  return asset;
}

// Create a signed playback token (expires in 1 hour)
export function getSignedPlaybackUrl(playbackId: string) {
  const token = mux.jwt.signPlaybackId(playbackId, {
    expiration: "1h",
    type: "video",
  });
  return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
}
```

## Step 2: Prisma Schema for Videos

```prisma
model Video {
  id          String   @id @default(cuid())
  title       String
  description String?
  muxAssetId  String   @unique
  muxPlaybackId String @unique
  duration    Int      // seconds
  thumbnail   String?
  status      VideoStatus @default(PROCESSING)
  isPublished Boolean  @default(false)
  isPremium   Boolean  @default(false)
  sortOrder   Int      @default(0)
  seriesId    String?
  series      Series?  @relation(fields: [seriesId], references: [id])
  chapters    Chapter[]
  watchEvents WatchEvent[]
  createdAt   DateTime @default(now())
}

model Chapter {
  id        String @id @default(cuid())
  videoId   String
  video     Video  @relation(fields: [videoId], references: [id])
  title     String
  startTime Int    // seconds
}

model WatchEvent {
  id          String   @id @default(cuid())
  videoId     String
  video       Video    @relation(fields: [videoId], references: [id])
  userId      String
  eventType   String   // play, pause, seek, complete, progress
  position    Float    // seconds
  sessionId   String
  createdAt   DateTime @default(now())
  @@index([videoId, userId])
}

enum VideoStatus {
  PROCESSING
  READY
  ERRORED
}
```

## Step 3: Stripe Paywall

```typescript
// lib/access.ts — check if user can watch a video
import { prisma } from "./db";
import Stripe from "stripe";

export async function canWatchVideo(userId: string, videoId: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video?.isPremium) return true; // free content

  // Check active Stripe subscription
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true, stripeSubscriptionStatus: true },
  });

  return user?.stripeSubscriptionStatus === "active";
}

// API route: POST /api/videos/[id]/watch
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  const allowed = await canWatchVideo(userId, params.id);

  if (!allowed) {
    return Response.json({ error: "subscription_required" }, { status: 403 });
  }

  const video = await prisma.video.findUnique({ where: { id: params.id } });
  const streamUrl = getSignedPlaybackUrl(video!.muxPlaybackId);

  return Response.json({ streamUrl, chapters: video?.chapters });
}
```

## Step 4: Analytics — Track Watch Events

```typescript
// Track events from the player
// POST /api/analytics/watch
export async function POST(req: Request) {
  const { videoId, eventType, position, sessionId } = await req.json();
  const userId = await getSessionUserId(req);

  await prisma.watchEvent.create({
    data: { videoId, userId, eventType, position, sessionId },
  });

  return Response.json({ ok: true });
}

// Compute drop-off curve for a video
export async function getDropOffCurve(videoId: string) {
  const events = await prisma.watchEvent.findMany({
    where: { videoId, eventType: "progress" },
    select: { position: true },
  });

  // Bucket into 10-second intervals
  const buckets: Record<number, number> = {};
  for (const e of events) {
    const bucket = Math.floor(e.position / 10) * 10;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  return buckets;
}
```

## Step 5: Auto-Generated Captions

Mux generates captions automatically when `generated_subtitles` is set. Fetch and store them:

```typescript
export async function syncCaptions(muxAssetId: string, videoId: string) {
  const asset = await mux.video.assets.retrieve(muxAssetId);
  const tracks = asset.tracks?.filter(
    (t) => t.type === "text" && t.status === "ready"
  );

  for (const track of tracks || []) {
    await prisma.caption.upsert({
      where: { videoId_language: { videoId, language: track.language_code! } },
      update: { muxTrackId: track.id! },
      create: {
        videoId,
        language: track.language_code!,
        muxTrackId: track.id!,
        label: track.name || "Auto-generated",
      },
    });
  }
}
```

## Step 6: Mux Webhook — Update Status

```typescript
// POST /api/webhooks/mux
export async function POST(req: Request) {
  const body = await req.text();
  // Verify Mux signature here...
  const event = JSON.parse(body);

  if (event.type === "video.asset.ready") {
    const { id: muxAssetId, playback_ids, duration } = event.data;
    await prisma.video.updateMany({
      where: { muxAssetId },
      data: {
        status: "READY",
        muxPlaybackId: playback_ids?.[0]?.id,
        duration: Math.round(duration),
      },
    });
  }

  return Response.json({ received: true });
}
```

## Environment Variables

```bash
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_WEBHOOK_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] Mux account + signed playback policy enabled
- [ ] Stripe subscription product created (monthly/annual)
- [ ] Webhook endpoints registered (Mux + Stripe)
- [ ] Video player with chapter navigation
- [ ] Caption track selector in player UI
- [ ] Analytics dashboard: completion rate, drop-off per video
- [ ] Upload UI with progress indicator

## What's Next

- Live streaming (Mux Live)
- Download for offline (MP4 via `mp4_support`)
- Certificate of completion
- Community: comments per video chapter
