---
title: "Build a Q&A Knowledge Platform"
description: "Build a Stack Overflow-style Q&A community — questions, answers, upvotes, tags, reputation, full-text search, and a weekly digest email — for your developer community."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "8 hours"
tags: [community, q-and-a, forum, reputation, search, email, knowledge-base]
---

# Build a Q&A Knowledge Platform

**Persona:** You're building a developer community around your SaaS. Users keep asking the same questions in Slack. You want a structured knowledge base where answers accumulate, get upvoted, and stay searchable — like Stack Overflow but for your niche.

## What You'll Build

- **Questions with tags, upvotes, accepted answers**
- **Markdown editor with syntax highlighting**
- **Full-text search with tag filtering**
- **Reputation system**: Earn XP for accepted answers, lose it for downvotes
- **Weekly digest email**: Top questions in your subscribed tags

---

## 1. Prisma Schema

```prisma
model Question {
  id          String   @id @default(cuid())
  title       String
  body        String   @db.Text  // Markdown
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  tags        Tag[]
  answers     Answer[]
  votes       Vote[]
  views       Int      @default(0)
  score       Int      @default(0)
  answered    Boolean  @default(false)
  acceptedAnswerId String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([score])
}

model Answer {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id])
  body       String   @db.Text
  authorId   String
  author     User     @relation(fields: [authorId], references: [id])
  accepted   Boolean  @default(false)
  score      Int      @default(0)
  votes      Vote[]
  createdAt  DateTime @default(now())
}

model Vote {
  id         String    @id @default(cuid())
  userId     String
  value      Int       // +1 or -1
  questionId String?
  answerId   String?
  question   Question? @relation(fields: [questionId], references: [id])
  answer     Answer?   @relation(fields: [answerId], references: [id])
  createdAt  DateTime  @default(now())
  @@unique([userId, questionId])
  @@unique([userId, answerId])
}

model Tag {
  id          String     @id @default(cuid())
  name        String     @unique
  description String?
  questions   Question[]
  subscribers TagSubscription[]
}

model TagSubscription {
  userId    String
  tagId     String
  tag       Tag    @relation(fields: [tagId], references: [id])
  @@id([userId, tagId])
}

model Reputation {
  userId  String @id
  score   Int    @default(0)
  @@index([score])
}
```

---

## 2. Ask a Question API

```typescript
// app/api/questions/route.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await auth(req);
  const { title, body, tags } = await req.json();

  // Create or find tags
  const tagRecords = await Promise.all(
    tags.map((name: string) =>
      prisma.tag.upsert({
        where: { name: name.toLowerCase() },
        create: { name: name.toLowerCase() },
        update: {}
      })
    )
  );

  const question = await prisma.question.create({
    data: {
      title,
      body,
      authorId: user.id,
      tags: { connect: tagRecords.map(t => ({ id: t.id })) }
    },
    include: { tags: true, author: { select: { name: true } } }
  });

  return Response.json(question);
}
```

---

## 3. Voting & Reputation

```typescript
// app/api/vote/route.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const REPUTATION_RULES = {
  questionUpvote: 5,
  questionDownvote: -2,
  answerUpvote: 10,
  answerDownvote: -2,
  answerAccepted: 15,
};

export async function POST(req: Request) {
  const user = await auth(req);
  const { questionId, answerId, value } = await req.json(); // value: 1 or -1

  if (![-1, 1].includes(value)) {
    return Response.json({ error: "Invalid vote value" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // Upsert the vote
    const existing = await tx.vote.findFirst({
      where: { userId: user.id, questionId: questionId ?? null, answerId: answerId ?? null }
    });

    const previousValue = existing?.value ?? 0;

    if (existing) {
      if (existing.value === value) {
        // Undo vote
        await tx.vote.delete({ where: { id: existing.id } });
      } else {
        await tx.vote.update({ where: { id: existing.id }, data: { value } });
      }
    } else {
      await tx.vote.create({ data: { userId: user.id, questionId, answerId, value } });
    }

    // Update score on question/answer
    const scoreDelta = value - previousValue;
    
    if (questionId) {
      const question = await tx.question.update({
        where: { id: questionId },
        data: { score: { increment: scoreDelta } },
        select: { authorId: true }
      });
      
      const repDelta = value > 0 ? REPUTATION_RULES.questionUpvote : REPUTATION_RULES.questionDownvote;
      await tx.reputation.upsert({
        where: { userId: question.authorId },
        create: { userId: question.authorId, score: repDelta },
        update: { score: { increment: repDelta } }
      });
    }

    if (answerId) {
      const answer = await tx.answer.update({
        where: { id: answerId },
        data: { score: { increment: scoreDelta } },
        select: { authorId: true }
      });

      const repDelta = value > 0 ? REPUTATION_RULES.answerUpvote : REPUTATION_RULES.answerDownvote;
      await tx.reputation.upsert({
        where: { userId: answer.authorId },
        create: { userId: answer.authorId, score: repDelta },
        update: { score: { increment: repDelta } }
      });
    }
  });

  return Response.json({ success: true });
}
```

