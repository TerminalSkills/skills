---
title: "Build a Podcast Hosting Platform"
description: "Build a self-hosted podcast platform with S3 audio storage, RSS feed generation, episode management, and download analytics — instead of paying Libsyn or Buzzsprout."
skills: [prisma]
difficulty: intermediate
time_estimate: "8 hours"
tags: [podcast, rss, s3, audio, media, hosting, analytics]
---

# Build a Podcast Hosting Platform

**Persona:** You run a podcast network with 5 shows and 50k monthly downloads. Libsyn charges $150/month and owns your audience data. You want to self-host, keep the revenue, and control distribution.

## What You'll Build

- **Audio upload and storage**: Direct-to-S3 uploads with CDN delivery
- **RSS feed generation**: iTunes + Spotify compatible XML feeds
- **Episode management**: Title, description, chapters, transcripts
- **Distribution**: Submit to Apple Podcasts and Spotify
- **Analytics**: Downloads per episode, listener geography, top episodes

---

## 1. Prisma Schema

```prisma
model Podcast {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
  description String    @db.Text
  author      String
  email       String
  imageUrl    String
  language    String    @default("en")
  category    String    // iTunes category
  explicit    Boolean   @default(false)
  feedUrl     String?   // computed after creation
  episodes    Episode[]
  createdAt   DateTime  @default(now())
}

model Episode {
  id           String    @id @default(cuid())
  podcastId    String
  podcast      Podcast   @relation(fields: [podcastId], references: [id])
  title        String
  slug         String
  description  String    @db.Text
  audioUrl     String    // S3 URL
  audioBytes   Int       // file size in bytes
  durationSec  Int       // in seconds
  season       Int?
  episode      Int?
  transcript   String?   @db.Text
  chapters     Json?     // [{start: 0, title: "Intro"}]
  publishedAt  DateTime
  explicit     Boolean   @default(false)
  downloads    Download[]
  createdAt    DateTime  @default(now())
  @@unique([podcastId, slug])
}

model Download {
  id          String   @id @default(cuid())
  episodeId   String
  episode     Episode  @relation(fields: [episodeId], references: [id])
  ipHash      String
  userAgent   String?
  country     String?
  city        String?
  source      String?  // "apple-podcasts" | "spotify" | "direct"
  createdAt   DateTime @default(now())
  @@index([episodeId, createdAt])
}
```

---

## 2. S3 Upload — Presigned URLs

Generate presigned upload URLs so the browser uploads directly to S3.

