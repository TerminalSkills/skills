---
title: Build a Community Forum Platform with Threads, Reactions, and Reputation
slug: build-community-forum-platform
description: Build a community forum for your SaaS product — categories, threaded discussions, emoji reactions, bookmarks, reputation/karma system, moderation tools, and email digest notifications — replacing $300/month Discourse with something you own.
skills:
  - prisma
  - resend
category: business
tags:
  - forum
  - community
  - reputation
  - notifications
  - moderation
  - saas
---

# Build a Community Forum Platform with Threads, Reactions, and Reputation

Sofia launched a project management SaaS six months ago. She has 800 paying users and they're all asking questions in a Slack community that she can't search, can't moderate well, and can't integrate with her product. Discourse costs $300/month and feels like overkill. She wants a forum that lives at `community.her-saas.com`, authenticates with her existing user accounts, and notifies users about replies via email.

## Step 1 — Model the Forum in Prisma

```prisma
// prisma/schema.prisma — Community forum data model.
// Category → Thread → Reply with reactions, bookmarks, and reputation tracking.

model Category {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  position    Int      @default(0)
  threads     Thread[]
  createdAt   DateTime @default(now())
}

model Thread {
  id          String   @id @default(cuid())
  title       String
  slug        String
  body        String   // Markdown
  authorId    String
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  replies     Reply[]
  reactions   Reaction[]
  bookmarks   Bookmark[]
  followers   ThreadFollower[]
  pinned      Boolean  @default(false)
  locked      Boolean  @default(false)
  solved      Boolean  @default(false)
  solvedReplyId String? // Reply marked as the accepted answer
  viewCount   Int      @default(0)
  replyCount  Int      @default(0)    // Denormalized for sorting
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([categoryId, createdAt])
  @@index([authorId])
}

model Reply {
  id        String     @id @default(cuid())
  body      String     // Markdown
  authorId  String
  threadId  String
  thread    Thread     @relation(fields: [threadId], references: [id])
  parentId  String?    // For nested replies (one level deep)
  parent    Reply?     @relation("ReplyToReply", fields: [parentId], references: [id])
  children  Reply[]    @relation("ReplyToReply")
  reactions Reaction[]
  reported  Boolean    @default(false)
  hidden    Boolean    @default(false)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Reaction {
  id       String  @id @default(cuid())
  emoji    String  // "👍", "❤️", "🎉", "🤔", "🙏"
  userId   String
  threadId String?
  thread   Thread? @relation(fields: [threadId], references: [id])
  replyId  String?
  reply    Reply?  @relation(fields: [replyId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, threadId, emoji])
  @@unique([userId, replyId, emoji])
}

model Bookmark {
  id       String  @id @default(cuid())
  userId   String
  threadId String
  thread   Thread  @relation(fields: [threadId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, threadId])
}

model ThreadFollower {
  userId   String
  threadId String
  thread   Thread  @relation(fields: [threadId], references: [id])
  createdAt DateTime @default(now())

  @@id([userId, threadId])
}

model Reputation {
  id          String   @id @default(cuid())
  userId      String
  points      Int      // positive or negative
  reason      String   // "thread_created", "reply_helpful", "answer_accepted", "post_reported"
  referenceId String?  // threadId or replyId that earned points
  createdAt   DateTime @default(now())

  @@index([userId])
}
```

## Step 2 — Reputation System: Points for Helpful Answers

```typescript
// src/lib/reputation.ts — Award reputation points for community actions.
// Points accumulate in a ledger (Reputation table); user score is the sum.

import { db } from "@/lib/db";

const POINT_VALUES = {
  thread_created: 2,
  reply_posted: 1,
  reaction_received: 1,    // Someone reacted to your post
  answer_accepted: 15,     // Your reply was marked as the solution
  reported_removed: -5,    // Your post was removed after reports
} as const;

type ReputationReason = keyof typeof POINT_VALUES;

export async function awardPoints(
  userId: string,
  reason: ReputationReason,
  referenceId?: string
) {
  const points = POINT_VALUES[reason];
  await db.reputation.create({
    data: { userId, points, reason, referenceId },
  });
}

export async function getUserScore(userId: string): Promise<number> {
  const result = await db.reputation.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}

export async function getLeaderboard(limit = 10) {
  // Aggregate in DB — one query for top users
  const scores = await db.reputation.groupBy({
    by: ["userId"],
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: limit,
  });
  return scores.map((s) => ({ userId: s.userId, score: s._sum.points ?? 0 }));
}
```

```typescript
// src/app/api/threads/[threadId]/replies/[replyId]/accept/route.ts
// Thread author marks a reply as the accepted answer (like Stack Overflow).
// Awards 15 reputation points to the reply author.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardPoints } from "@/lib/reputation";
import { notifyAnswerAccepted } from "@/lib/notifications";

export async function POST(
  _req: Request,
  { params }: { params: { threadId: string; replyId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await db.thread.findUniqueOrThrow({ where: { id: params.threadId } });

  // Only thread author can accept an answer
  if (thread.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reply = await db.reply.findUniqueOrThrow({ where: { id: params.replyId } });

  await db.thread.update({
    where: { id: params.threadId },
    data: { solved: true, solvedReplyId: params.replyId },
  });

  // Award points to the reply author
  await awardPoints(reply.authorId, "answer_accepted", params.replyId);

  // Notify them
  await notifyAnswerAccepted(reply.authorId, thread.id);

  return NextResponse.json({ ok: true });
}
```