---

## 4. Full-Text Search

```typescript
// app/api/search/route.ts
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const tags = url.searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const sort = url.searchParams.get("sort") ?? "score"; // score | newest | unanswered

  // PostgreSQL full-text search
  const questions = await prisma.$queryRaw`
    SELECT q.id, q.title, q.score, q.views, q."answered", q."createdAt",
           ts_rank(to_tsvector('english', q.title || ' ' || q.body), plainto_tsquery('english', ${q})) AS rank,
           u.name as "authorName",
           array_agg(DISTINCT t.name) as tags
    FROM "Question" q
    JOIN "User" u ON u.id = q."authorId"
    LEFT JOIN "_QuestionToTag" qt ON qt."A" = q.id
    LEFT JOIN "Tag" t ON t.id = qt."B"
    WHERE (${q} = '' OR to_tsvector('english', q.title || ' ' || q.body) @@ plainto_tsquery('english', ${q}))
    ${tags.length > 0 ? prisma.$queryRaw`AND t.name = ANY(${tags})` : prisma.$queryRaw``}
    GROUP BY q.id, u.name
    ORDER BY ${sort === "newest" ? prisma.$queryRaw`q."createdAt" DESC` : 
              sort === "unanswered" ? prisma.$queryRaw`q.answered ASC, q."createdAt" DESC` :
              prisma.$queryRaw`rank DESC, q.score DESC`}
    LIMIT 20
  `;

  return Response.json(questions);
}
```

---

## 5. Weekly Digest Email

```typescript
// scripts/send-weekly-digest.ts (run via cron)
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendWeeklyDigests() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Get all tag subscribers
  const subscriptions = await prisma.tagSubscription.findMany({
    include: { tag: true },
  });

  // Group by userId
  const byUser = subscriptions.reduce((acc, sub) => {
    if (!acc[sub.userId]) acc[sub.userId] = [];
    acc[sub.userId].push(sub.tag.name);
    return acc;
  }, {} as Record<string, string[]>);

  for (const [userId, subscribedTags] of Object.entries(byUser)) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) continue;

    const topQuestions = await prisma.question.findMany({
      where: {
        createdAt: { gte: oneWeekAgo },
        tags: { some: { name: { in: subscribedTags } } }
      },
      orderBy: { score: "desc" },
      take: 5,
      include: { tags: true, _count: { select: { answers: true } } }
    });

    if (topQuestions.length === 0) continue;

    const questionsHtml = topQuestions.map(q => `
      <div style="margin-bottom: 20px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <a href="${process.env.BASE_URL}/q/${q.id}" style="font-weight: bold; color: #2563eb; text-decoration: none;">
          ${q.title}
        </a>
        <p style="color: #6b7280; margin: 8px 0 0;">
          ${q._count.answers} answers · ${q.score} votes · 
          Tags: ${q.tags.map(t => t.name).join(", ")}
        </p>
      </div>
    `).join("");

    await resend.emails.send({
      from: "Community Digest <digest@yourdomain.com>",
      to: user.email,
      subject: `📬 This week's top questions in ${subscribedTags.join(", ")}`,
      html: `
        <h2>Your weekly digest</h2>
        <p>Top questions this week in your subscribed tags:</p>
        ${questionsHtml}
        <p><a href="${process.env.BASE_URL}/settings/subscriptions">Manage subscriptions</a></p>
      `
    });
  }
}
```

---

## Result

Your community knowledge platform:
- Accumulates answers that get better over time through voting
- Reduces support load — link to canonical answers instead of explaining repeatedly
- Full-text search finds answers instantly across thousands of posts
- Reputation system naturally promotes your best community contributors
- Weekly digest email brings users back every week on autopilot