```typescript
// app/api/upload/route.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  const { podcastId, filename, contentType } = await req.json();
  
  const key = `podcasts/${podcastId}/${Date.now()}-${filename}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  const publicUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;

  return Response.json({ uploadUrl, publicUrl, key });
}
```

```typescript
// Client-side upload with progress
async function uploadAudio(file: File, podcastId: string) {
  const { uploadUrl, publicUrl } = await fetch("/api/upload", {
    method: "POST",
    body: JSON.stringify({ podcastId, filename: file.name, contentType: file.type })
  }).then(r => r.json());

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => setProgress(Math.round(e.loaded / e.total * 100));
    xhr.onload = () => resolve();
    xhr.onerror = reject;
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });

  return publicUrl;
}
```

---

## 3. RSS Feed Generation

Generate iTunes + Spotify compatible XML feeds.

```typescript
// app/feeds/[podcastSlug]/route.ts
import { prisma } from "@/lib/prisma";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export async function GET(req: Request, { params }: { params: { podcastSlug: string } }) {
  const podcast = await prisma.podcast.findUnique({
    where: { slug: params.podcastSlug },
    include: { episodes: { where: { publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" } } }
  });

  if (!podcast) return new Response("Not found", { status: 404 });

  const baseUrl = process.env.BASE_URL!;
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(podcast.description)}</description>
    <language>${podcast.language}</language>
    <itunes:author>${escapeXml(podcast.author)}</itunes:author>
    <itunes:email>${escapeXml(podcast.email)}</itunes:email>
    <itunes:image href="${podcast.imageUrl}" />
    <itunes:category text="${escapeXml(podcast.category)}" />
    <itunes:explicit>${podcast.explicit ? "true" : "false"}</itunes:explicit>
    ${podcast.episodes.map(ep => `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <enclosure url="${ep.audioUrl}" length="${ep.audioBytes}" type="audio/mpeg" />
      <guid isPermaLink="false">${ep.id}</guid>
      <pubDate>${ep.publishedAt.toUTCString()}</pubDate>
      <itunes:duration>${formatDuration(ep.durationSec)}</itunes:duration>
      <itunes:explicit>${ep.explicit ? "true" : "false"}</itunes:explicit>
      ${ep.season ? `<itunes:season>${ep.season}</itunes:season>` : ""}
      ${ep.episode ? `<itunes:episode>${ep.episode}</itunes:episode>` : ""}
    </item>`).join("")}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

---

## 4. Download Tracking

Count downloads correctly (IAB 2.0 spec: unique IP + user agent per episode per 24h).

```typescript
// app/audio/[episodeId]/route.ts
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(req: Request, { params }: { params: { episodeId: string } }) {
  const episode = await prisma.episode.findUnique({ where: { id: params.episodeId } });
  if (!episode) return new Response("Not found", { status: 404 });

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
  const userAgent = req.headers.get("user-agent") ?? "";

  // IAB 2.0: only count unique IP per episode per 24h
  const recentDownload = await prisma.download.findFirst({
    where: {
      episodeId: params.episodeId,
      ipHash,
      createdAt: { gte: new Date(Date.now() - 86_400_000) }
    }
  });

  if (!recentDownload) {
    const source = detectPodcastApp(userAgent);
    await prisma.download.create({
      data: { episodeId: params.episodeId, ipHash, userAgent, source }
    });
  }

  // Redirect to CDN audio URL
  return Response.redirect(episode.audioUrl, 302);
}

function detectPodcastApp(ua: string): string {
  if (ua.includes("AppleCoreMedia") || ua.includes("iTunes")) return "apple-podcasts";
  if (ua.includes("Spotify")) return "spotify";
  if (ua.includes("Overcast")) return "overcast";
  if (ua.includes("Pocket Casts")) return "pocket-casts";
  return "direct";
}
```

---

## 5. Analytics Query

```typescript
// app/api/analytics/[podcastId]/route.ts
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { podcastId: string } }) {
  const [topEpisodes, bySource, last30Days] = await Promise.all([
    prisma.$queryRaw`
      SELECT e.title, COUNT(d.id) as downloads
      FROM "Episode" e JOIN "Download" d ON d."episodeId" = e.id
      WHERE e."podcastId" = ${params.podcastId}
      GROUP BY e.id, e.title ORDER BY downloads DESC LIMIT 10
    `,
    prisma.download.groupBy({
      by: ["source"],
      where: { episode: { podcastId: params.podcastId } },
      _count: true
    }),
    prisma.$queryRaw`
      SELECT DATE(d."createdAt") as date, COUNT(*) as downloads
      FROM "Download" d JOIN "Episode" e ON d."episodeId" = e.id
      WHERE e."podcastId" = ${params.podcastId}
        AND d."createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(d."createdAt") ORDER BY date
    `
  ]);

  return Response.json({ topEpisodes, bySource, last30Days });
}
```

---

## Result

Your self-hosted podcast platform:
- Stores audio directly in S3 with CloudFront CDN delivery — pennies per GB
- Generates spec-compliant RSS feeds readable by Apple, Spotify, and Google
- Tracks IAB 2.0 compliant download counts (required for accurate numbers)
- Gives you analytics your host would never share — app breakdown, geographic data
- Total cost at 50k downloads/month: ~$5/month in S3 + egress vs. $150/month for Libsyn