## Step 3 — Reactions with Optimistic UI

```typescript
// src/app/api/threads/[threadId]/react/route.ts — Toggle emoji reactions.
// Toggling the same emoji removes it (like/unlike pattern).
// Award 1 rep point to the content author on new reactions.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardPoints } from "@/lib/reputation";

export async function POST(
  req: Request,
  { params }: { params: { threadId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emoji } = await req.json();
  const ALLOWED_EMOJIS = ["👍", "❤️", "🎉", "🤔", "🙏"];
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  const existing = await db.reaction.findUnique({
    where: {
      userId_threadId_emoji: { userId: session.user.id, threadId: params.threadId, emoji },
    },
  });

  if (existing) {
    // Remove reaction
    await db.reaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: "removed" });
  }

  // Add reaction
  await db.reaction.create({
    data: { userId: session.user.id, threadId: params.threadId, emoji },
  });

  // Award rep to thread author (but not if reacting to own post)
  const thread = await db.thread.findUniqueOrThrow({ where: { id: params.threadId } });
  if (thread.authorId !== session.user.id) {
    await awardPoints(thread.authorId, "reaction_received", params.threadId);
  }

  return NextResponse.json({ action: "added" });
}
```

## Step 4 — Moderation: Report, Hide, Ban

```typescript
// src/app/api/replies/[replyId]/report/route.ts — Report a post.
// Three reports from different users auto-hides the post pending review.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const AUTO_HIDE_THRESHOLD = 3;

export async function POST(
  req: Request,
  { params }: { params: { replyId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reason } = await req.json();

  // Count existing reports on this reply
  const reportCount = await db.report.count({ where: { replyId: params.replyId } });

  await db.report.upsert({
    where: { userId_replyId: { userId: session.user.id, replyId: params.replyId } },
    create: { userId: session.user.id, replyId: params.replyId, reason },
    update: {},
  });

  // Auto-hide if threshold reached
  if (reportCount + 1 >= AUTO_HIDE_THRESHOLD) {
    await db.reply.update({
      where: { id: params.replyId },
      data: { hidden: true },
    });
  }

  return NextResponse.json({ ok: true });
}
```

```typescript
// src/app/api/admin/users/[userId]/ban/route.ts — Ban a user (admin only).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await auth();
  const currentUser = await db.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  if (currentUser.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.user.update({
    where: { id: params.userId },
    data: { banned: true, bannedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
```

## Step 5 — Email Digest and Thread Follow Notifications

```typescript
// src/lib/notifications.ts — Send notifications via Resend.
// Immediate: reply to followed thread. Weekly: digest of top activity.

import { Resend } from "resend";
import { db } from "@/lib/db";
import { ThreadReplyEmail } from "@/emails/ThreadReplyEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function notifyThreadFollowers(threadId: string, replyId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    include: {
      followers: {
        include: { thread: false },
      },
    },
  });

  const reply = await db.reply.findUniqueOrThrow({
    where: { id: replyId },
    include: { author: { select: { name: true } } },
  });

  // Get emails for all followers except the reply author
  const followerIds = thread.followers
    .map((f) => f.userId)
    .filter((id) => id !== reply.authorId);

  if (followerIds.length === 0) return;

  const users = await db.user.findMany({
    where: { id: { in: followerIds }, emailNotifications: true },
    select: { id: true, email: true, name: true },
  });

  // Batch send with Resend (up to 100 at once)
  await resend.batch.send(
    users.map((user) => ({
      from: "community@your-saas.com",
      to: user.email,
      subject: `New reply in: ${thread.title}`,
      react: ThreadReplyEmail({
        userName: user.name ?? "there",
        threadTitle: thread.title,
        replyAuthor: reply.author.name ?? "Someone",
        replyBody: reply.body.slice(0, 200),
        threadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/forum/threads/${threadId}`,
        unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      }),
    }))
  );
}

export async function sendWeeklyDigest() {
  // Top 5 threads by reply count in the last 7 days
  const topThreads = await db.thread.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    orderBy: { replyCount: "desc" },
    take: 5,
    include: { category: true },
  });

  const subscribers = await db.user.findMany({
    where: { weeklyDigest: true },
    select: { email: true, name: true },
  });

  await resend.batch.send(
    subscribers.map((user) => ({
      from: "community@your-saas.com",
      to: user.email,
      subject: "This week in the community 🗣️",
      react: WeeklyDigestEmail({ userName: user.name ?? "there", threads: topThreads }),
    }))
  );
}
```

## Results

Sofia shipped the forum in a week and moved her Slack community over.

- **Cost: ~$10/month** (Resend free tier covers 3,000 emails/month; Prisma on Neon free tier). Compared to Discourse's $300/month, she saved $290/month from day one.
- **Search SEO** — forum threads are indexed by Google. "How do I X with [product]?" questions now rank on page 1, bringing in 40 signups/month from organic search. Slack's private history had zero SEO value.
- **Reputation** drives quality — the top 10% of contributors (by karma) answer 60% of questions. Public leaderboard creates healthy competition.
- **Moderation** — auto-hide at 3 reports catches spam before Sofia sees it. She reviews the hidden posts queue every morning (usually 2–3 items).
- **Email digest** open rate: 34% — much higher than typical product newsletters because it's content users asked for.
